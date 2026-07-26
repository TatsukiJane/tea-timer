import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

import { t } from '@/i18n'

/**
 * Service-worker update UX.
 *
 * The registration type is 'prompt' rather than 'autoUpdate' precisely so that an
 * update cannot reload the page while a step is running — losing a timer mid-brew
 * because a new build shipped would be the worst possible moment. On top of that,
 * the prompt itself is held back while a timer is running (see `busy`), and shown
 * once the user is between infusions.
 */
export function UpdatePrompt({ busy }: { busy: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  const shown = useRef(false)

  useEffect(() => {
    if (!offlineReady) return
    toast.success(t('pwa.offlineReady'))
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady])

  useEffect(() => {
    if (!needRefresh || busy || shown.current) return
    shown.current = true
    toast(t('pwa.update.title'), {
      duration: Infinity,
      action: {
        label: t('pwa.update.action'),
        onClick: () => {
          setNeedRefresh(false)
          void updateServiceWorker(true)
        },
      },
      onDismiss: () => {
        // Allow it to reappear later rather than losing the update silently.
        shown.current = false
      },
    })
  }, [needRefresh, busy, setNeedRefresh, updateServiceWorker])

  return null
}
