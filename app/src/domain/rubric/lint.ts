/* Fix lint (§6.7): strip softeners and praise from fix text. More than two hits flags a repair. */

const BANNED: RegExp[] = [
  /\bgreat\b/gi, /\bnice\b/gi, /\bwell done\b/gi, /\bexcellent\b/gi, /\bimpressive\b/gi, /\bawesome\b/gi, /\bgood job\b/gi,
  /\byou might want to\b/gi, /\byou may want to\b/gi, /\bconsider\b/gi, /\bmaybe\b/gi, /\bperhaps\b/gi, /\bpossibly\b/gi,
  /\btry to\b/gi, /\bjust\b/gi, /\bsimply\b/gi, /\ba little\b/gi, /\bslightly\b/gi,
]

export function lintFixText(s: string): { text: string; hits: number } {
  let hits = 0
  let out = s
  for (const re of BANNED) {
    out = out.replace(re, () => { hits++; return '' })
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[\s,;:]+/, '').trim()
  if (out) out = out[0].toUpperCase() + out.slice(1)
  return { text: out, hits }
}
