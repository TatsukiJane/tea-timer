/**
 * The m:ss input mask used for pour times.
 *
 * The field is neither "seconds" nor "minutes": digits shift in from the right,
 * the way a microwave keypad works. 2 → 0:02, 25 → 0:25, 115 → 1:15, 200 → 2:00.
 * That removes the unit question instead of answering it — in a seconds field a
 * bare "2" means two seconds, in a minutes field two minutes, and whichever you
 * pick, entering the other one is arithmetic ("two minutes is 120"). Here there is
 * nothing to convert: you type what you read.
 *
 * So the draft stores the digits as typed, not a number of seconds. Everything
 * below is a pure function over that digit string.
 */

/**
 * Longest entry accepted from the keyboard: 9999:59, comfortably past the 24 h the
 * schema allows, so nothing a hand-edited file can hold gets truncated on a keystroke.
 */
const MAX_DIGITS = 6

/**
 * Keeps only the digits, so re-reading the formatted value works: "0:25" has to
 * come back as "25" and not "025", otherwise the next keystroke would read as the
 * fourth digit and jump to minutes.
 *
 * A digit typed past the limit is dropped rather than shifting the value left —
 * losing the keystroke is obvious, silently restating the minutes is not.
 */
export function digitsOf(input: string): string {
  return input.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS)
}

/** "115" → "1:15". Empty stays empty, so the placeholder shows through. */
export function formatDigits(digits: string): string {
  if (digits === '') return ''
  const padded = digits.padStart(3, '0')
  return `${padded.slice(0, -2)}:${padded.slice(-2)}`
}

/**
 * "115" → 75 seconds. null when nothing usable was typed.
 *
 * The seconds part is allowed past 59 mid-typing ("175" is 1:75), because a mask
 * that refuses keystrokes feels broken; `normalizeDigits` tidies it up on blur.
 */
export function digitsToSeconds(digits: string): number | null {
  if (digits === '') return null
  const padded = digits.padStart(3, '0')
  const minutes = Number(padded.slice(0, -2))
  const seconds = Number(padded.slice(-2))
  const total = minutes * 60 + seconds
  return total > 0 ? total : null
}

/** 75 → "115", so a stored curve reads back into the mask. */
export function secondsToDigits(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const digits = `${Math.floor(total / 60)}${String(total % 60).padStart(2, '0')}`
  return digits.replace(/^0+/, '')
}

/** Folds an overflowing seconds part into minutes: "175" (1:75) → "215" (2:15). */
export function normalizeDigits(digits: string): string {
  const seconds = digitsToSeconds(digits)
  return seconds === null ? digits : secondsToDigits(seconds)
}
