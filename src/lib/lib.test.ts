import { describe, expect, it } from 'vitest'

import { base64ToBytes, base64ToUtf8, bytesToBase64, utf8ToBase64 } from './base64'
import { mmss, msToClock, formatNumber, presetLabel } from './format'
import { shortId } from './id'
import { imageFilePath, modeFilePath, slugify, transliterate, SLUG_FALLBACK } from './slug'

describe('base64', () => {
  it('documents why the helper exists: raw btoa rejects Cyrillic', () => {
    expect(() => btoa('Шу Пуэр')).toThrow()
  })

  it('round-trips Cyrillic', () => {
    const text = 'Шу Пуэр «Лао Ча Тоу» 2018 — 95°C'
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text)
  })

  it('round-trips emoji, which are surrogate pairs', () => {
    const text = '🍵 чай 🫖 и 🌿'
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text)
  })

  it('round-trips a whole markdown document', () => {
    const doc = ['---', 'title: Шу Пуэр', 'notes: |-', '  Строка', '---', '', '# Шу'].join('\n')
    expect(base64ToUtf8(utf8ToBase64(doc))).toBe(doc)
  })

  it('decodes line-wrapped base64, as the Contents API returns it', () => {
    // GitHub wraps at 60 chars; atob and fromBase64 both reject the newlines.
    const encoded = utf8ToBase64('Шу Пуэр '.repeat(20))
    const wrapped = (encoded.match(/.{1,60}/g) ?? []).join('\n') + '\n'
    expect(base64ToUtf8(wrapped)).toBe('Шу Пуэр '.repeat(20))
  })

  it('decodes base64 containing spaces and carriage returns', () => {
    const encoded = utf8ToBase64('чай')
    expect(base64ToUtf8(` ${encoded.slice(0, 2)}\r\n ${encoded.slice(2)} `)).toBe('чай')
  })

  it('round-trips arbitrary bytes exactly, as needed for image blobs', () => {
    const bytes = new Uint8Array(1024)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 256
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('handles an empty input', () => {
    expect(utf8ToBase64('')).toBe('')
    expect(base64ToUtf8('')).toBe('')
  })

  it('handles a payload larger than the chunk size without a stack overflow', () => {
    const bytes = new Uint8Array(0x8000 * 3 + 17).fill(200)
    expect(base64ToBytes(bytesToBase64(bytes)).length).toBe(bytes.length)
  })
})

describe('transliteration and slugs', () => {
  it('maps every Russian letter', () => {
    expect(transliterate('абвгдеёжзийклмнопрстуфхцчшщъыьэюя')).toBe(
      'abvgdeezhziyklmnoprstufhcchshshchyeyuya',
    )
  })

  it('maps the awkward letters the way the file names depend on', () => {
    expect(transliterate('ж')).toBe('zh')
    expect(transliterate('щ')).toBe('shch')
    expect(transliterate('ъ')).toBe('')
    expect(transliterate('ь')).toBe('')
    expect(transliterate('ы')).toBe('y')
    expect(transliterate('я')).toBe('ya')
    expect(transliterate('ё')).toBe('e')
  })

  it('slugifies a realistic title', () => {
    expect(slugify('Шу Пуэр 2018')).toBe('shu-puer-2018')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Шу Пуэр «Лао  Ча Тоу» — 2018!')).toBe('shu-puer-lao-cha-tou-2018')
  })

  it('strips diacritics rather than dropping the letters', () => {
    expect(slugify('Bái Mǔdān')).toBe('bai-mudan')
  })

  it('falls back for a title that transliterates to nothing', () => {
    expect(slugify('普洱熟茶')).toBe(SLUG_FALLBACK)
    expect(slugify('🍵🫖')).toBe(SLUG_FALLBACK)
    expect(slugify('   ')).toBe(SLUG_FALLBACK)
    expect(slugify('')).toBe(SLUG_FALLBACK)
    expect(slugify('—«»')).toBe(SLUG_FALLBACK)
  })

  it('never produces a slug that is only separators', () => {
    expect(slugify('---')).toBe(SLUG_FALLBACK)
  })

  it('caps the length on a separator boundary', () => {
    const slug = slugify('Шу Пуэр из провинции Юньнань урожая две тысячи восемнадцатого года')
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
    // Cut on a word boundary, so the tail is not half a word.
    expect(slug).toBe('shu-puer-iz-provincii-yunnan-urozhaya')
  })

  it('caps a single very long word without leaving a trailing dash', () => {
    const slug = slugify('a'.repeat(80))
    expect(slug.length).toBe(40)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('gives two identically titled teas distinct paths', () => {
    const a = modeFilePath('modes', 'Шу Пуэр', '6f1c2a3b-1111-4222-8333-444455556666')
    const b = modeFilePath('modes', 'Шу Пуэр', 'ffffffff-1111-4222-8333-444455556666')
    expect(a).toBe('modes/shu-puer-6f1c2a3b.md')
    expect(b).toBe('modes/shu-puer-ffffffff.md')
    expect(a).not.toBe(b)
  })

  it('honours a configured directory', () => {
    expect(modeFilePath('чай/записи', 'Шу', 'aabbccdd-1111-4222-8333-444455556666')).toBe(
      'чай/записи/shu-aabbccdd.md',
    )
  })

  it('builds an image path from the short id and extension', () => {
    expect(imageFilePath('assets', '6f1c2a3b-1111-4222-8333-444455556666', 'webp')).toBe(
      'assets/6f1c2a3b.webp',
    )
  })

  it('shortId takes the first eight hex characters', () => {
    expect(shortId('6f1c2a3b-1111-4222-8333-444455556666')).toBe('6f1c2a3b')
  })
})

describe('formatting', () => {
  it('formats durations as m:ss, adding hours only when needed', () => {
    expect(mmss(0)).toBe('0:00')
    expect(mmss(25)).toBe('0:25')
    expect(mmss(60)).toBe('1:00')
    expect(mmss(75)).toBe('1:15')
    expect(mmss(600)).toBe('10:00')
    expect(mmss(3675)).toBe('1:01:15')
  })

  it('rounds the countdown up, so 0:00 appears only at the end', () => {
    expect(msToClock(25_000)).toBe('0:25')
    expect(msToClock(24_001)).toBe('0:25')
    expect(msToClock(1)).toBe('0:01')
    expect(msToClock(0)).toBe('0:00')
    expect(msToClock(-500)).toBe('0:00')
  })

  it('builds the brewing context line, omitting an unset temperature', () => {
    expect(presetLabel(150, 8, 95)).toBe('150 мл · 8 г · 95°')
    expect(presetLabel(150, 8)).toBe('150 мл · 8 г')
    expect(presetLabel(200, 10.5, 100)).toBe('200 мл · 10,5 г · 100°')
  })

  it('shows whole numbers without a decimal part and uses a comma otherwise', () => {
    expect(formatNumber(8)).toBe('8')
    expect(formatNumber(10.5)).toBe('10,5')
    expect(formatNumber(150)).toBe('150')
  })
})
