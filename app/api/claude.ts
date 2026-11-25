/* Redpen — thin Anthropic proxy (Vercel Node.js serverless function, no dependencies).
 *
 * Setting the key: in the Vercel dashboard open the project → Settings → Environment Variables, add
 * ANTHROPIC_API_KEY with your key (sk-ant-…), tick Production (and Preview if you want it there), save, then
 * redeploy so the function picks it up (or run `vercel env add ANTHROPIC_API_KEY`). The key lives only on the
 * server; the browser calls POST /api/claude with a Messages API body and gets the Messages API response back.
 * In the app, open Settings → Interviewer and grader → Claude and turn on "Use server key" (settings.ai.useProxy). This function exists only on
 * the Vercel deployment; `vite` dev does not serve it (use `vercel dev` to try it locally).
 *
 * Guard rails: POST only, same-origin requests only, the three Redpen model ids only, max_tokens capped at 8000,
 * request bodies over 200 KB rejected, only known body fields forwarded, only allow-listed beta flags forwarded.
 * Owner: LIVE_AI agent. Kept plain-typed so it needs no @vercel/node types and is outside the app's tsconfig. */

const UPSTREAM = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2026-10-21' // same version the bundled @anthropic-ai/sdk sends
const ALLOWED_MODELS = new Set(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
const ALLOWED_BETAS = new Set(['server-side-fallback-2026-07-01'])
const FORWARDED_FIELDS = ['model', 'max_tokens', 'system', 'messages', 'thinking', 'output_config', 'fallbacks', 'cache_control'] as const
const MAX_TOKENS_CAP = 8000
const MAX_BODY_BYTES = 200_000
const UPSTREAM_TIMEOUT_MS = 58_000

type Json = Record<string, unknown>

interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  on(event: 'data', cb: (chunk: Uint8Array | string) => void): void
  on(event: 'end' | 'error', cb: (err?: unknown) => void): void
}
interface Res {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

function send(res: Res, status: number, body: Json | string, extraHeaders: Record<string, string> = {}): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v)
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function fail(res: Res, status: number, type: string, message: string, extra: Record<string, string> = {}): void {
  send(res, status, { type: 'error', error: { type, message } }, extra)
}

function header(req: Req, name: string): string | undefined {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

/** Vercel's Node helpers usually parse JSON into req.body; fall back to reading the stream with a size cap. */
async function readBody(req: Req): Promise<{ ok: true; value: unknown } | { ok: false; status: number; message: string }> {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') {
      if (req.body.length > MAX_BODY_BYTES) return { ok: false, status: 413, message: 'Request body too large.' }
      try { return { ok: true, value: JSON.parse(req.body) } } catch { return { ok: false, status: 400, message: 'Body is not valid JSON.' } }
    }
    if (JSON.stringify(req.body).length > MAX_BODY_BYTES) return { ok: false, status: 413, message: 'Request body too large.' }
    return { ok: true, value: req.body }
  }
  const raw = await new Promise<string | null>((resolve, reject) => {
    let size = 0
    let data = ''
    let tooBig = false
    req.on('data', (chunk) => {
      const s = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
      size += s.length
      if (size > MAX_BODY_BYTES) tooBig = true
      else data += s
    })
    req.on('end', () => resolve(tooBig ? null : data))
    req.on('error', (e) => reject(e))
  })
  if (raw === null) return { ok: false, status: 413, message: 'Request body too large.' }
  try { return { ok: true, value: JSON.parse(raw) } } catch { return { ok: false, status: 400, message: 'Body is not valid JSON.' } }
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Use POST.', { allow: 'POST' })

  // Same-origin only: a browser on another site cannot spend this key.
  const origin = header(req, 'origin')
  const host = header(req, 'x-forwarded-host') ?? header(req, 'host')
  if (origin) {
    let originHost = ''
    try { originHost = new URL(origin).host } catch { /* malformed */ }
    if (!host || originHost !== host) return fail(res, 403, 'forbidden_origin', 'Cross-origin requests are not allowed.')
  }

  const len = Number(header(req, 'content-length') ?? 0)
  if (len > MAX_BODY_BYTES) return fail(res, 413, 'request_too_large', 'Request body too large.')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fail(res, 500, 'proxy_not_configured', 'ANTHROPIC_API_KEY is not set on the server.')

  const parsed = await readBody(req)
  if (!parsed.ok) return fail(res, parsed.status, 'invalid_request_error', parsed.message)
  const body = parsed.value as Json
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'invalid_request_error', 'Body must be a JSON object.')

  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) {
    return fail(res, 400, 'invalid_request_error', `Model not allowed. Use one of: ${[...ALLOWED_MODELS].join(', ')}.`)
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return fail(res, 400, 'invalid_request_error', 'messages must be a non-empty array.')
  const maxTokens = typeof body.max_tokens === 'number' && body.max_tokens > 0 ? Math.min(Math.floor(body.max_tokens), MAX_TOKENS_CAP) : 1024

  let betas: string[] = []
  if (body.betas !== undefined) {
    if (!Array.isArray(body.betas) || !body.betas.every((b) => typeof b === 'string' && ALLOWED_BETAS.has(b))) {
      return fail(res, 400, 'invalid_request_error', 'Beta flag not allowed.')
    }
    betas = body.betas as string[]
  }

  const clean: Json = {}
  for (const f of FORWARDED_FIELDS) if (body[f] !== undefined) clean[f] = body[f]
  clean.max_tokens = maxTokens

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {}),
      },
      body: JSON.stringify(clean),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (e) {
    const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError'
    return fail(res, timedOut ? 504 : 502, timedOut ? 'timeout_error' : 'api_error', timedOut ? 'Upstream timed out.' : 'Could not reach the Anthropic API.')
  }

  const text = await upstream.text()
  const pass: Record<string, string> = {}
  for (const h of ['retry-after', 'retry-after-ms', 'request-id']) {
    const v = upstream.headers.get(h)
    if (v) pass[h] = v
  }
  send(res, upstream.status, text || JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Empty upstream response.' } }), pass)
}
