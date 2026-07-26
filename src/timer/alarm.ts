/**
 * End-of-infusion signal: sound, vibration, and keeping the screen awake.
 *
 * The beep is synthesised with an OscillatorNode rather than played from an
 * audio file. That means zero bytes to precache, nothing to decode, no
 * <audio> autoplay-policy edge cases, and it works offline by construction.
 */

let ctx: AudioContext | null = null
let unlockInstalled = false

type AudioContextCtor = typeof AudioContext
function audioContextCtor(): AudioContextCtor | undefined {
  const w = window as Window & { webkitAudioContext?: AudioContextCtor }
  return window.AudioContext ?? w.webkitAudioContext
}

export function audioSupported(): boolean {
  return audioContextCtor() !== undefined
}

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = audioContextCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/**
 * An AudioContext created outside a user gesture starts 'suspended' and stays
 * silent. Hook the first gesture anywhere in the app to create and resume it,
 * so the brew screen never has to deal with a dead context.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled) return
  unlockInstalled = true

  const unlock = () => {
    void resumeAudio()
  }
  for (const event of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(event, unlock, { once: true, capture: true, passive: true })
  }

  // iOS moves a context to 'interrupted' after a phone call or backgrounding,
  // and it will not resume itself. Nudge it whenever we come back into view.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void resumeAudio()
  })
}

export async function resumeAudio(): Promise<void> {
  const audio = getContext()
  if (!audio) return
  if (audio.state !== 'running') {
    try {
      await audio.resume()
    } catch {
      // Nothing to do — the next gesture will try again.
    }
  }
}

const PIP_COUNT = 3
const PIP_MS = 130
const PIP_GAP_MS = 90
const PIP_HZ = 880

/** Three short pips. Resolves immediately; the sound plays on the audio thread. */
export function playBeep(): void {
  const audio = getContext()
  if (!audio) return
  void resumeAudio()

  const start = audio.currentTime + 0.02
  for (let i = 0; i < PIP_COUNT; i++) {
    const at = start + (i * (PIP_MS + PIP_GAP_MS)) / 1000
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = PIP_HZ
    // Short attack/decay envelope: a bare gate would click audibly.
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.28, at + 0.012)
    gain.gain.setValueAtTime(0.28, at + PIP_MS / 1000 - 0.03)
    gain.gain.linearRampToValueAtTime(0, at + PIP_MS / 1000)
    osc.connect(gain).connect(audio.destination)
    osc.start(at)
    osc.stop(at + PIP_MS / 1000 + 0.01)
  }
}

const VIBRATE_PATTERN = [180, 90, 180, 90, 360]

/** Not available on iOS Safari at all — feature-detect before offering the toggle. */
export function vibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function vibrate(): void {
  if (!vibrationSupported()) return
  try {
    navigator.vibrate(VIBRATE_PATTERN)
  } catch {
    // Some browsers throw when the page is not visible; harmless.
  }
}

export type SignalPrefs = { sound: boolean; vibration: boolean }

export function fireAlarm(prefs: SignalPrefs): void {
  if (prefs.sound) playBeep()
  if (prefs.vibration) vibrate()
}

/* ── Screen Wake Lock ─────────────────────────────────────────────────────────
 * The real use case is a phone lying on the table next to the gaiwan. Keeping
 * the screen on means the page is never suspended, which is by far the most
 * effective mitigation for background throttling. */

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> }
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

let sentinel: WakeLockSentinelLike | null = null

export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

export async function requestWakeLock(): Promise<void> {
  const nav = navigator as WakeLockNavigator
  if (!nav.wakeLock || sentinel) return
  try {
    sentinel = await nav.wakeLock.request('screen')
    // The browser releases the lock whenever the page hides; drop our handle so
    // the next visibility change can re-acquire it.
    void sentinel.release
  } catch {
    sentinel = null
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (!sentinel) return
  const held = sentinel
  sentinel = null
  try {
    if (!held.released) await held.release()
  } catch {
    // Already gone.
  }
}

export function wakeLockHeld(): boolean {
  return sentinel !== null && !sentinel.released
}
