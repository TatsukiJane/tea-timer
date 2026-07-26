import { t } from '@/i18n'

/** 25 -> "0:25", 60 -> "1:00", 3675 -> "1:01:15" */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** Milliseconds remaining -> display string, rounding *up* so "0:01" is never
 * shown for less than a second and the readout hits "0:00" exactly at the end. */
export function msToClock(ms: number): string {
  return mmss(Math.ceil(Math.max(0, ms) / 1000))
}

/**
 * "150 мл · 8 г · 95°" — the brewing context shown above the timer. Everything
 * constant for this way of brewing, in one line, so the leaf can be measured out
 * and the kettle set before starting.
 */
export function presetLabel(vesselVolume: number, leafGrams: number, tempC?: number): string {
  const parts = [
    `${formatNumber(vesselVolume)} ${t('common.ml')}`,
    `${formatNumber(leafGrams)} ${t('common.g')}`,
  ]
  if (tempC !== undefined) parts.push(`${formatNumber(tempC)}°`)
  return parts.join(' · ')
}

/** "150 / 200 мл" — the volumes badge on a mode card. */
export function volumesLabel(volumes: readonly number[]): string {
  return `${volumes.map(formatNumber).join(' / ')} ${t('common.ml')}`
}

/** Drops the trailing ".0" so 8 renders as "8" but 7.5 stays "7,5". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
}

/** Short local date+time for sync timestamps; invalid input degrades to "—". */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return t('common.none')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return t('common.none')
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Clock time only — used for the rate-limit reset hint. */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
