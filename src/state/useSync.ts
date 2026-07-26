import { useCallback, useEffect, useState } from 'react'

import { getLastSyncAt } from '@/db/settings'
import { countPending } from '@/db/syncMeta'
import { isSyncConfigured, requestSync, type SyncReport } from '@/sync/syncService'

export type SyncStatus = 'unconfigured' | 'idle' | 'syncing'

const listeners = new Set<() => void>()

/** Called after any local write so the pending counter stays honest. */
export function notifySyncStateChanged(): void {
  for (const listener of listeners) listener()
}

export function useSync(): {
  status: SyncStatus
  pending: number
  lastSyncAt: string | undefined
  sync: () => Promise<SyncReport | undefined>
} {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [pending, setPending] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    const [configured, count, last] = await Promise.all([
      isSyncConfigured(),
      countPending(),
      getLastSyncAt(),
    ])
    setPending(count)
    setLastSyncAt(last)
    setStatus((current) => (current === 'syncing' ? current : configured ? 'idle' : 'unconfigured'))
  }, [])

  useEffect(() => {
    let alive = true
    const load = () => {
      void refresh().catch(() => undefined)
      if (!alive) return
    }
    load()
    listeners.add(load)
    // The pending count also changes when a background drain completes.
    window.addEventListener('online', load)
    return () => {
      alive = false
      listeners.delete(load)
      window.removeEventListener('online', load)
    }
  }, [refresh])

  const sync = useCallback(async () => {
    setStatus('syncing')
    try {
      return await requestSync()
    } finally {
      setStatus('idle')
      await refresh().catch(() => undefined)
    }
  }, [refresh])

  return { status, pending, lastSyncAt, sync }
}
