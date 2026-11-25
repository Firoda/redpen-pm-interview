/* Synthetic speaking envelope for the orb. speechSynthesis exposes no audio, so we
 * shape a plausible amplitude from word boundary events: each word "kicks" a fast
 * attack / slower release envelope, layered with a syllable-rate wobble and low
 * noise so the pulse never looks mechanical. Pure: time is passed in (seconds). */

export class SpeechEnvelope {
  private env = 0          // word envelope 0..1
  private target = 0       // attack target after a kick
  private out = 0          // smoothed output
  private active = false   // inside an utterance
  private seed: number

  constructor(seed = 0.37) { this.seed = seed }

  /** A word started. `weight` ~ word length (longer words hit a touch harder). */
  kick(weight = 1) {
    const w = Math.min(1.25, 0.65 + 0.12 * weight)
    this.target = Math.max(this.target, w * (0.78 + 0.22 * this.rand()))
  }

  setActive(on: boolean) { this.active = on; if (!on) this.target = 0 }

  /** Advance by dt seconds at absolute time t; returns level 0..1. */
  tick(t: number, dt: number): number {
    dt = Math.min(0.1, Math.max(0, dt))
    // attack toward target quickly, then the target itself decays (release)
    const attack = 1 - Math.exp(-dt / 0.035)
    this.env += (this.target - this.env) * attack
    this.target *= Math.exp(-dt / 0.16)

    let raw = 0
    if (this.active) {
      // syllable-rate wobble (≈ 4–6 Hz) and slow phrase swell, only while voiced
      const syll = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 4.7 + Math.sin(t * 1.3) * 1.4)
      const phrase = 0.75 + 0.25 * Math.sin(t * 0.9 + this.seed * 6)
      const noise = 0.5 + 0.5 * Math.sin(t * 17.3 + this.seed * 11) * Math.sin(t * 7.1)
      raw = this.env * (0.62 + 0.28 * syll + 0.1 * noise) * phrase + 0.08 * phrase
    } else {
      raw = this.env * 0.6
    }
    const k = 1 - Math.exp(-dt / (raw > this.out ? 0.045 : 0.12))
    this.out += (raw - this.out) * k
    return Math.max(0, Math.min(1, this.out))
  }

  private rand() {
    // deterministic LCG so tests are stable
    this.seed = (this.seed * 9301 + 0.49297) % 1
    return this.seed
  }
}

/** Map RMS of a time-domain buffer (−1..1 floats) to a perceptual 0..1 level. */
export function rmsToLevel(rms: number): number {
  if (rms <= 0) return 0
  // ~-60 dBFS → 0, ~-12 dBFS → 1
  const db = 20 * Math.log10(rms)
  return Math.max(0, Math.min(1, (db + 60) / 48))
}

export function rms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / Math.max(1, buf.length))
}
