/* Interviewer output validator (§6.5). Meera never praises, teaches, scores, or breaks role. */
import type { ValidateInterviewerLine } from '@/ai/types'
import type { TurnContext } from '@/domain/types'
import { bigramJaccard, wordCount } from '@/domain/text'
import { isCandidateQuote } from './quotes'

export const MAX_INTERVIEWER_WORDS = 45
/** Answering several clarifying questions in one reply needs a little more room. */
export const MAX_CLARIFY_WORDS = 75

const PRAISE = /\b(great|good point|good answer|good job|good thinking|excellent|nice|well done|impressive|correct|exactly right|that'?s right|not right|wrong|weak|strong answer|perfect|brilliant|awesome|love (that|this)|spot on|fantastic|amazing)\b/i
const TEACHING = /\b(a better answer|you should|you could have|consider using|the framework|for example,? you might|typically candidates|candidates usually|the right answer|the answer is|a good answer would|ideally you|circles|rice|heart|aarrr|mece)\b/i
const SCORES = /(\/\s?5\b|\bout of (5|five|10|ten)\b|\bscore\b|\brubric\b|\brating\b|\bgrade\b)/i
const OUT_OF_ROLE = /\b(as an ai|language model|i cannot|i can'?t help|i'?m an assistant|as a chatbot|openai|anthropic|claude)\b/i

/** Phrases inside quotation marks in an interviewer line. */
export function quotedPhrases(say: string): string[] {
  const out: string[] = []
  const re = /"([^"]{2,})"|“([^”]{2,})”|‘([^’]{3,})’/g
  let m: RegExpExecArray | null
  while ((m = re.exec(say))) out.push((m[1] ?? m[2] ?? m[3]).trim())
  return out
}

export const validateInterviewerLine: ValidateInterviewerLine = (say: string, ctx: TurnContext, opts) => {
  const text = (say ?? '').trim()
  const max = opts?.maxWords ?? MAX_INTERVIEWER_WORDS
  if (!text) return { ok: false, reason: 'empty' }
  if (wordCount(text) > max) return { ok: false, reason: `too long (${wordCount(text)} words, max ${max})` }
  if ((text.match(/\?/g) ?? []).length > 1) return { ok: false, reason: 'more than one question' }
  // Praise / teaching / scores are judged on the interviewer's own words, not on quoted candidate text.
  const own = text.replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, ' ')
  if (PRAISE.test(own)) return { ok: false, reason: 'praise or evaluation' }
  if (TEACHING.test(own)) return { ok: false, reason: 'teaching or model answer' }
  if (SCORES.test(own)) return { ok: false, reason: 'mentions a score' }
  if (OUT_OF_ROLE.test(own)) return { ok: false, reason: 'out of role' }
  for (const q of quotedPhrases(text)) {
    if (!isCandidateQuote(ctx.session, q)) return { ok: false, reason: `quote not said by the candidate: "${q}"` }
  }
  for (const t of ctx.session.turns) {
    if (t.role !== 'interviewer' || t.kind === 'intro' || t.kind === 'question') continue
    if (wordCount(t.text) >= 6 && bigramJaccard(t.text, text) >= 0.8) return { ok: false, reason: 'repeats an earlier line' }
  }
  return { ok: true }
}
