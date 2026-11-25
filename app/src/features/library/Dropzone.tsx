/* Upload dropzone (F09): drag and drop or choose a PDF, DOCX, TXT or MD file, or paste text.
 * Validates type and size up front, then asks the engine for a preview. Spec: MASTER_PLAN §4.10, doc 01 §5.20. */
import { useRef, useState, type DragEvent } from 'react'
import { ClipboardPaste, Upload } from 'lucide-react'
import { previewPaste, previewUpload, type UploadPreview } from '@/engine/api'
import { Analytics } from '@/services/analytics'
import { Button, Textarea, cx } from '@/ui'

const OK = ['pdf', 'docx', 'txt', 'md'] as const
const MAX = 10 * 1024 * 1024

function check(file: File): string | null {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!(OK as readonly string[]).includes(ext)) {
    return ext && ext !== file.name.toLowerCase()
      ? `That's a .${ext} file. Use PDF, DOCX, TXT or MD, or paste the text.`
      : 'Use a PDF, DOCX, TXT or MD file, or paste the text.'
  }
  if (file.size > MAX) return 'That file is over 10 MB. Split it, or paste the questions.'
  if (file.size === 0) return 'That file is empty.'
  return null
}

export function Dropzone({ onPreview, compact, initialPaste }: { onPreview: (p: UploadPreview) => void; compact?: boolean; initialPaste?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(initialPaste ? '' : null)

  const handle = async (file: File) => {
    setError(null)
    const bad = check(file)
    if (bad) {
      setError(bad)
      void Analytics.track('upload_failed', { errorType: bad.includes('10 MB') ? 'too_large' : file.size === 0 ? 'empty' : 'bad_type', bytes: file.size })
      return
    }
    setBusy(`Reading ${file.name}`)
    try {
      onPreview(await previewUpload(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that file. Try a text PDF or paste the questions.")
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ''
    }
  }

  const submitPaste = async () => {
    if (!paste?.trim()) return
    setError(null)
    setBusy('Finding questions')
    try {
      onPreview(await previewPaste(paste))
      setPaste(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't find questions in that text.")
    } finally {
      setBusy(null)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void handle(f)
  }

  if (paste !== null) {
    return (
      <div className="rounded-lg bg-surface p-4 shadow-1 animate-rise">
        <Textarea
          autoFocus
          rows={8}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste questions, one per line, or a whole case."
          className="text-callout"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submitPaste() } }}
        />
        {error ? <p className="mt-2 text-footnote text-danger">{error}</p> : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-footnote text-tertiary">Stays in this browser.</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setPaste(null); setError(null) }}>Cancel</Button>
            <Button size="sm" onClick={submitPaste} loading={!!busy} disabled={!paste.trim()} kbd="⌘↵">Find questions</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
        onDrop={onDrop}
        className={cx(
          'flex flex-col items-center justify-center rounded-lg border-[1.5px] px-6 text-center transition-colors duration-150',
          compact ? 'min-h-[120px] py-6' : 'min-h-[180px] py-8',
          over ? 'border-solid border-accent bg-accent-subtle' : 'border-dashed border-border-strong bg-surface',
        )}
      >
        {busy ? (
          <div className="flex w-full max-w-[280px] flex-col items-center gap-3" role="status">
            <span className="text-callout text-primary">{busy}…</span>
            <div className="skeleton h-1 w-full rounded-full" />
          </div>
        ) : (
          <>
            <Upload size={20} strokeWidth={1.75} className={over ? 'text-accent' : 'text-secondary'} />
            <div className="mt-3 text-headline text-primary">Drop a casebook or question list</div>
            <div className="mt-1 text-footnote text-secondary">PDF, DOCX, TXT or MD · up to 10 MB · stays in this browser</div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={() => input.current?.click()}>Choose file</Button>
              <Button size="sm" variant="ghost" icon={ClipboardPaste} onClick={() => { setPaste(''); setError(null) }}>Paste text</Button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f) }}
        />
      </div>
      {error ? (
        <p className="mt-2 text-footnote text-danger" role="alert">
          {error}{' '}
          <button className="font-medium text-accent hover:underline" onClick={() => { setPaste(''); setError(null) }}>Paste text instead</button>
        </p>
      ) : null}
    </div>
  )
}
