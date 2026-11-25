/* Transport for the live AI: one function that sends a Messages API request and returns the Messages API response.
 *  - browser: the official @anthropic-ai/sdk with the user's own key (dangerouslyAllowBrowser), SDK retries off
 *  - proxy:   POST /api/claude (Vercel function holding ANTHROPIC_API_KEY), same body and response shape
 * Every failure leaves here as an LLMError with a kind the resilient layer can act on. Owner: LIVE_AI agent. */
import type Anthropic from '@anthropic-ai/sdk'
import { LLMError } from '@/ai/types'
import { MessageResponseSchema, type MessageResponse } from './schemas'

export const LIVE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const
export type LiveModel = (typeof LIVE_MODELS)[number]

/** Beta flags the proxy is allowed to forward. */
export const ALLOWED_BETAS = ['server-side-fallback-2026-07-01'] as const

export interface MessagesRequest {
  model: LiveModel
  max_tokens: number
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  messages: { role: 'user'; content: string }[]
  thinking?: { type: 'disabled' } | { type: 'adaptive' }
  output_config: { effort: 'low' | 'medium' | 'high'; format?: { type: 'json_schema'; schema: Record<string, unknown> } }
  /** Server-side refusal fallback (beta server-side-fallback-2026-07-01). */
  fallbacks?: 'default'
}

export interface CallSpec {
  body: MessagesRequest
  betas?: string[]
}

export interface CallOptions {
  signal?: AbortSignal
  timeoutMs: number
}

export type Transport = (spec: CallSpec, opts: CallOptions) => Promise<MessageResponse>

/* ---------------- deadlines ---------------- */

/** Combines the caller's signal with our own per-attempt deadline. */
export function withDeadline(outer: AbortSignal | undefined, timeoutMs: number) {
  const ctrl = new AbortController()
  let timedOut = false
  const onAbort = () => ctrl.abort(outer?.reason)
  if (outer?.aborted) ctrl.abort(outer.reason)
  else outer?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(new Error('timeout')) }, timeoutMs)
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done: () => { clearTimeout(timer); outer?.removeEventListener('abort', onAbort) },
  }
}

/* ---------------- error mapping ---------------- */

function retryAfterMs(headers: { get(name: string): string | null } | undefined): number | undefined {
  if (!headers) return undefined
  const ms = headers.get('retry-after-ms')
  if (ms && !Number.isNaN(Number(ms))) return Number(ms)
  const s = headers.get('retry-after')
  if (!s || Number.isNaN(Number(s))) return undefined // the API sends seconds; the HTTP-date form is ignored
  return Number(s) * 1000
}

export function mapHttpError(status: number, headers: { get(name: string): string | null } | undefined, message: string, errorType?: string): LLMError {
  if (errorType === 'proxy_not_configured') return new LLMError('auth', 'The server has no Anthropic key configured.', status)
  if (status === 401 || status === 403) return new LLMError('auth', 'The API key was rejected.', status)
  if (status === 429) return new LLMError('rate_limit', 'Rate limited by the API.', status, retryAfterMs(headers))
  if (status === 529) return new LLMError('overloaded', 'The API is overloaded.', status, retryAfterMs(headers))
  if (status === 408 || status === 504) return new LLMError('timeout', 'The API timed out.', status)
  if (status >= 500) return new LLMError('overloaded', `Server error ${status}.`, status, retryAfterMs(headers))
  return new LLMError('unknown', message || `Request failed with status ${status}.`, status)
}

function isAbort(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'APIUserAbortError' || name === 'TimeoutError'
}

/* ---------------- browser SDK transport ---------------- */

type SdkModule = typeof import('@anthropic-ai/sdk')
let sdkPromise: Promise<SdkModule> | null = null
const loadSdk = () => (sdkPromise ??= import('@anthropic-ai/sdk'))
const clients = new Map<string, Anthropic>()

export function sdkTransport(getKey: () => string | null): Transport {
  return async (spec, opts) => {
    const key = getKey()
    if (!key) throw new LLMError('no_key', 'Add your Anthropic API key in Settings to use the live interviewer.')
    const sdk = await loadSdk()
    let client = clients.get(key)
    if (!client) {
      client = new sdk.default({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 })
      clients.clear() // one key at a time
      clients.set(key, client)
    }
    const dl = withDeadline(opts.signal, opts.timeoutMs)
    try {
      const reqOpts = { signal: dl.signal, timeout: opts.timeoutMs + 1000 }
      const res = spec.betas?.length
        ? await client.beta.messages.create({ ...(spec.body as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming), betas: spec.betas }, reqOpts)
        : await client.messages.create(spec.body as unknown as Anthropic.MessageCreateParamsNonStreaming, reqOpts)
      return MessageResponseSchema.parse(res)
    } catch (e) {
      if (e instanceof LLMError) throw e
      if (dl.timedOut() || isAbort(e) || e instanceof sdk.APIUserAbortError) throw new LLMError('timeout', 'The request was cancelled or timed out.')
      if (e instanceof sdk.APIConnectionTimeoutError) throw new LLMError('timeout', 'The request timed out.')
      if (e instanceof sdk.APIConnectionError) throw new LLMError('network', 'Could not reach the Anthropic API.')
      if (e instanceof sdk.APIError && typeof e.status === 'number') {
        const type = (e.error as { error?: { type?: string } } | undefined)?.error?.type
        throw mapHttpError(e.status, e.headers, e.message, type)
      }
      throw new LLMError('unknown', e instanceof Error ? e.message : 'Unknown error from the SDK.')
    } finally {
      dl.done()
    }
  }
}

/* ---------------- proxy transport ---------------- */

export function proxyTransport(endpoint = '/api/claude', fetchImpl: typeof fetch = (...a) => fetch(...a)): Transport {
  return async (spec, opts) => {
    const dl = withDeadline(opts.signal, opts.timeoutMs)
    try {
      let res: Response
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(spec.betas?.length ? { ...spec.body, betas: spec.betas } : spec.body),
          signal: dl.signal,
        })
      } catch (e) {
        if (dl.timedOut() || isAbort(e)) throw new LLMError('timeout', 'The request was cancelled or timed out.')
        throw new LLMError('network', 'Could not reach the Redpen server.')
      }
      let json: unknown = null
      try { json = await res.json() } catch {
        if (dl.timedOut()) throw new LLMError('timeout', 'The request timed out.')
        if (res.ok) throw new LLMError('schema', 'The server returned something that is not JSON.')
      }
      if (!res.ok) {
        const err = (json as { error?: { type?: string; message?: string } } | null)?.error
        if (res.status === 404 && !err) throw new LLMError('network', 'The /api/claude function is not deployed here.', 404)
        throw mapHttpError(res.status, res.headers, err?.message ?? '', err?.type)
      }
      const parsed = MessageResponseSchema.safeParse(json)
      if (!parsed.success) throw new LLMError('schema', 'The server response did not look like a Messages API response.')
      return parsed.data
    } finally {
      dl.done()
    }
  }
}
