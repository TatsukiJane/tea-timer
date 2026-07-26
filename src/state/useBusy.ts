import { useSyncExternalStore } from 'react'

/**
 * "A step is currently running." The brew screen sets it; the update prompt reads it
 * so a service-worker update can never interrupt an infusion in progress.
 *
 * A module-level flag rather than context: exactly one screen writes it, and the
 * reader lives in the app shell above the router.
 */
let busy = false
const listeners = new Set<() => void>()

export function setTimerBusy(next: boolean): void {
  if (busy === next) return
  busy = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return busy
}

export function useTimerBusy(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
