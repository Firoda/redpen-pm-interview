/* KeyStore — where the user's own Anthropic API key lives in the browser.
 * Default: sessionStorage (gone when the tab closes). "Remember on this device": localStorage.
 * The key never goes into IndexedDB, exports, analytics or logs. Owner: LIVE_AI agent. */

const KEY_NAME = 'redpen.anthropicKey'

function storage(kind: 'session' | 'local'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null // storage blocked (private mode, sandboxed iframe)
  }
}

function read(kind: 'session' | 'local'): string | null {
  try {
    const v = storage(kind)?.getItem(KEY_NAME)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

function remove(kind: 'session' | 'local'): void {
  try { storage(kind)?.removeItem(KEY_NAME) } catch { /* ignore */ }
}

export const KeyStore = {
  /** Session key wins over a remembered key (the user may have pasted a new one for this tab). */
  get(): string | null {
    return read('session') ?? read('local')
  },
  /** Stores the key in exactly one place: localStorage when `remember`, otherwise sessionStorage. */
  set(key: string, remember: boolean): void {
    const k = key.trim()
    if (!k) { KeyStore.forget(); return }
    remove('session')
    remove('local')
    try { storage(remember ? 'local' : 'session')?.setItem(KEY_NAME, k) } catch { /* quota or blocked */ }
  },
  forget(): void {
    remove('session')
    remove('local')
  },
  has(): boolean {
    return KeyStore.get() !== null
  },
  /** Where the current key is stored, for the Settings screen. */
  where(): 'session' | 'local' | null {
    if (read('session')) return 'session'
    if (read('local')) return 'local'
    return null
  },
}
