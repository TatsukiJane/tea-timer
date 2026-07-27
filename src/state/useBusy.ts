import { useSyncExternalStore } from 'react'

/**
 * "Something is going on that a page reload would ruin."
 *
 * Read by the auto-updater: a new build is applied by reloading the page, and there
 * are exactly two moments when that must not happen behind the user's back —
 * a running (or ringing) infusion, and an open editor holding unsaved text.
 *
 * A module-level flag set rather than context: the writers are single screens and
 * the reader lives in the app shell above the router.
 */
export type BusyReason = 'timer' | 'editor'

const active = new Set<BusyReason>()
const listeners = new Set<() => void>()

export function setBusy(reason: BusyReason, busy: boolean): void {
  const had = active.has(reason)
  if (had === busy) return
  if (busy) active.add(reason)
  else active.delete(reason)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return active.size > 0
}

export function useBusy(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
