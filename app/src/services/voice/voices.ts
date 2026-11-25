/* Voice ranking: prefer natural-sounding English voices. Pure (works on plain objects). */

export interface VoiceLike {
  name: string
  lang: string
  voiceURI: string
  localService: boolean
  default?: boolean
}

/**
 * Higher is better. Order (spec): Google UK English Female › Google US English ›
 * Samantha › Daniel › any en-IN › local English › any English. Non-English → -1.
 * A small bonus for the user's recognition language breaks ties within a tier.
 */
export function rankVoice(v: VoiceLike, lang?: string): number {
  const name = v.name.toLowerCase()
  const vl = normLang(v.lang)
  if (!vl.startsWith('en')) return -1
  let score = 10
  if (name.includes('google uk english female')) score = 100
  else if (name.includes('google us english')) score = 90
  else if (/\bsamantha\b/.test(name)) score = 80
  else if (/\bdaniel\b/.test(name)) score = 75
  else if (vl === 'en-in') score = 60
  else if (v.localService) score = 40
  else score = 20
  // Novelty and robotic voices on macOS sound wrong for an interviewer.
  if (/\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy)\b/.test(name)) score = 1
  if (lang && vl === normLang(lang)) score += 3
  if (v.localService) score += 1
  return score
}

export function rankVoices<T extends VoiceLike>(voices: T[], lang?: string): T[] {
  return voices
    .map((v, i) => ({ v, i, s: rankVoice(v, lang) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v)
}

/** The explicit voiceURI wins if it exists; otherwise the best-ranked English voice. */
export function pickVoice<T extends VoiceLike>(voices: T[], opts: { voiceURI?: string; lang?: string } = {}): T | null {
  if (opts.voiceURI) {
    const exact = voices.find((v) => v.voiceURI === opts.voiceURI)
    if (exact) return exact
  }
  return rankVoices(voices, opts.lang)[0] ?? null
}

function normLang(l: string): string {
  return (l || '').replace('_', '-').toLowerCase()
}
