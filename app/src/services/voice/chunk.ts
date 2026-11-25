/* Pure text helpers for TTS: sentence chunking (≤ 180 chars) and word spans.
 * Chunks keep their offset into the original text so boundary events map back. */

export interface TextChunk {
  text: string
  /** Offset of `text[0]` in the original string. */
  start: number
}

export const MAX_CHUNK = 180

/** Split into sentences, keeping offsets. A sentence ends at . ! ? … followed by whitespace (or end). */
export function splitSentences(text: string): TextChunk[] {
  const out: TextChunk[] = []
  const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0].length === 0) { re.lastIndex++; continue }
    pushTrimmed(out, m[0], m.index)
  }
  return mergeAbbreviations(out, text)
}

/** Chunk text for speechSynthesis: sentence ends first, then clause punctuation, then word boundaries. */
export function chunkText(text: string, max = MAX_CHUNK): TextChunk[] {
  const out: TextChunk[] = []
  for (const s of splitSentences(text)) {
    if (s.text.length <= max) { out.push(s); continue }
    for (const c of splitLong(s, max)) out.push(c)
  }
  return out
}

function splitLong(s: TextChunk, max: number): TextChunk[] {
  const out: TextChunk[] = []
  let rest = s.text
  let offset = s.start
  while (rest.length > max) {
    const window = rest.slice(0, max + 1)
    // prefer a clause break in the back half of the window
    let cut = -1
    for (const re of [/[,;:—–)](?=\s)/g, /\s/g]) {
      let m: RegExpExecArray | null
      let best = -1
      while ((m = re.exec(window))) if (m.index >= max * 0.4 && m.index < max) best = m.index
      if (best > 0) { cut = best + (re.source.startsWith('[') ? 1 : 0); break }
    }
    if (cut <= 0) cut = max // one enormous token: hard cut
    const head = rest.slice(0, cut)
    pushTrimmed(out, head, offset)
    offset += cut
    rest = rest.slice(cut)
  }
  pushTrimmed(out, rest, offset)
  return out
}

function pushTrimmed(out: TextChunk[], raw: string, start: number) {
  const lead = raw.length - raw.trimStart().length
  const t = raw.trim()
  if (t) out.push({ text: t, start: start + lead })
}

const ABBREV = /\b(?:e\.g|i\.e|vs|etc|mr|mrs|ms|dr|approx|no)\.$/i

/** Re-join splits made after common abbreviations ("e.g.", "vs.") or decimals ("2.5"). */
function mergeAbbreviations(parts: TextChunk[], text: string): TextChunk[] {
  const out: TextChunk[] = []
  for (const p of parts) {
    const prev = out[out.length - 1]
    if (prev) {
      const prevEnd = prev.start + prev.text.length
      const joined = text.slice(prev.start, p.start + p.text.length)
      const abbrev = ABBREV.test(prev.text)
      const decimal = /\d\.$/.test(prev.text) && /^\d/.test(p.text) && prevEnd === p.start
      const lowerNext = /^[a-z]/.test(p.text)
      if (abbrev || decimal || lowerNext) { out[out.length - 1] = { text: joined.trim(), start: prev.start }; continue }
    }
    out.push(p)
  }
  return out
}

export interface WordSpan { start: number; end: number; text: string }

/** Word spans (non-whitespace runs) with offsets. */
export function wordSpans(text: string): WordSpan[] {
  const out: WordSpan[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
  return out
}

/** Estimated speaking time for a chunk at a given rate (used for the stuck-queue watchdog). */
export function watchdogMs(chars: number, rate = 1): number {
  return Math.round((chars * 120) / Math.max(0.5, rate) + 2000)
}

/** Approximate characters spoken per second at rate 1 (≈ 165 wpm). */
export const CHARS_PER_SEC = 14.5
