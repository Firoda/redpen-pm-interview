/* Templated interviewer lines (code owns these; no model). Meera: concise, neutral, no praise. */
import type { DimensionId, FollowUpSeed, MockLength, TopicId } from '@/domain/types'

export const INTERVIEWER_NAME = 'Meera'

export function introLine(opts: { firstName?: string; length: MockLength; followups: number; isRetry: boolean; focusText?: string }): string {
  const hi = opts.firstName ? `Hi ${opts.firstName}, I'm Meera.` : "Hi, I'm Meera."
  if (opts.isRetry) return `${hi} This is a retry of a question you've seen. Same question, same bar. Take a moment, then answer when you're ready.`
  return `${hi} I'll ask you one question, then ${opts.followups} follow-ups. Ask a clarifying question first if you need one.`
}

export function questionLine(prompt: string, setup?: string): string {
  return setup ? `${setup.trim()} ${prompt.trim()}` : prompt.trim()
}

export function closeLine(firstName?: string): string {
  return `That's time. Thanks${firstName ? `, ${firstName}` : ''}. Your feedback will be ready in under two minutes.`
}

export const EXPAND_LINE = 'Can you expand on that?'
export const REFRAME_LINE = "That's fine. How would you reason about it, and what's your best guess?"
export const ASSUME_LINE = 'Make a reasonable assumption and state it.'
export const NO_MORE_CLARIFY_LINE = "Let's keep going. Make a reasonable assumption and state it."
export const HINT_USED_LINE = "Let's keep going. Make your best call."
export const ANSWER_REQUEST_LINE = "Let's hold that for your feedback. How would you decide?"
export const SCORE_REQUEST_LINE = "We'll go through that at the end. Carry on with your answer."
export const MOVE_ON_PREFIX = "Okay, let's move on."

export const HINT_LINES: Record<DimensionId, string> = {
  structure: 'What would your first step be, before any detail?',
  userFocus: 'Which user would you start with?',
  prioritisation: 'If you could do only one thing here, which would it be?',
  metrics: 'What single number would tell you this worked?',
  communication: "What's your answer in one line?",
}

export function redirectLine(question: string): string {
  return `Let's bring it back to the question. ${question}`
}

export function injectionLine(question: string): string {
  return `Let's stay with the case. ${question}`
}

/** Generic follow-up seeds (§7.3): uploads and the safety net when a question's own seeds are spent. */
export function genericSeeds(topic: TopicId): FollowUpSeed[] {
  const seeds: FollowUpSeed[] = [
    { id: 'gen-structure', probes: 'structure', text: "Before we go further, what's your overall approach in three steps?" },
    { id: 'gen-userFocus', probes: 'userFocus', text: "Who exactly is the user you're solving for, and what do they struggle with today?" },
    { id: 'gen-prioritisation', probes: 'prioritisation', text: 'You mentioned several options. Which one would you pick, and what would you drop?' },
    { id: 'gen-metrics', probes: 'metrics', text: 'How would you measure whether this worked? Give me one number and one guardrail.' },
    { id: 'gen-communication', probes: 'communication', text: 'Summarise your answer for a busy VP in two sentences.' },
    { id: 'gen-variant', probes: 'structure', isVariantSlot: true, text: "Let's change one thing: {variant}. What changes in your answer?" },
  ]
  if (topic === 'guesstimate') {
    seeds[0] = { id: 'gen-structure', probes: 'structure', text: 'Which assumption drives your answer most, and how confident are you in it?' }
    seeds[3] = { id: 'gen-metrics', probes: 'metrics', text: 'How would you sanity-check that number against something you know?' }
  }
  if (topic === 'rca') {
    seeds[2] = { id: 'gen-prioritisation', probes: 'prioritisation', text: 'Of the causes you listed, which would you check first, and why that one?' }
    seeds[3] = { id: 'gen-metrics', probes: 'metrics', text: 'Which data cut would confirm or rule out your top hypothesis?' }
  }
  if (topic === 'tech') {
    seeds[1] = { id: 'gen-userFocus', probes: 'userFocus', text: 'How would you explain this to a business stakeholder who has never written code?' }
    seeds[3] = { id: 'gen-metrics', probes: 'metrics', text: 'What would you measure to know the system is working well at scale?' }
  }
  return seeds
}

/** Generic seeds given to uploaded questions at save time. */
export function uploadSeeds(topic: TopicId, uploadQuestionId: string): FollowUpSeed[] {
  return genericSeeds(topic).map((s) => ({ ...s, id: `${uploadQuestionId}-${s.id}` }))
}
