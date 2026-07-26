import { ru } from './ru'

/**
 * Minimal i18n layer — no library on purpose.
 *
 * The point of this indirection is that adding a locale later is a one-file
 * change: write `en.ts` exporting an object of type `Dict`, register it in
 * `dictionaries`, and expose a setter in Settings. Components never hold a
 * literal string, so none of them need touching.
 *
 * Today only 'ru' exists, so `t()` is effectively a lookup with interpolation.
 */
export type Dict = typeof ru
export type MessageKey = keyof Dict
export type Locale = 'ru'

const dictionaries: Record<Locale, Dict> = { ru }

const DEFAULT_LOCALE: Locale = 'ru'
let current: Locale = DEFAULT_LOCALE

export function setLocale(locale: Locale): void {
  current = locale
}

export function getLocale(): Locale {
  return current
}

export type Vars = Record<string, string | number>

/** Look up `key` and substitute {placeholders} from `vars`. */
export function t(key: MessageKey, vars?: Vars): string {
  const template: string = dictionaries[current][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * Russian needs three plural forms, so counts are never baked into the
 * dictionary. Pass the forms for 1 / 2 / 5: plural(n, ['пролив', 'пролива', 'проливов']).
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export const PLURALS = {
  steps: ['пролив', 'пролива', 'проливов'] as const,
  presets: ['пресет', 'пресета', 'пресетов'] as const,
  records: ['запись', 'записи', 'записей'] as const,
  errors: ['ошибка', 'ошибки', 'ошибок'] as const,
} satisfies Record<string, readonly [string, string, string]>

/** "3 пролива" */
export function countOf(n: number, forms: readonly [string, string, string]): string {
  return `${n} ${plural(n, forms)}`
}
