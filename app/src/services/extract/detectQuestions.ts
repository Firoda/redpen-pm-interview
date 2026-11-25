/* Heuristic question detection for uploads and pastes (§4.10). Offline, deterministic. */
import type { TopicId } from '@/domain/types'
import { bigramJaccard, normalise, wordCount } from '@/domain/text'

export interface DetectedQuestion { prompt: string; topic: TopicId; caseText?: string; confidence: 'high' | 'medium' | 'low' }

const TOPIC_LEXICON: [TopicId, RegExp][] = [
  ['guesstimate', /\b(estimate|how many|market size|size the market|number of|guesstimate|how much (revenue|money)|tam)\b/i],
  ['rca', /\b(dropped|declined|fell|fall|spike|spiked|drop|decrease|decline|went down|increase(d)? by|surged|root cause|why (did|has|have|is))\b/i],
  ['metrics', /\b(metrics?|measure|north star|kpis?|success of|a\/b test|experiment|guardrail)\b/i],
  ['tech', /\b(api|latency|database|server|llm|machine learning|\bml\b|algorithm|cache|backend|how does .{1,40} work|what happens when|explain .{1,30} to)\b/i],
  ['strategy', /\b(enter|entry|compete|competitor|pricing|price|acquire|acquisition|should .{1,40} (launch|enter|build|buy)|monetis|monetiz|partner|expand into|go[- ]to[- ]market)\b/i],
  ['product_design', /\b(design|build|improve|create|feature for|product for|app for|redesign)\b/i],
]

export function guessTopic(text: string): TopicId {
  for (const [t, re] of TOPIC_LEXICON) if (re.test(text)) return t
  return 'product_design'
}

const NUMBERED = /^\s*(?:Q(?:uestion)?\s*\d+[.):-]?|\d{1,3}\s*[.)\]:-]|[•\-*–]|\(\w\))\s+/i
const HEADER = /^\s*(?:case(?:\s+(?:study\s+)?\d+)?|question(?:\s+\d+)?|guesstimate(?:\s+\d+)?|rca(?:\s+\d+)?|problem(?:\s+\d+)?)\s*[:.\-–—]\s*/i
const HEADER_ONLY = /^\s*(?:case(?:\s+study)?|question|guesstimate|rca|problem)\s*\d*\s*[:.\-–—]?\s*$/i

function clean(line: string): string {
  return line.replace(NUMBERED, '').replace(HEADER, '').replace(/\s+/g, ' ').trim()
}

function looksLikeAsk(s: string): boolean {
  const w = wordCount(s)
  if (w < 4 || w > 60) return false
  return /\?\s*$/.test(s) || /^(how|what|why|should|design|estimate|improve|build|create|explain|imagine|you are|you're|walk me|tell me|if you|which|would you|measure|prioriti[sz]e|define)\b/i.test(s)
}

/** Split text into candidate questions. Casebooks ("Case 1: …" + body) become one question with caseText. */
export function detectQuestions(text: string): DetectedQuestion[] {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim())
  const out: DetectedQuestion[] = []

  // 1) Case blocks: a "Case …" header followed by a body until the next header.
  const caseIdx = lines.map((l, i) => (/^\s*case(\s+(study\s+)?\d+)?\s*[:.\-–—]/i.test(l) || /^\s*case(\s+study)?\s+\d+\s*$/i.test(l) ? i : -1)).filter((i) => i >= 0)
  if (caseIdx.length >= 1) {
    caseIdx.forEach((start, k) => {
      const end = caseIdx[k + 1] ?? lines.length
      const block = lines.slice(start, end)
      const head = clean(block[0])
      const body = block.slice(1).join('\n').trim()
      const sentences = (head + ' ' + body).split(/(?<=[.?!])\s+/).map((s) => s.trim())
      const ask = sentences.find((s) => /\?\s*$/.test(s) && wordCount(s) <= 40) ?? (head && wordCount(head) >= 4 ? head : sentences.find((s) => looksLikeAsk(s)))
      if (!ask) return
      out.push({ prompt: ask.trim(), topic: guessTopic(head + ' ' + ask + ' ' + body.slice(0, 400)), caseText: body ? body.slice(0, 6000) : undefined, confidence: /\?\s*$/.test(ask) ? 'high' : 'medium' })
    })
    if (out.length) return dedupeWithin(out)
  }

  // 2) Line-level: numbered items, "Question:" headers, lines ending in "?". Wrapped lines are joined.
  let buf = ''
  const flush = () => {
    const s = clean(buf)
    buf = ''
    if (!s || HEADER_ONLY.test(s)) return
    if (looksLikeAsk(s)) out.push({ prompt: s, topic: guessTopic(s), confidence: /\?\s*$/.test(s) ? 'high' : 'medium' })
  }
  for (const line of lines) {
    if (!line) { flush(); continue }
    if (NUMBERED.test(line) || HEADER.test(line)) { flush(); buf = line; if (/\?\s*$/.test(line)) flush(); continue }
    if (HEADER_ONLY.test(line)) { flush(); continue }
    buf = buf ? `${buf} ${line}` : line
    if (/\?\s*$/.test(line)) flush()
  }
  flush()
  return dedupeWithin(out)
}

function dedupeWithin(qs: DetectedQuestion[]): DetectedQuestion[] {
  const seen = new Set<string>()
  return qs.filter((q) => {
    const k = promptKey(q.prompt)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Normalised prompt key (lowercase, alphanumerics only) for duplicate detection. */
export function promptKey(s: string): string {
  return normalise(s).replace(/[^a-z0-9]/g, '')
}

/** Id of an existing question with the same or a near-identical prompt, if any. */
export function findDuplicate(prompt: string, existing: { id: string; prompt: string }[]): string | undefined {
  const k = promptKey(prompt)
  for (const q of existing) {
    if (promptKey(q.prompt) === k) return q.id
  }
  for (const q of existing) {
    if (bigramJaccard(prompt, q.prompt) >= 0.7) return q.id
  }
  return undefined
}
