/* Text extraction in the browser (§4.10): pdf.js for PDF, mammoth for DOCX, File.text() for TXT/MD.
   Heavy libraries are loaded on demand. Errors carry user-facing messages. */
import type { UserUpload } from '@/domain/types'

export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_PAGES = 200
export const MAX_CHARS = 300_000

export class ExtractError extends Error {
  constructor(public kind: 'unsupported' | 'too_large' | 'too_many_pages' | 'scanned' | 'password' | 'corrupt' | 'empty', message: string) { super(message) }
}

export const MESSAGES = {
  unsupported: 'Use PDF, DOCX, TXT or MD, or paste the text.',
  too_large: 'This file is over 10 MB. Split it into smaller files or paste the questions.',
  too_many_pages: 'This file has more than 200 pages. Split it into smaller files or paste the questions.',
  scanned: "This PDF looks scanned, so there's no text to read. Paste the text instead.",
  password: 'This PDF is password-protected. Remove the password or paste the text.',
  corrupt: "We couldn't read this file. It may be damaged. Try exporting it again or paste the text.",
  empty: "We couldn't find any text in this file. Paste the text instead.",
}

export function fileTypeOf(name: string, mime = ''): UserUpload['fileType'] | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (ext === 'txt' || mime === 'text/plain') return 'txt'
  if (ext === 'md' || ext === 'markdown' || mime === 'text/markdown') return 'md'
  return null
}

export interface Extracted { text: string; pages?: number; fileType: UserUpload['fileType']; warnings: string[] }

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Response(file).arrayBuffer()
}

async function extractPdf(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await readArrayBuffer(file)) }).promise
  } catch (e) {
    const name = (e as { name?: string })?.name ?? ''
    if (name === 'PasswordException') throw new ExtractError('password', MESSAGES.password)
    throw new ExtractError('corrupt', MESSAGES.corrupt)
  }
  if (doc.numPages > MAX_PAGES) throw new ExtractError('too_many_pages', MESSAGES.too_many_pages)
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) { parts.push(line); line = '' }
    }
    if (line) parts.push(line)
    parts.push('')
  }
  const text = parts.join('\n')
  if (text.replace(/\s/g, '').length < 50 * Math.min(doc.numPages, 3)) throw new ExtractError('scanned', MESSAGES.scanned)
  return { text, pages: doc.numPages }
}

async function extractDocx(file: File): Promise<string> {
  const mod = await import('mammoth')
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod
  try {
    const res = await (mammoth as unknown as { extractRawText(i: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> }).extractRawText({ arrayBuffer: await readArrayBuffer(file) })
    return res.value
  } catch {
    throw new ExtractError('corrupt', MESSAGES.corrupt)
  }
}

export async function extractText(file: File): Promise<Extracted> {
  const fileType = fileTypeOf(file.name, file.type)
  if (!fileType || fileType === 'paste') throw new ExtractError('unsupported', MESSAGES.unsupported)
  if (file.size > MAX_BYTES) throw new ExtractError('too_large', MESSAGES.too_large)
  const warnings: string[] = []
  let text = ''
  let pages: number | undefined
  if (fileType === 'pdf') ({ text, pages } = await extractPdf(file))
  else if (fileType === 'docx') text = await extractDocx(file)
  else text = typeof file.text === 'function' ? await file.text() : await new Response(file).text()
  if (!text.trim()) throw new ExtractError('empty', MESSAGES.empty)
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS)
    warnings.push('Only the first 300,000 characters were read. Split the file to bring in the rest.')
  }
  if (fileType === 'md') text = text.replace(/^#{1,6}\s+/gm, '').replace(/\*\*|__/g, '')
  return { text, pages, fileType, warnings }
}

export { detectQuestions, findDuplicate, guessTopic, promptKey } from './detectQuestions'
