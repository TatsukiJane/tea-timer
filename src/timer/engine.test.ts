import { describe, expect, it } from 'vitest'

import {
  fromSeconds,
  idle,
  isExpired,
  pause,
  progress,
  remainingMs,
  reset,
  start,
  tick,
  type StepTimer,
} from './engine'

const T0 = 1_700_000_000_000

describe('step timer engine', () => {
  it('counts down from an absolute deadline', () => {
    const timer = start(fromSeconds(25), T0)
    expect(timer).toMatchObject({ kind: 'running', endAt: T0 + 25_000 })
    expect(remainingMs(timer, T0)).toBe(25_000)
    expect(remainingMs(timer, T0 + 10_000)).toBe(15_000)
  })

  it('finishes exactly at the deadline', () => {
    const running = start(fromSeconds(25), T0)
    expect(tick(running, T0 + 24_999).kind).toBe('running')
    expect(tick(running, T0 + 25_000)).toEqual({
      kind: 'done',
      durationMs: 25_000,
      finishedAt: T0 + 25_000,
    })
  })

  it('reports the honest finish time after a long background gap', () => {
    // The tab was hidden for ten minutes; we only tick on wake. The step ended
    // when it ended, so finishedAt must be the deadline, not the wake time.
    const running = start(fromSeconds(45), T0)
    const done = tick(running, T0 + 10 * 60_000)
    expect(done).toEqual({ kind: 'done', durationMs: 45_000, finishedAt: T0 + 45_000 })
  })

  it('pause converts the deadline into a remainder, resume converts it back', () => {
    const running = start(fromSeconds(60), T0)
    const paused = pause(running, T0 + 20_000)
    expect(paused).toEqual({ kind: 'paused', durationMs: 60_000, remainingMs: 40_000 })

    // Three hours of suspended tab must not consume the remainder.
    const resumed = start(paused, T0 + 3 * 3600_000)
    expect(resumed).toMatchObject({ kind: 'running', endAt: T0 + 3 * 3600_000 + 40_000 })
    expect(remainingMs(resumed, T0 + 3 * 3600_000)).toBe(40_000)
  })

  it('does not drift across many pause/resume cycles', () => {
    // The whole point of storing an anchor rather than accumulating elapsed time.
    let timer: StepTimer = fromSeconds(100)
    let now = T0
    for (let i = 0; i < 50; i++) {
      timer = start(timer, now)
      now += 1000
      timer = pause(timer, now)
      now += 12_345 // idle time while paused, which must not count
    }
    expect(remainingMs(timer, now)).toBe(100_000 - 50 * 1000)
  })

  it('start is idempotent while running', () => {
    const running = start(fromSeconds(30), T0)
    const again = start(running, T0 + 5000)
    expect(again).toBe(running)
    expect(remainingMs(again, T0 + 5000)).toBe(25_000)
  })

  it('start on a done timer does nothing', () => {
    const done = tick(start(fromSeconds(5), T0), T0 + 5000)
    expect(start(done, T0 + 6000)).toBe(done)
  })

  it('pause after the deadline yields a zero remainder', () => {
    const running = start(fromSeconds(10), T0)
    expect(pause(running, T0 + 30_000)).toEqual({
      kind: 'paused',
      durationMs: 10_000,
      remainingMs: 0,
    })
  })

  it('reset returns to idle from every state', () => {
    const running = start(fromSeconds(20), T0)
    expect(reset(running)).toEqual(idle(20_000))
    expect(reset(pause(running, T0 + 5000))).toEqual(idle(20_000))
    expect(reset(tick(running, T0 + 20_000))).toEqual(idle(20_000))
    expect(reset(idle(20_000))).toEqual(idle(20_000))
  })

  it('survives the wall clock jumping backwards', () => {
    // NTP correction mid-step. remaining must clamp rather than exceed the
    // duration, and the timer must not become unfinishable.
    const running = start(fromSeconds(30), T0)
    expect(remainingMs(running, T0 - 60_000)).toBe(90_000)
    expect(isExpired(running, T0 - 60_000)).toBe(false)
    // Once the clock is sane again the step still completes.
    expect(tick(running, T0 + 30_000).kind).toBe('done')
  })

  it('clamps remaining at zero and never goes negative', () => {
    const running = start(fromSeconds(10), T0)
    expect(remainingMs(running, T0 + 99_999)).toBe(0)
  })

  it('progress is clamped and safe for a zero duration', () => {
    const running = start(fromSeconds(40), T0)
    expect(progress(running, T0)).toBe(0)
    expect(progress(running, T0 + 20_000)).toBeCloseTo(0.5)
    expect(progress(running, T0 + 999_999)).toBe(1)

    const zero = idle(0)
    expect(progress(zero, T0)).toBe(0)
    expect(progress(tick(start(zero, T0), T0), T0)).toBe(1)
  })

  it('isExpired flags a deadline that passed before tick ran', () => {
    const running = start(fromSeconds(5), T0)
    expect(isExpired(running, T0 + 4999)).toBe(false)
    expect(isExpired(running, T0 + 5000)).toBe(true)
    expect(isExpired(idle(5000), T0 + 99_999)).toBe(false)
  })

  it('tick leaves non-running states untouched', () => {
    const paused = pause(start(fromSeconds(10), T0), T0 + 1000)
    expect(tick(paused, T0 + 99_999)).toBe(paused)
    const blank = idle(10_000)
    expect(tick(blank, T0 + 99_999)).toBe(blank)
  })
})
