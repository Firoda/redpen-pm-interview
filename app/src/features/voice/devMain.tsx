/* Standalone entry for voice QA: open /voice-dev.html on a dev server.
 * Not part of the app bundle (index.html → src/main.tsx). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import VoicePlayground from './VoicePlayground'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VoicePlayground />
  </StrictMode>,
)
