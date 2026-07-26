import { useCallback, useEffect, useState } from 'react'

import { deleteModeCascade, getMode, listModes, saveMode } from '@/db/modes'
import type { BrewMode } from '@/types/brew'

/**
 * A tiny store rather than a data-fetching library: there is one reader (the
 * list screen) and a handful of writers, all local and synchronous-ish. What
 * matters is that every screen sees the same array after a write, hence the
 * module-level subscriber set.
 */
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function useModes(): {
  modes: BrewMode[] | undefined
  reload: () => Promise<void>
} {
  const [modes, setModes] = useState<BrewMode[] | undefined>(undefined)

  const reload = useCallback(async () => {
    setModes(await listModes())
  }, [])

  useEffect(() => {
    let alive = true
    const load = () => {
      void listModes().then((next) => {
        if (alive) setModes(next)
      })
    }
    load()
    listeners.add(load)
    return () => {
      alive = false
      listeners.delete(load)
    }
  }, [])

  return { modes, reload }
}

export function useMode(id: string | undefined): {
  mode: BrewMode | undefined
  loading: boolean
} {
  const [mode, setMode] = useState<BrewMode | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id === undefined) {
      setMode(undefined)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    void getMode(id).then((found) => {
      if (!alive) return
      setMode(found)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id])

  return { mode, loading }
}

/** Persists a mode and tells every screen to re-read. Returns the stamped copy. */
export async function persistMode(mode: BrewMode): Promise<BrewMode> {
  const saved = await saveMode(mode)
  notify()
  return saved
}

export async function removeMode(id: string): Promise<void> {
  await deleteModeCascade(id)
  notify()
}

/** Called by the sync layer after a pull changes local records. */
export function notifyModesChanged(): void {
  notify()
}
