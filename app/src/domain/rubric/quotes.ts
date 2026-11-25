/* Quote verification and repair (§6.6) plus quote selection helpers. Interviewer turns can never be quoted. */
import type { MockSession, Turn } from '@/domain/types'
import { bigramJaccard, clauses, normalise, sentences, stripEndPunct, trimWords, wordCount } from '@/domain/text'

export type QuoteCheck =
  | { status: 'verified'; quote: string; turnId: string }
  | { status: 'corrected'; quote: string; turnId: string } // found in a different candidate turn
  | { status: 'repaired'; quote: string; turnId: string } // replaced with the real span (fuzzy)
  | { status: 'unverified' }

function candidateTurnsOf(session: Pick<MockSession, 'turns'>): Turn[] {
  return session.turns.filter((t) => t.role === 'candidate' && t.text.trim().length > 0)
}

/** Find the original-text span of turn `t` whose normalised words equal `targetWords` (best effort). */
function originalSpan(text: string, start: number, len: number): string {
  // map normalised word positions back to raw tokens
  const raw = text.split(/\s+/).filter(Boolean)
  const map: number[] = [] // normalised word index → raw token index
  raw.forEach((tok, i) => {
    const n = normalise(tok)
    if (!n) return
    n.split(' ').forEach(() => map.push(i))
  })
  const a = map[start], b = map[Math.min(start + len - 1, map.length - 1)]
  if (a == null || b == null) return ''
  return stripEndPunct(raw.slice(a, b + 1).join(' ').replace(/^["'“‘(]+/, '').replace(/["'”’)]+$/, ''))
}

export function verifyQuote(session: Pick<MockSession, 'turns'>, quote: string, turnId?: string): QuoteCheck {
  const q = normalise(quote)
  const turns = candidateTurnsOf(session)
  if (!q || !turns.length) return { status: 'unverified' }
  const own = turns.find((t) => t.id === turnId)
  if (own && normalise(own.text).includes(q)) return { status: 'verified', quote: quote.trim(), turnId: own.id }
  const other = turns.find((t) => normalise(t.text).includes(q))
  if (other) return { status: 'corrected', quote: quote.trim(), turnId: other.id }

  // fuzzy: slide a window of (quote length ± 3 words) over every candidate turn
  const qWords = q.split(' ')
  const qLen = qWords.length
  let best = { score: 0, turn: null as Turn | null, start: 0, len: 0 }
  for (const t of turns) {
    const tw = normalise(t.text).split(' ')
    for (let len = Math.max(2, qLen - 3); len <= qLen + 3; len++) {
      for (let i = 0; i + len <= tw.length; i++) {
        const span = tw.slice(i, i + len).join(' ')
        const s = bigramJaccard(span, q)
        if (s > best.score) best = { score: s, turn: t, start: i, len }
      }
    }
  }
  if (best.turn && best.score >= 0.75) {
    const span = originalSpan(best.turn.text, best.start, best.len)
    if (span && normalise(best.turn.text).includes(normalise(span))) return { status: 'repaired', quote: span, turnId: best.turn.id }
  }
  return { status: 'unverified' }
}

/** Normalised substring check against all candidate turns (used by the interviewer validator). */
export function isCandidateQuote(session: Pick<MockSession, 'turns'>, phrase: string): boolean {
  const p = normalise(phrase)
  if (!p) return false
  return candidateTurnsOf(session).some((t) => normalise(t.text).includes(p))
}

/** Fit a sentence into a 4–25 word quote. Long sentences are cut to the clause that contains `focus`
 *  (or the first clause), then trimmed at a word boundary. Always returns a substring of `sentence`. */
export function fitQuote(sentence: string, focus?: RegExp, max = 25, min = 4): string {
  let s = stripEndPunct(sentence)
  if (wordCount(s) > max || (focus && wordCount(s) > 16)) {
    const cs = clauses(s)
    if (cs.length > 1) {
      let pick = focus ? cs.find((c) => focus.test(c)) : undefined
      if (pick && wordCount(stripEndPunct(pick)) < min) {
        // extend with the following clause so the quote still reads
        const i = cs.indexOf(pick)
        const joined = cs.slice(i, i + 2).join(' ')
        if (sentence.includes(joined)) pick = joined
      }
      if (pick && wordCount(stripEndPunct(pick)) >= min && s.includes(stripEndPunct(pick))) s = stripEndPunct(pick)
      else if (wordCount(s) > max) {
        // no focus clause: keep as many leading clauses as fit
        let acc = ''
        for (const c of cs) {
          const next = acc ? `${acc} ${c}` : c
          if (wordCount(next) > max) break
          acc = next
        }
        if (wordCount(acc) >= min && s.includes(stripEndPunct(acc))) s = stripEndPunct(acc)
      }
    }
  }
  if (wordCount(s) > max) s = stripEndPunct(trimWords(s, max))
  return s
}

/** All sentences of the candidate's answer turns (kinds main/followup_a by default). */
export function answerSentences(session: Pick<MockSession, 'turns'>, kinds: Turn['kind'][] = ['main', 'followup_a']): { text: string; turnId: string; kind: Turn['kind']; followupIndex?: number }[] {
  const out: { text: string; turnId: string; kind: Turn['kind']; followupIndex?: number }[] = []
  for (const t of session.turns) {
    if (t.role !== 'candidate' || !kinds.includes(t.kind)) continue
    for (const s of sentences(t.text)) out.push({ text: s, turnId: t.id, kind: t.kind, followupIndex: t.followupIndex })
  }
  return out
}
