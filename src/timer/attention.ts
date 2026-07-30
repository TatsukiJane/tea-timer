/**
 * The "look at me" channels that are not sound: a badge on the app icon and a
 * blinking window title, raised while the end-of-step signal is ringing.
 *
 * Why these two and not an OS notification: a notification needs a permission
 * prompt and, to be clickable, a `notificationclick` handler inside the service
 * worker — which this project does not have (the worker is fully generated, see
 * `vite.config.ts`). A badge and a title need neither, work offline, and cost
 * nothing when unsupported.
 *
 * What they honestly do on Windows: `setAppBadge` puts a dot on the taskbar icon
 * of the installed app, and the title shows up in the window title and the
 * taskbar tooltip. Neither *flashes* the taskbar button — the web has no
 * equivalent of FlashWindowEx, so this is as loud as it gets visually.
 */

/**
 * Chrome throttles timers in a hidden page to roughly one call per second, so a
 * faster blink would simply not be delivered. While the pips are playing the page
 * counts as audible and escapes the harsher "intensive" throttling (one call per
 * minute); with sound switched off, a window hidden for more than ~5 minutes will
 * blink about once a minute. That is a platform floor, not something to work
 * around here.
 */
const BLINK_MS = 1000

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

let blinkInterval: number | undefined
let baseTitle = ''
let flashTitle = ''
let flashShown = false

/** Raises both channels. Idempotent: a second call does not clobber `baseTitle`. */
export function startAttention(title: string): void {
  if (blinkInterval !== undefined) return

  baseTitle = document.title
  flashTitle = title
  flashShown = false

  const nav = navigator as BadgeNavigator
  // No count: a dot says "something is waiting", which is the whole message. The
  // promise is swallowed — an unsupported or denied badge must stay silent.
  void nav.setAppBadge?.().catch(() => undefined)

  blinkInterval = window.setInterval(blink, BLINK_MS)
  blink()
}

/** Lowers both channels and restores the title. Safe to call when nothing is up. */
export function stopAttention(): void {
  if (blinkInterval !== undefined) {
    clearInterval(blinkInterval)
    blinkInterval = undefined
  }
  if (baseTitle !== '') {
    document.title = baseTitle
    baseTitle = ''
  }
  flashShown = false

  const nav = navigator as BadgeNavigator
  void nav.clearAppBadge?.().catch(() => undefined)
}

function blink(): void {
  // While the window is in front, the page itself is the signal — a title
  // flipping under your nose is just noise. The badge stays: it is out of the way.
  if (document.hasFocus()) {
    if (flashShown) {
      document.title = baseTitle
      flashShown = false
    }
    return
  }
  flashShown = !flashShown
  document.title = flashShown ? flashTitle : baseTitle
}
