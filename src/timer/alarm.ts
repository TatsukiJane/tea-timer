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

type Voice = { osc: OscillatorNode; endsAt: number }

/**
 * Schedules one burst of pips at an absolute audio-clock time.
 *
 * Everything is scheduled on the audio thread rather than played "now", which is
 * what makes the repeating alarm below survive a throttled tab: the AudioContext
 * clock keeps running even when timers are down to one callback per minute.
 */
function scheduleBurst(audio: AudioContext, at: number, destination: AudioNode): Voice[] {
  const voices: Voice[] = []
  for (let i = 0; i < PIP_COUNT; i++) {
    const pipAt = at + (i * (PIP_MS + PIP_GAP_MS)) / 1000
    const endsAt = pipAt + PIP_MS / 1000
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = PIP_HZ
    // Short attack/decay envelope: a bare gate would click audibly.
    gain.gain.setValueAtTime(0, pipAt)
    gain.gain.linearRampToValueAtTime(0.28, pipAt + 0.012)
    gain.gain.setValueAtTime(0.28, endsAt - 0.03)
    gain.gain.linearRampToValueAtTime(0, endsAt)
    osc.connect(gain).connect(destination)
    osc.start(pipAt)
    osc.stop(endsAt + 0.01)
    voices.push({ osc, endsAt })
  }
  return voices
}

/** Three short pips, once. Returns immediately; the sound plays on the audio thread. */
export function playBeep(): void {
  const audio = getContext()
  if (!audio) return
  void resumeAudio()
  scheduleBurst(audio, audio.currentTime + 0.02, audio.destination)
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

/** One-shot signal. Used by the "test signal" button in settings. */
export function fireAlarm(prefs: SignalPrefs): void {
  if (prefs.sound) playBeep()
  if (prefs.vibration) vibrate()
}

/* ── Repeating alarm ──────────────────────────────────────────────────────────
 * The end of an infusion is easy to miss — the phone is face down on the table
 * and you are pouring. So the signal repeats until it is switched off, rather
 * than beeping three times into an empty room.
 *
 * Two mechanisms, because a single interval is not dependable: the pips are
 * scheduled far ahead on the audio clock (which does not throttle), while the
 * interval only tops that schedule up and re-issues the vibration. If the tab is
 * hidden and the interval drops to one callback per minute, the sound still runs
 * without a gap. */

/** Burst, then silence, then burst again. Long enough not to be maddening. */
const CYCLE_MS = 2400
/** Audio scheduled this far ahead — comfortably more than the worst throttling. */
const SCHEDULE_AHEAD_MS = 90_000
const TOP_UP_MS = 2000

let alarmPrefs: SignalPrefs = { sound: false, vibration: false }
let alarmInterval: number | undefined
let alarmGain: GainNode | null = null
let alarmVoices: Voice[] = []
/** Audio-clock time up to which bursts are already scheduled, in seconds. */
let scheduledUntil = 0
let lastVibrateAt = 0

/** True while the repeating signal is sounding. */
export function alarmRinging(): boolean {
  return alarmInterval !== undefined
}

/**
 * Starts the repeating signal. Keeps going until `stopAlarm()`.
 *
 * Everything hangs off one gain node so stopping is a single ramp to zero rather
 * than chasing down individual voices.
 */
export function startAlarm(prefs: SignalPrefs): void {
  stopAlarm()
  if (!prefs.sound && !prefs.vibration) return
  alarmPrefs = prefs

  if (prefs.sound) {
    void resumeAudio()
    const audio = getContext()
    if (audio) {
      alarmGain = audio.createGain()
      alarmGain.gain.value = 1
      alarmGain.connect(audio.destination)
      // A suspended context has a frozen currentTime, so nothing scheduled here
      // is lost — it plays from the start once the context resumes.
      scheduledUntil = audio.currentTime + 0.02
      topUpAudio()
    }
  }
  if (prefs.vibration) vibrateCycle()

  alarmInterval = window.setInterval(pulse, TOP_UP_MS)
}

/** Silences the repeating signal. Safe to call when nothing is ringing. */
export function stopAlarm(): void {
  if (alarmInterval !== undefined) {
    clearInterval(alarmInterval)
    alarmInterval = undefined
  }

  const gain = alarmGain
  alarmGain = null
  const voices = alarmVoices
  alarmVoices = []

  if (ctx !== null) {
    const now = ctx.currentTime
    if (gain) {
      try {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        // Ramp instead of a hard gate: cutting a live sine clicks.
        gain.gain.linearRampToValueAtTime(0, now + 0.02)
      } catch {
        // Nothing worth doing; the oscillators are stopped below regardless.
      }
    }
    for (const voice of voices) {
      try {
        voice.osc.stop(now + 0.03)
      } catch {
        // Already stopped, or never started.
      }
    }
  }
  if (gain) window.setTimeout(() => gain.disconnect(), 200)

  if (vibrationSupported()) {
    try {
      navigator.vibrate(0)
    } catch {
      // Same as vibrate(): some browsers throw when hidden.
    }
  }
}

function pulse(): void {
  if (alarmPrefs.sound) topUpAudio()
  if (alarmPrefs.vibration && Date.now() - lastVibrateAt >= CYCLE_MS) vibrateCycle()
}

/** Extends the scheduled bursts out to the horizon and drops spent voices. */
function topUpAudio(): void {
  const audio = ctx
  if (!audio || !alarmGain) return

  const now = audio.currentTime
  alarmVoices = alarmVoices.filter((voice) => voice.endsAt > now)
  if (scheduledUntil < now) scheduledUntil = now + 0.02

  const horizon = now + SCHEDULE_AHEAD_MS / 1000
  while (scheduledUntil < horizon) {
    alarmVoices.push(...scheduleBurst(audio, scheduledUntil, alarmGain))
    scheduledUntil += CYCLE_MS / 1000
  }
}

function vibrateCycle(): void {
  lastVibrateAt = Date.now()
  vibrate()
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
