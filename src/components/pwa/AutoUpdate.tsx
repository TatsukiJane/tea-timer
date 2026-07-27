import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

import { t } from '@/i18n'

/**
 * Applies a new build by itself, without asking.
 *
 * `registerType` stays `'prompt'` in vite.config.ts, and that is not a contradiction:
 * `'autoUpdate'` reloads the page the moment a new service worker is ready, which
 * would happily kill a running infusion or a half-typed tea. Keeping the trigger in
 * our hands means the update is still automatic — it just waits for a safe moment
 * (see state/useBusy.ts) instead of reloading mid-pour.
 *
 * The reload itself is announced *after* the fact: a toast shown before it would be
 * wiped out by the very reload it describes, so a flag is left in sessionStorage and
 * read on the way back up.
 */

/** How often a long-lived tab looks for a new build. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Floor between checks triggered by coming back to the tab. */
const CHECK_THROTTLE_MS = 5 * 60 * 1000
/** How long to wait for the new worker to take control before reloading regardless. */
const HANDOVER_TIMEOUT_MS = 5000
const JUST_UPDATED = 'tea-timer:just-updated'

export function AutoUpdate({ busy }: { busy: boolean }) {
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const lastCheck = useRef(0)
  const applied = useRef(false)

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, current) {
      if (!current) return
      registration.current = current
      lastCheck.current = Date.now()
      // A standalone PWA can stay open for days. Without an explicit check it would
      // only ever notice a new build on a cold start.
      window.setInterval(() => void current.update(), CHECK_INTERVAL_MS)
    },
  })

  // Also look when the app comes back into view or regains the network — that is
  // when a phone that has been in a pocket since yesterday finds out.
  useEffect(() => {
    const check = () => {
      if (document.hidden) return
      if (Date.now() - lastCheck.current < CHECK_THROTTLE_MS) return
      lastCheck.current = Date.now()
      void registration.current?.update()
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
    }
  }, [])

  // Apply it as soon as nothing is at stake. While busy this effect simply waits;
  // it re-runs when the flag clears, so the update lands between infusions.
  useEffect(() => {
    if (!needRefresh || busy || applied.current) return
    applied.current = true
    try {
      sessionStorage.setItem(JUST_UPDATED, '1')
    } catch {
      // Private mode with storage denied: lose the notice, not the update.
    }

    // The reload is ours to do. vite-plugin-pwa reloads only when its own
    // `controlling` event carries isUpdate, which depends on whether a worker was
    // already controlling the page when it first registered — so on a first-ever
    // visit the new build would install and then just sit there unused.
    const reload = () => window.location.reload()
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true })
    // And if the handover is somehow never announced, reload anyway: at worst the
    // page comes back on the same version, which costs nothing at a safe moment.
    const fallback = window.setTimeout(reload, HANDOVER_TIMEOUT_MS)

    // Tells the waiting worker to take over; the listener above does the rest.
    void updateServiceWorker()

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', reload)
      clearTimeout(fallback)
    }
  }, [needRefresh, busy, updateServiceWorker])

  useEffect(() => {
    let updated = false
    try {
      updated = sessionStorage.getItem(JUST_UPDATED) !== null
      if (updated) sessionStorage.removeItem(JUST_UPDATED)
    } catch {
      /* see above */
    }
    if (updated) toast.success(t('pwa.updated'))
  }, [])

  useEffect(() => {
    if (!offlineReady) return
    toast.success(t('pwa.offlineReady'))
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady])

  return null
}
