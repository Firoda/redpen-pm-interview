/* Pure text helpers shared by the grader, quote verification, the scripted interviewer and upload detection. */

export function wordCount(s: string): number {
  const t = s.trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

/** normalise(s): lowercase → unify curly/straight quotes and dashes → drop punctuation except % and ₹ → collapse whitespace (§6.6). */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/'/g, '') // "I'd" → "id" so contractions compare equal regardless of quote style
    .replace(/[^\p{L}\p{N}%₹\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normWords(s: string): string[] {
  const n = normalise(s)
  return n ? n.split(' ') : []
}

/** Split into sentences, keeping the original text of each (trimmed). */
export function sentences(s: string): string[] {
  const out: string[] = []
  const re = /[^.!?\n]+(?:[.!?]+["'”’)]*|\n|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const t = m[0].trim()
    if (t && /[\p{L}\p{N}]/u.test(t)) out.push(t)
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return out
}

/** Split a sentence further at clause boundaries (, ; : —) — used to trim quotes to a word budget. */
export function clauses(s: string): string[] {
  return s.split(/(?<=[,;:—])\s+|\s+[—-]\s+/).map((c) => c.trim()).filter(Boolean)
}

/** Trim text at a word boundary to at most `max` words, removing trailing punctuation that dangles. */
export function trimWords(s: string, max: number): string {
  const ws = s.trim().split(/\s+/).filter(Boolean)
  if (ws.length <= max) return s.trim()
  return ws.slice(0, max).join(' ').replace(/[,;:—-]+$/, '').trim()
}

export function stripEndPunct(s: string): string {
  return s.trim().replace(/[\s,;:—-]+$/, '').trim()
}

export function bigrams(ws: string[]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < ws.length - 1; i++) out.add(ws[i] + ' ' + ws[i + 1])
  if (ws.length === 1) out.add(ws[0])
  return out
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  a.forEach((x) => { if (b.has(x)) inter++ })
  return inter / (a.size + b.size - inter)
}

export function bigramJaccard(a: string, b: string): number {
  return jaccard(bigrams(normWords(a)), bigrams(normWords(b)))
}

export const STOPWORDS = new Set(
  ('a an the and or but if then so of to in on at for from by with without about into over under is are was were be been being ' +
    'i im id ill ive me my we our us you your yours he she it its they them their this that these those there here what which who whom ' +
    'how why when where would could should will can may might must do does did done have has had not no yes very just also too more most ' +
    'some any all each every one two own same such than as up down out off again further once only both few other new get got make made ' +
    'like really thing things lot lots way want need going go let lets say said see look well first then now still even much many us')
    .split(' '),
)

export function contentWords(s: string): string[] {
  return normWords(s).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
}

/** Very small stemmer so "settled"/"settlement"/"settle" overlap. */
export function stem(w: string): string {
  if (w.length <= 3) return w
  let s = w
  if (/ies$/.test(s)) s = s.slice(0, -3) + 'y'
  else if (/(ss|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2)
  else if (/[^su]s$/.test(s)) s = s.slice(0, -1)
  if (s.length > 5) s = s.replace(/(ations?|ments?|ness|ingly|ing|edly|ed|ly)$/, '')
  else if (s.length > 4) s = s.replace(/(ing|ed)$/, '')
  s = s.replace(/e$/, '')
  return s.slice(0, 7)
}

export function stemSet(s: string): Set<string> {
  return new Set(contentWords(s).map(stem).filter((w) => w.length >= 2))
}

/** Normalised similarity in [0,1] (bigram Jaccard on normalised words; exact match = 1). */
export function similarity(a: string, b: string): number {
  const na = normalise(a), nb = normalise(b)
  if (!na && !nb) return 1
  if (na === nb) return 1
  return bigramJaccard(na, nb)
}

/** Count occurrences of any of the regex patterns (each pattern counted once per match). */
export function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0
  for (const p of patterns) {
    const g = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g')
    const m = text.match(g)
    if (m) n += m.length
  }
  return n
}

export function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

/** Keyword hit for lexicon entries that are plain phrases (case-insensitive, word-boundary-ish). */
export function phraseIn(textNorm: string, phrase: string): boolean {
  const p = normalise(phrase)
  if (!p) return false
  return (' ' + textNorm + ' ').includes(' ' + p + ' ') || (p.length >= 5 && textNorm.includes(p))
}
