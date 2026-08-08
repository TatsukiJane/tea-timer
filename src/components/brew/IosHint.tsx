import { InfoIcon } from '@/lib/icons'

import { t } from '@/i18n'

/**
 * On iOS, locking the screen or switching apps suspends the whole web app: no
 * JavaScript runs, so no sound and no vibration. The state is corrected the moment
 * the app comes back, but the signal was silent — so say so plainly rather than
 * letting the user find out with an over-steeped brew.
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iosDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports itself as a Mac; a touch-capable "Mac" is really an iPad.
  const iPadOs = ua.includes('Macintosh') && navigator.maxTouchPoints > 1
  return iosDevice || iPadOs
}

export function IosHint() {
  if (!isIos()) return null

  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {t('brew.iosHint')}
    </p>
  )
}
