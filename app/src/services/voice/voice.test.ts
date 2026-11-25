import { describe, expect, it } from 'vitest'
import { chunkText, splitSentences, watchdogMs, wordSpans } from './chunk'
import { SpeechEnvelope, rmsToLevel } from './envelope'
import { pickVoice, rankVoices, type VoiceLike } from './voices'
import { NullVoiceService } from './VoiceService'

describe('splitSentences', () => {
  it('splits at sentence ends and keeps offsets into the original text', () => {
    const t = 'You said splits per day. What if splits drop?  Walk me through it!'
    const s = splitSentences(t)
    expect(s.map((x) => x.text)).toEqual(['You said splits per day.', 'What if splits drop?', 'Walk me through it!'])
    for (const c of s) expect(t.slice(c.start, c.start + c.text.length)).toBe(c.text)
  })

  it('does not split on decimals or common abbreviations', () => {
    const s = splitSentences('Retention fell 2.5 points, e.g. in Pune. Why?')
    expect(s.map((x) => x.text)).toEqual(['Retention fell 2.5 points, e.g. in Pune.', 'Why?'])
  })

  it('handles text without terminal punctuation', () => {
    expect(splitSentences('Tell me more').map((x) => x.text)).toEqual(['Tell me more'])
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('chunkText', () => {
  it('keeps every chunk at or under the limit and loses no words', () => {
    const long = 'You mentioned that the main metric is the number of splits created per day, and that you would track it weekly across cohorts, regions, and payment methods, ' +
      'but you did not say what a healthy number looks like for a new feature in a crowded market where most users already split bills in chat apps and settle later by cash. ' +
      'How would you decide?'
    const chunks = chunkText(long)
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(180)
      expect(long.slice(c.start, c.start + c.text.length)).toBe(c.text)
    }
    expect(chunks.map((c) => c.text).join(' ').split(/\s+/)).toEqual(long.split(/\s+/))
  })

  it('prefers clause punctuation over arbitrary word breaks', () => {
    const t = 'a'.repeat(100) + ', ' + 'b '.repeat(60) + 'end.'
    const [first] = chunkText(t)
    expect(first.text.endsWith(',')).toBe(true)
  })

  it('hard-cuts a single enormous token', () => {
    const t = 'x'.repeat(400)
    const chunks = chunkText(t)
    expect(chunks.every((c) => c.text.length <= 180)).toBe(true)
    expect(chunks.map((c) => c.text).join('')).toBe(t)
  })
})

describe('wordSpans / watchdog', () => {
  it('returns word offsets', () => {
    expect(wordSpans(' hi  there')).toEqual([{ start: 1, end: 3, text: 'hi' }, { start: 5, end: 10, text: 'there' }])
  })
  it('scales the watchdog with length and rate', () => {
    expect(watchdogMs(100)).toBe(14000)
    expect(watchdogMs(100, 2)).toBe(8000)
  })
})

const V = (name: string, lang: string, localService = true): VoiceLike => ({ name, lang, voiceURI: name, localService })

describe('voice ranking', () => {
  const voices = [
    V('Alex', 'en-US'),
    V('Rishi', 'en-IN'),
    V('Daniel', 'en-GB'),
    V('Google US English', 'en-US', false),
    V('Samantha', 'en-US'),
    V('Google UK English Female', 'en-GB', false),
    V('Amélie', 'fr-CA'),
    V('Zarvox', 'en-US'),
  ]

  it('orders by the natural-voice preference list and drops non-English', () => {
    expect(rankVoices(voices).map((v) => v.name)).toEqual([
      'Google UK English Female', 'Google US English', 'Samantha', 'Daniel', 'Rishi', 'Alex', 'Zarvox',
    ])
  })

  it('honours an explicit voiceURI and falls back when it is missing', () => {
    expect(pickVoice(voices, { voiceURI: 'Alex' })?.name).toBe('Alex')
    expect(pickVoice(voices, { voiceURI: 'Gone' })?.name).toBe('Google UK English Female')
    expect(pickVoice([V('Amélie', 'fr-CA')])).toBeNull()
  })

  it('prefers en-IN over generic local voices', () => {
    expect(pickVoice([V('Alex', 'en-US'), V('Veena', 'en_IN')])?.name).toBe('Veena')
  })
})

describe('SpeechEnvelope', () => {
  it('rises after word kicks and decays to silence', () => {
    const env = new SpeechEnvelope(0.5)
    env.setActive(true)
    let t = 0
    let peak = 0
    for (let i = 0; i < 60; i++) { if (i % 15 === 0) env.kick(1.5); t += 1 / 60; peak = Math.max(peak, env.tick(t, 1 / 60)) }
    expect(peak).toBeGreaterThan(0.3)
    expect(peak).toBeLessThanOrEqual(1)
    env.setActive(false)
    let last = 1
    for (let i = 0; i < 120; i++) { t += 1 / 60; last = env.tick(t, 1 / 60) }
    expect(last).toBeLessThan(0.02)
  })

  it('maps RMS to a 0..1 level', () => {
    expect(rmsToLevel(0)).toBe(0)
    expect(rmsToLevel(0.001)).toBe(0)
    expect(rmsToLevel(0.5)).toBe(1)
    expect(rmsToLevel(0.02)).toBeGreaterThan(0.2)
  })
})

describe('NullVoiceService', () => {
  it('reports no support and fails listen with unsupported', async () => {
    const v = new NullVoiceService()
    expect(v.support()).toEqual({ stt: false, tts: false })
    expect(await v.checkMic()).toBe('unsupported')
    const kinds: string[] = []
    const h = v.listen({ lang: 'en-IN', onError: (e) => kinds.push(e.kind) })
    await Promise.resolve()
    expect(kinds).toEqual(['unsupported'])
    expect(await h.stop()).toBe('')
    await v.speak('Hello').done
  })
})
