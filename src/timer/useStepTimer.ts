import { useCallback, useEffect, useRef, useState } from 'react'

import {
  idle,
  isExpired,
  pause as pauseTimer,
  progress as progressOf,
  remainingMs as remainingOf,
  reset as resetTimer,
  start as startTimer,
  tick,
  type StepTimer,
} from './engine'

/**
 * React binding for the step timer.
 *
 * Firing the end-of-step signal reliably needs three layers, because no single
 * mechanism is dependable:
 *
 *  1. One long setTimeout, scheduled at start. A single long timeout in a hidden
 *     tab is treated far better than a 1 Hz interval — Chrome's intensive
 *     throttling only begins after ~5 minutes hidden — so a typical 25–60 s step
 *     fires on time even in the background.
 *  2. Reconciliation on visibilitychange / focus / pageshow. This is the
 *     correctness backstop: whatever happened to the timeout, the *state* is
 *     right the instant the user looks at the screen. The signal may be late; the
 *     display is never wrong.
 *  3. requestAnimationFrame, for the countdown display only. It stops when the
 *     tab is hidden, which is fine — nobody is watching. setInterval is not used
 *     for this: it drifts and repaints at the wrong moments.
 *
 * On iOS, locking the screen suspends the whole app, so no callback runs at all.
 * Layer 2 makes the state correct on return, but the signal is silent — hence the
 * warning shown on the brew screen. The looping-silent-audio keepalive hack is
 * deliberately not used: it is fragile and drains the battery.
 */
export type UseStepTimer = {
  timer: StepTimer
  remainingMs: number
  progress: number
  start: () => void
  pause: () => void
  reset: () => void
  /** Load a new duration and go back to idle — used when moving between steps. */
  load: (durationMs: number, options?: { endAt?: number }) => void
}

export function useStepTimer(initialDurationMs: number, onDone: () => void): UseStepTimer {
  const [timer, setTimer] = useState<StepTimer>(() => idle(initialDurationMs))
  const [, forceRender] = useState(0)

  const alarmRef = useRef<number | undefined>(undefined)
  const rafRef = useRef<number | undefined>(undefined)
  // Mirrors `timer` so the reconcile listeners can read current state without
  // doing side effects inside a setState updater, which React may call twice.
  const timerRef = useRef<StepTimer>(timer)
  timerRef.current = timer
  // Guards against firing the signal twice for one completion, which is easy to
  // do when the timeout and a visibility wake land together.
  const firedForRef = useRef<number | undefined>(undefined)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const clearAlarm = () => {
    if (alarmRef.current !== undefined) {
      clearTimeout(alarmRef.current)
      alarmRef.current = undefined
    }
  }

  /** Moves the timer to done and fires the signal at most once per deadline. */
  const complete = useCallback((endAt: number) => {
    setTimer((current) => tick(current, Math.max(endAt, Date.now())))
    if (firedForRef.current === endAt) return
    firedForRef.current = endAt
    onDoneRef.current()
  }, [])

  // Layer 1: a single alarm for the current deadline.
  useEffect(() => {
    clearAlarm()
    if (timer.kind !== 'running') return

    const delay = Math.max(0, timer.endAt - Date.now())
    const endAt = timer.endAt
    alarmRef.current = window.setTimeout(() => complete(endAt), delay)
    return clearAlarm
  }, [timer, complete])

  // Layer 2: reconcile whenever we come back into view.
  useEffect(() => {
    const reconcile = () => {
      const current = timerRef.current
      if (current.kind === 'running' && isExpired(current, Date.now())) {
        complete(current.endAt)
      } else {
        // Nothing to settle — just repaint, since rAF was parked while hidden.
        forceRender((n) => n + 1)
      }
    }

    const onVisibility = () => {
      if (!document.hidden) reconcile()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', reconcile)
    window.addEventListener('pageshow', reconcile)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', reconcile)
      window.removeEventListener('pageshow', reconcile)
    }
  }, [complete])

  // Layer 3: display ticking. Runs only while visible and only while running.
  useEffect(() => {
    if (timer.kind !== 'running') return
    let cancelled = false
    const loop = () => {
      if (cancelled) return
      forceRender((n) => n + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [timer])

  const start = useCallback(() => {
    setTimer((current) => startTimer(current, Date.now()))
  }, [])

  const pause = useCallback(() => {
    setTimer((current) => pauseTimer(current, Date.now()))
  }, [])

  const reset = useCallback(() => {
    firedForRef.current = undefined
    setTimer((current) => resetTimer(current))
  }, [])

  const load = useCallback((durationMs: number, options?: { endAt?: number }) => {
    if (options?.endAt !== undefined) {
      // Restoring a session that was mid-step: rebuild the running state around
      // the stored absolute deadline rather than restarting the countdown.
      const endAt = options.endAt
      const restored = tick(
        { kind: 'running', durationMs, startedAt: endAt - durationMs, endAt },
        Date.now(),
      )
      // If the deadline already passed we show "done" but stay silent: nobody
      // wants an alarm for an infusion that finished an hour ago.
      firedForRef.current = restored.kind === 'done' ? endAt : undefined
      setTimer(restored)
      return
    }
    firedForRef.current = undefined
    setTimer(idle(durationMs))
  }, [])

  const now = Date.now()
  return {
    timer,
    remainingMs: remainingOf(timer, now),
    progress: progressOf(timer, now),
    start,
    pause,
    reset,
    load,
  }
}
