/* VoiceService contract (MASTER_PLAN §10.4). Browser speech only: Web Speech
 * recognition for input, speechSynthesis for the interviewer. No audio is stored. */

export type VoiceLang = 'en-IN' | 'en-US' | 'en-GB'

export interface VoiceSupport {
  /** Speech-to-text available (Chrome: webkitSpeechRecognition). */
  stt: boolean
  /** Text-to-speech available (speechSynthesis). */
  tts: boolean
}

export type MicStatus = 'ok' | 'denied' | 'no_device' | 'unsupported'

/** Errors surfaced while listening. `no_speech` is a soft hint (3 silent restarts in a row). */
export type ListenErrorKind = 'mic_denied' | 'no_device' | 'unsupported' | 'network' | 'no_speech'

export interface ListenError {
  kind: ListenErrorKind
  /** True when listening has stopped because of the error (everything except `no_speech`). */
  fatal: boolean
  message: string
  /** Everything recognised before the error, so a fallback to text can keep it. */
  partial: string
}

export interface ListenOptions {
  lang: VoiceLang | string
  /** Interim (not yet final) words, plus everything finalised so far. */
  onInterim?: (interim: string, finalSoFar: string) => void
  /** A newly finalised segment, plus everything finalised so far (including it). */
  onFinal?: (segment: string, finalSoFar: string) => void
  /** Smoothed mic level 0..1 at animation-frame rate. */
  onLevel?: (level: number) => void
  onError?: (error: ListenError) => void
}

export interface ListenHandle {
  /** Stop listening and resolve with the full accumulated transcript. */
  stop(): Promise<string>
  /** Stop immediately and discard everything. */
  abort(): void
  /** Number of automatic recognition restarts so far (for `stt_session{restarts}`). */
  restarts(): number
}

export interface BoundaryInfo {
  /** Character index into the ORIGINAL text passed to speak(). */
  charIndex: number
  charLength: number
  /** True when the browser gave no boundary events and the position is estimated from time. */
  estimated: boolean
}

export interface SpeakOptions {
  voiceURI?: string
  lang?: VoiceLang | string
  rate?: number
  /** Synthetic speaking level 0..1 at animation-frame rate (speechSynthesis has no audio tap). */
  onLevel?: (level: number) => void
  onBoundary?: (b: BoundaryInfo) => void
  /** Fired once when audio actually starts. */
  onStart?: () => void
  /** TTS failed or produced no audio (E-19). `done` still resolves. */
  onError?: (message: string) => void
}

export interface SpeakHandle {
  /** Resolves when speech finishes, fails or is cancelled. Never rejects. */
  done: Promise<void>
  cancel(): void
  /** Resolves true when the first chunk starts producing audio, false if it never does. */
  firstAudio: Promise<boolean>
}

export interface VoiceService {
  support(): VoiceSupport
  checkMic(): Promise<MicStatus>
  listen(opts: ListenOptions): ListenHandle
  speak(text: string, opts?: SpeakOptions): SpeakHandle
  cancelSpeech(): void
  /** English voices, best first (for a Settings picker). Empty until voices load. */
  voices(): Promise<SpeechSynthesisVoice[]>
}
