import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/**
 * Theme lives in localStorage, not IndexedDB — deliberately, and it is the only
 * setting that does. IndexedDB reads are async, so the first paint would happen
 * before the preference was known and a dark-mode user would get a white flash
 * on every launch. localStorage is synchronous, which lets the inline script in
 * index.html apply the class before the first paint.
 */
const STORAGE_KEY = 'tea-timer:theme'

const listeners = new Set<() => void>()
let pref: ThemePref = readStored()

function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    // Private mode / storage disabled: fall back to following the OS.
    return 'system'
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(p: ThemePref): ResolvedTheme {
  return p === 'system' ? systemTheme() : p
}

/** Applies the resolved theme to <html> and keeps the browser UI colour in step. */
export function applyTheme(p: ThemePref): void {
  const resolved = resolveTheme(p)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
}

export function setThemePref(next: ThemePref): void {
  pref = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not fatal — the theme just won't survive a reload.
  }
  applyTheme(next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ThemePref {
  return pref
}

export function useTheme(): {
  pref: ThemePref
  resolved: ResolvedTheme
  setPref: (next: ThemePref) => void
} {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // While following the OS, react to the OS changing under us.
  useEffect(() => {
    if (value !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyTheme('system')
      for (const listener of listeners) listener()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [value])

  const setPref = useCallback((next: ThemePref) => setThemePref(next), [])
  return { pref: value, resolved: resolveTheme(value), setPref }
}
