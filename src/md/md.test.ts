import { describe, expect, it } from 'vitest'

import { parseMode } from './parse'
import { serializeMode } from './serialize'
import type { BrewMode } from '@/types/brew'

const BASE: BrewMode = {
  id: '6f1c2a3b-1111-4222-8333-444455556666',
  title: 'Шу Пуэр 2018',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-26T10:00:00.000Z',
  presets: [
    {
      id: 'aaaaaaaa-1111-4222-8333-444455556666',
      vesselVolume: 150,
      leafGrams: 8,
      steps: [
        { seconds: 25, tempC: 95, pourMl: 150, label: 'промывка', rinse: true },
        { seconds: 25, tempC: 95, pourMl: 150 },
        { seconds: 45, tempC: 95, pourMl: 150 },
        { seconds: 60, tempC: 95, pourMl: 150 },
      ],
    },
    {
      id: 'bbbbbbbb-1111-4222-8333-444455556666',
      vesselVolume: 200,
      leafGrams: 10,
      steps: [
        { seconds: 25 },
        { seconds: 45 },
        { seconds: 60 },
      ],
    },
  ],
}

/** Serialise then parse: the mode must come back byte-for-byte equivalent. */
function roundTrip(mode: BrewMode): BrewMode {
  const result = parseMode(serializeMode(mode))
  if (!result.ok) throw new Error(`parse failed: ${JSON.stringify(result)}`)
  return result.mode
}

describe('markdown round trip', () => {
  it('preserves a realistic mode exactly', () => {
    expect(roundTrip(BASE)).toEqual(BASE)
  })

  it('preserves steps with no optional fields at all', () => {
    const mode: BrewMode = {
      ...BASE,
      presets: [{ ...BASE.presets[0], steps: [{ seconds: 30 }, { seconds: 40 }] }],
    }
    expect(roundTrip(mode)).toEqual(mode)
  })

  it('preserves presets whose step counts differ', () => {
    const back = roundTrip(BASE)
    expect(back.presets.map((p) => p.steps.length)).toEqual([4, 3])
  })

  it('preserves the rinse flag', () => {
    const back = roundTrip(BASE)
    expect(back.presets[0].steps[0].rinse).toBe(true)
    expect(back.presets[0].steps[1].rinse).toBeUndefined()
  })

  it('preserves preset ids, so the brew screen keeps its link after a pull', () => {
    expect(roundTrip(BASE).presets.map((p) => p.id)).toEqual(BASE.presets.map((p) => p.id))
  })

  it('preserves fractional grams', () => {
    const mode: BrewMode = {
      ...BASE,
      presets: [{ ...BASE.presets[0], leafGrams: 7.5 }],
    }
    expect(roundTrip(mode).presets[0].leafGrams).toBe(7.5)
  })

  // These are the titles that break naive emitters. Each would either fail to
  // parse or silently change type if the YAML quoting were wrong.
  const trickyTitles: Array<[name: string, title: string]> = [
    ['a colon', 'Шу Пуэр: урожай 2018'],
    ['a leading dash', '- Дянь Хун'],
    ['a hash', 'Да Хун Пао #2'],
    ['a purely numeric string', '2018'],
    ['a numeric-looking version', '1.5'],
    ['a YAML boolean word', 'да'],
    ['the English word no', 'no'],
    ['the word null', 'null'],
    ['a leading exclamation', '!Лао Ча Тоу'],
    ['a leading ampersand', '&Габа'],
    ['a leading asterisk', '*Молочный Улун'],
    ['curly braces', '{Шэн}'],
    ['square brackets', '[Хэй Ча]'],
    ['a trailing colon', 'Улун:'],
    ['a quote character', 'Те Гуань Инь "Осень"'],
    ['a single quote', "Ци Мэнь 'Ки-Мун'"],
    ['an emoji', '🍵 Шу Пуэр'],
    ['CJK only', '普洱熟茶'],
    ['a leading percent', '%Пуэр'],
    ['a leading at sign', '@Шэн'],
    ['a leading backtick', '`Хэй Ча'],
    ['a newline-adjacent hash comment', 'Шу # не комментарий'],
  ]

  for (const [name, title] of trickyTitles) {
    it(`keeps a title with ${name} as a string`, () => {
      const back = roundTrip({ ...BASE, title })
      expect(back.title).toBe(title)
      expect(typeof back.title).toBe('string')
    })
  }

  it('keeps a label that looks like a boolean as a string', () => {
    const mode: BrewMode = {
      ...BASE,
      presets: [{ ...BASE.presets[0], steps: [{ seconds: 25, label: 'да' }, { seconds: 30, label: 'off' }] }],
    }
    const back = roundTrip(mode)
    expect(back.presets[0].steps[0].label).toBe('да')
    expect(back.presets[0].steps[1].label).toBe('off')
  })

  it('preserves multiline notes', () => {
    const notes = 'Первая строка\nВторая строка\n\nАбзац после пустой строки'
    expect(roundTrip({ ...BASE, notes }).notes).toBe(notes)
  })

  it('preserves notes that begin with markdown syntax', () => {
    const notes = '# Заголовок\n- пункт\n> цитата'
    expect(roundTrip({ ...BASE, notes }).notes).toBe(notes)
  })

  it('preserves the image path', () => {
    expect(roundTrip({ ...BASE, image: 'assets/6f1c2a3b.webp' }).image).toBe('assets/6f1c2a3b.webp')
  })

  it('omits absent optional fields rather than writing empty ones', () => {
    const text = serializeMode(BASE)
    expect(text).not.toMatch(/^image:/m)
    expect(text).not.toMatch(/^notes:/m)
  })
})

