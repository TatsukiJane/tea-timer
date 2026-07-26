/**
 * The m:ss input mask used for pour times.
 *
 * Digits land left to right — minutes first, then the colon appears by itself, then
 * seconds. Typing 0 4 5 gives 0:45; 2 0 0 gives 2:00; 1 0 3 0 gives 10:30. Nothing
 * shifts under the fingers: what you have typed stays where you typed it.
 *
 * Because minutes come first, a lone digit is minutes — "2" is 2:00. Which means a
 * short pour is entered with its leading zero ("045" for 0:45), and the field shows
 * that as you go, so it is visible rather than surprising.
 *
 * The colon position is derived, not stored: the last two digits are the seconds,
 * everything before them is the minutes, and there is always at least one minutes
 * digit. So the draft can keep just the digits as typed, and everything below is a
 * pure function over that string.
 */

/** Longest entry accepted from the keyboard: 9999:59, far past the 24 h the schema allows. */
const MAX_DIGITS = 6

/** Where the colon goes: everything from here on is seconds. */
function splitAt(digits: string): number {
  return Math.max(1, digits.length - 2)
}

/**
 * Keeps only the digits, so the formatted value can be read back: "0:45" has to
 * come back as "045".
 *
 * A digit typed past the limit is dropped rather than pushing the earlier ones out
 * of the field — losing the keystroke is obvious, silently restating the minutes is not.
 */
export function digitsOf(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, MAX_DIGITS)
  if (digits === '') return ''
  const cut = splitAt(digits)
  // Minutes must not accumulate leading zeros: without this, editing "0:04" would
  // grow it to "00:04" instead of staying put.
  const minutes = digits.slice(0, cut).replace(/^0+(?=\d)/, '')
  return minutes + digits.slice(cut)
}

/**
 * Applies one edit of the field, given the digits it held before.
 *
 * Needed only for one case: backspacing the auto-inserted colon. The field shows
 * "0:", the browser hands back "0", and re-formatting that would put the colon
 * straight back — the key would look dead. So that keystroke deletes the digit the
 * colon followed instead.
 */
export function digitsAfterEdit(previous: string, raw: string): string {
  const shown = formatDigits(previous)
  if (shown.endsWith(':') && raw === shown.slice(0, -1)) return digitsOf(raw).slice(0, -1)
  return digitsOf(raw)
}

/** "045" → "0:45", "2" → "2:" (mid-typing), "" → "" so the placeholder shows. */
export function formatDigits(digits: string): string {
  if (digits === '') return ''
  const cut = splitAt(digits)
  return `${digits.slice(0, cut)}:${digits.slice(cut)}`
}

/**
 * "045" → 45 seconds, "200" → 120. null when nothing usable was typed.
 *
 * A half-typed value reads exactly as it looks: "0:5" is five seconds, and typing
 * the next digit makes it "0:50". The seconds part is allowed past 59 ("175" is
 * 1:75) because a mask that refuses keystrokes feels broken; `normalizeDigits`
 * tidies it up on blur.
 */
export function digitsToSeconds(digits: string): number | null {
  if (digits === '') return null
  const cut = splitAt(digits)
  const minutes = Number(digits.slice(0, cut))
  const seconds = digits.length > cut ? Number(digits.slice(cut)) : 0
  const total = minutes * 60 + seconds
  return total > 0 ? total : null
}

/** 45 → "045", so a stored curve reads back into the mask. */
export function secondsToDigits(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total === 0) return ''
  return `${Math.floor(total / 60)}${String(total % 60).padStart(2, '0')}`
}

/** Pads a half-typed value and folds overflowing seconds into minutes: "175" → "215". */
export function normalizeDigits(digits: string): string {
  const seconds = digitsToSeconds(digits)
  return seconds === null ? digits : secondsToDigits(seconds)
}
