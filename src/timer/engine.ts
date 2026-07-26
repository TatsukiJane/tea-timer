/**
 * Step timer state machine.
 *
 * The rule that makes this correct under background throttling: never store an
 * accumulated "elapsed". Store exactly one of two things — an absolute deadline
 * while running, or a remaining duration while paused.
 *
 *   pause:  endAt        -> remainingMs = endAt - now   (absolute becomes relative)
 *   start:  remainingMs  -> endAt       = now + remainingMs   (and back again)
 *
 * Because no transition accumulates a duration across ticks, there is no drift
 * and no dependence on tick frequency. A pause that lasts three hours in a
 * suspended tab is harmless: remainingMs is just a stored number. A background
 * gap while running is equally harmless: endAt is absolute, so one tick() on wake
 * yields the truth.
 *
 * Every transition takes `now` as an argument and never reads the clock itself.
 * That is what makes a jumped clock testable.
 */

export type StepTimer =
  | { kind: 'idle'; durationMs: number }
  | { kind: 'running'; durationMs: number; startedAt: number; endAt: number }
  | { kind: 'paused'; durationMs: number; remainingMs: number }
  | { kind: 'done'; durationMs: number; finishedAt: number }

export function idle(durationMs: number): StepTimer {
  return { kind: 'idle', durationMs: Math.max(0, durationMs) }
}

export function fromSeconds(seconds: number): StepTimer {
  return idle(Math.round(seconds * 1000))
}

/** Starts from idle or resumes from paused. Running and done are left alone. */
export function start(timer: StepTimer, now: number): StepTimer {
  switch (timer.kind) {
    case 'idle':
      return {
        kind: 'running',
        durationMs: timer.durationMs,
        startedAt: now,
        endAt: now + timer.durationMs,
      }
    case 'paused':
      return {
        kind: 'running',
        durationMs: timer.durationMs,
        startedAt: now,
        endAt: now + timer.remainingMs,
      }
    case 'running':
    case 'done':
      // Idempotent: a second Start press must not extend a running step.
      return timer
  }
}

export function pause(timer: StepTimer, now: number): StepTimer {
  if (timer.kind !== 'running') return timer
  return {
    kind: 'paused',
    durationMs: timer.durationMs,
    remainingMs: Math.max(0, timer.endAt - now),
  }
}

export function reset(timer: StepTimer): StepTimer {
  return idle(timer.durationMs)
}

/**
 * Advances a running timer to `done` once its deadline has passed.
 *
 * `finishedAt` is the deadline, not `now`: if the tab was hidden for two minutes
 * past the end, the honest finish time is when the step actually ended, not when
 * we got around to noticing.
 */
export function tick(timer: StepTimer, now: number): StepTimer {
  if (timer.kind !== 'running') return timer
  if (now < timer.endAt) return timer
  return { kind: 'done', durationMs: timer.durationMs, finishedAt: timer.endAt }
}

export function remainingMs(timer: StepTimer, now: number): number {
  switch (timer.kind) {
    case 'idle':
      return timer.durationMs
    case 'running':
      return Math.max(0, timer.endAt - now)
    case 'paused':
      return timer.remainingMs
    case 'done':
      return 0
  }
}

/** 0 at the start of a step, 1 at its end. Clamped, and safe for a zero duration. */
export function progress(timer: StepTimer, now: number): number {
  if (timer.durationMs <= 0) return timer.kind === 'done' ? 1 : 0
  const elapsed = timer.durationMs - remainingMs(timer, now)
  return Math.min(1, Math.max(0, elapsed / timer.durationMs))
}

export function isRunning(timer: StepTimer): boolean {
  return timer.kind === 'running'
}

export function isDone(timer: StepTimer): boolean {
  return timer.kind === 'done'
}

/** True when a running timer's deadline has already passed but tick() has not run. */
export function isExpired(timer: StepTimer, now: number): boolean {
  return timer.kind === 'running' && now >= timer.endAt
}
