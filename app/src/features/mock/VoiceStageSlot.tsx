/* Wraps the VOICE agent's <VoiceStage> in an error boundary so a voice crash degrades to a calm
 * "switch to text" panel instead of taking the interview room down. */
import { Component, type ReactNode } from 'react'
import { Keyboard } from 'lucide-react'
import { VoiceStage, type VoiceStageProps } from '@/features/voice/VoiceStage'
import { Button } from '@/ui'

export type { VoiceStageProps }

function Unavailable({ onSwitchToText, message }: { onSwitchToText: () => void; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="h-[120px] w-[120px] rounded-full shadow-[inset_0_0_0_2px_var(--border-strong)]" aria-hidden />
      <p className="mt-6 max-w-[40ch] text-callout text-secondary">{message}</p>
      <Button className="mt-4" variant="secondary" icon={Keyboard} onClick={onSwitchToText}>Switch to text</Button>
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode; onCrash: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { this.props.onCrash(e) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function VoiceStageSlot(props: VoiceStageProps) {
  return (
    <Boundary
      onCrash={(e) => console.error('[mock] VoiceStage crashed', e)}
      fallback={<Unavailable onSwitchToText={props.onSwitchToText} message="Voice stopped working. Your transcript is safe; switch to text to keep going." />}
    >
      <VoiceStage {...props} />
    </Boundary>
  )
}