describe('emitted file shape', () => {
  it('matches the expected format', () => {
    // A golden snapshot, so that changing a stringify option — which would rewrite
    // every file in the repository on the next push — cannot happen unnoticed.
    expect(serializeMode(BASE)).toMatchInlineSnapshot(`
      "---
      id: 6f1c2a3b-1111-4222-8333-444455556666
      title: Шу Пуэр 2018
      createdAt: 2026-07-01T08:00:00.000Z
      updatedAt: 2026-07-26T10:00:00.000Z
      presets:
        - id: aaaaaaaa-1111-4222-8333-444455556666
          vesselVolume: 150
          leafGrams: 8
          steps:
            - { seconds: 25, tempC: 95, pourMl: 150, label: промывка, rinse: true }
            - { seconds: 25, tempC: 95, pourMl: 150 }
            - { seconds: 45, tempC: 95, pourMl: 150 }
            - { seconds: 60, tempC: 95, pourMl: 150 }
        - id: bbbbbbbb-1111-4222-8333-444455556666
          vesselVolume: 200
          leafGrams: 10
          steps:
            - { seconds: 25 }
            - { seconds: 45 }
            - { seconds: 60 }
      ---

      # Шу Пуэр 2018

      ## 150 мл · 8 г

      | Пролив   | Время | Темп. | Объём | Метка    |
      |----------|-------|-------|-------|----------|
      | промывка | 0:25  | 95°   | 150мл | промывка |
      | 1        | 0:25  | 95°   | 150мл | —        |
      | 2        | 0:45  | 95°   | 150мл | —        |
      | 3        | 1:00  | 95°   | 150мл | —        |

      ## 200 мл · 10 г

      | Пролив | Время | Темп. | Объём | Метка |
      |--------|-------|-------|-------|-------|
      | 1      | 0:25  | —     | —     | —     |
      | 2      | 0:45  | —     | —     | —     |
      | 3      | 1:00  | —     | —     | —     |
      "
    `)
  })

  it('emits steps in flow style and Cyrillic unquoted', () => {
    const text = serializeMode(BASE)
    expect(text).toContain('- { seconds: 25, tempC: 95, pourMl: 150, label: промывка, rinse: true }')
    expect(text).toContain('title: Шу Пуэр 2018')
  })

  it('does not fold a very long title across lines', () => {
    const title = 'Шу Пуэр из провинции Юньнань урожая 2018 года прессованный в блин 357 грамм'
    const text = serializeMode({ ...BASE, title })
    expect(text).toContain(`title: ${title}`)
    expect(roundTrip({ ...BASE, title }).title).toBe(title)
  })
})

