import { useCallback, useEffect, useState } from 'react'

import {
  DEFAULT_GITHUB,
  DEFAULT_PREFS,
  getGithubConfig,
  getPrefs,
  getToken,
  setGithubConfig as writeGithubConfig,
  setPrefs as writePrefs,
  setToken as writeToken,
  clearToken as wipeToken,
} from '@/db/settings'
import type { GithubConfig, Prefs } from '@/db/schema'

const prefsListeners = new Set<() => void>()
const configListeners = new Set<() => void>()

export function usePrefs(): {
  prefs: Prefs
  loaded: boolean
  update: (patch: Partial<Prefs>) => Promise<void>
} {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => {
      void getPrefs().then((next) => {
        if (!alive) return
        setPrefs(next)
        setLoaded(true)
      })
    }
    load()
    prefsListeners.add(load)
    return () => {
      alive = false
      prefsListeners.delete(load)
    }
  }, [])

  const update = useCallback(async (patch: Partial<Prefs>) => {
    const next = await writePrefs(patch)
    setPrefs(next)
    for (const listener of prefsListeners) listener()
  }, [])

  return { prefs, loaded, update }
}

export function useGithubSettings(): {
  config: GithubConfig
  /** Whether a token exists — the value itself is never held in component state. */
  hasToken: boolean
  loaded: boolean
  saveConfig: (patch: Partial<GithubConfig>) => Promise<GithubConfig>
  saveToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
} {
  const [config, setConfig] = useState<GithubConfig>(DEFAULT_GITHUB)
  const [hasToken, setHasToken] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => {
      void Promise.all([getGithubConfig(), getToken()]).then(([nextConfig, token]) => {
        if (!alive) return
        setConfig(nextConfig)
        setHasToken((token ?? '') !== '')
        setLoaded(true)
      })
    }
    load()
    configListeners.add(load)
    return () => {
      alive = false
      configListeners.delete(load)
    }
  }, [])

  const saveConfig = useCallback(async (patch: Partial<GithubConfig>) => {
    const next = await writeGithubConfig(patch)
    setConfig(next)
    for (const listener of configListeners) listener()
    return next
  }, [])

  const saveToken = useCallback(async (token: string) => {
    await writeToken(token)
    setHasToken(token.trim() !== '')
    for (const listener of configListeners) listener()
  }, [])

  const clearToken = useCallback(async () => {
    await wipeToken()
    setHasToken(false)
    for (const listener of configListeners) listener()
  }, [])

  return { config, hasToken, loaded, saveConfig, saveToken, clearToken }
}
