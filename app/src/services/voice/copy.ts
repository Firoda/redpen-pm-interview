/* User-facing voice error copy (MASTER_PLAN §4.12 E-05, E-06, E-11, E-18). */
import type { ListenErrorKind } from './types'

export const VOICE_COPY: Record<ListenErrorKind, string> = {
  mic_denied: "Microphone is blocked, so we've switched to typing. You can turn it back on from the lock icon in the address bar.",
  no_device: 'No microphone found. Plug one in or switch to text.',
  network: 'Voice needs internet in Chrome. Switched to text.',
  unsupported: 'Voice answers need Chrome on a computer. You can type instead.',
  no_speech: "I can't hear you. Check your mic or switch to text.",
}