describe('parse failures are reported, not thrown', () => {
  it('rejects a file with no frontmatter', () => {
    expect(parseMode('# Просто заголовок\n\nтекст')).toEqual({
      ok: false,
      reason: 'no-frontmatter',
    })
  })

  it('rejects an unterminated frontmatter fence', () => {
    expect(parseMode('---\nid: x\ntitle: Шу\n')).toEqual({ ok: false, reason: 'no-frontmatter' })
  })

  it('rejects frontmatter that is not a mapping', () => {
    const result = parseMode('---\n- one\n- two\n---\n')
    expect(result.ok).toBe(false)
  })

  it('reports malformed YAML rather than throwing', () => {
    const result = parseMode('---\ntitle: "unterminated\npresets: [\n---\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(['bad-yaml', 'invalid']).toContain(result.reason)
  })

  it('rejects a mode with no presets', () => {
    const result = parseMode('---\nid: x\ntitle: Шу\npresets: []\n---\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it('rejects a step whose seconds are zero or negative', () => {
    const source = [
      '---',
      'id: x',
      'title: Шу',
      'presets:',
      '  - vesselVolume: 150',
      '    leafGrams: 8',
      '    steps:',
      '      - { seconds: 0 }',
      '---',
      '',
    ].join('\n')
    expect(parseMode(source).ok).toBe(false)
  })

  it('reads CRLF files, as produced by the GitHub web editor', () => {
    const crlf = serializeMode(BASE).replace(/\n/g, '\r\n')
    const result = parseMode(crlf)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mode.title).toBe('Шу Пуэр 2018')
  })

  it('reads a file with a leading BOM', () => {
    const result = parseMode('﻿' + serializeMode(BASE))
    expect(result.ok).toBe(true)
  })
})

describe('repairs on hand-edited files', () => {
  const minimal = [
    '---',
    'title: Шу Пуэр',
    'presets:',
    '  - vesselVolume: 150',
    '    leafGrams: 8',
    '    steps:',
    '      - { seconds: 25 }',
    '      - { seconds: 45 }',
    '---',
    '',
  ].join('\n')

  it('mints a missing mode id and preset id', () => {
    const result = parseMode(minimal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mode.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.mode.presets[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('fills in timestamps when they are absent', () => {
    const result = parseMode(minimal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number.isNaN(new Date(result.mode.updatedAt).getTime())).toBe(false)
    expect(result.mode.createdAt).toBe(result.mode.createdAt)
  })

  it('normalises a loosely written date to a comparable ISO string', () => {
    // updatedAt drives last-write-wins, and lexicographic comparison is only a
    // valid chronological comparison if every stored value has the same shape.
    const source = minimal.replace('title: Шу Пуэр', 'title: Шу Пуэр\nupdatedAt: 2026-07-26 10:00:00Z')
    const result = parseMode(source)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mode.updatedAt).toBe('2026-07-26T10:00:00.000Z')
  })

  it('coerces numeric strings written by hand', () => {
    const source = minimal.replace('- { seconds: 25 }', "- { seconds: '25', tempC: '95' }")
    const result = parseMode(source)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mode.presets[0].steps[0].seconds).toBe(25)
      expect(result.mode.presets[0].steps[0].tempC).toBe(95)
    }
  })

  it('strips unknown keys instead of failing', () => {
    const source = minimal.replace('- { seconds: 25 }', '- { seconds: 25, madeUp: 7 }')
    const result = parseMode(source)
    expect(result.ok).toBe(true)
    if (result.ok) expect('madeUp' in result.mode.presets[0].steps[0]).toBe(false)
  })

  it('ignores the generated body entirely', () => {
    // Tables are output, never input: editing a table by hand must have no effect.
    const tampered = serializeMode(BASE).replace('| 1        | 0:25', '| 1        | 9:99')
    const result = parseMode(tampered)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mode.presets[0].steps[1].seconds).toBe(25)
  })
})
