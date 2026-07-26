import { formatNumber, mmss } from '@/lib/format'
import { infusionNumber, type BrewMode, type BrewStep, type VolumePreset } from '@/types/brew'

/**
 * Generates the human-readable body of a mode's .md file: the part you actually
 * read in Obsidian. It is regenerated from the frontmatter on every push and is
 * never parsed back (see md/parse.ts for why that matters).
 *
 * These headings are format constants, not UI strings, and deliberately do not go
 * through the i18n dictionary: they are part of the on-disk format, so switching
 * the interface language must not rewrite every file in the repository.
 */
const HEADINGS = {
  step: 'Пролив',
  time: 'Время',
  temp: 'Темп.',
  volume: 'Объём',
  label: 'Метка',
  notes: 'Заметки',
  rinse: 'промывка',
  ml: 'мл',
  g: 'г',
} as const

const EMPTY_CELL = '—'

export function renderBody(mode: BrewMode): string {
  const blocks: string[] = [`# ${mode.title}`]

  if (mode.image !== undefined) {
    // The body link is relative (the file sits in modes/), while the frontmatter
    // `image:` holds the repo-root-relative path. That asymmetry is intentional:
    // the frontmatter is the machine-readable canonical form, and Obsidian needs a
    // path relative to the note to render the picture. Do not "fix" one to match
    // the other.
    blocks.push(`![${mode.title}](../${mode.image})`)
  }

  for (const preset of mode.presets) {
    blocks.push(`## ${presetHeading(preset)}`)
    blocks.push(renderTable(preset.steps))
  }

  if (mode.notes !== undefined && mode.notes.trim() !== '') {
    blocks.push(`## ${HEADINGS.notes}`)
    blocks.push(mode.notes.trim())
  }

  return blocks.join('\n\n') + '\n'
}

function presetHeading(preset: VolumePreset): string {
  return `${formatNumber(preset.vesselVolume)} ${HEADINGS.ml} · ${formatNumber(preset.leafGrams)} ${HEADINGS.g}`
}

function renderTable(steps: readonly BrewStep[]): string {
  const rows = steps.map((step, index) => [
    stepCell(steps, index),
    mmss(step.seconds),
    step.tempC === undefined ? EMPTY_CELL : `${formatNumber(step.tempC)}°`,
    step.pourMl === undefined ? EMPTY_CELL : `${formatNumber(step.pourMl)}${HEADINGS.ml}`,
    step.label ?? EMPTY_CELL,
  ])

  const header = [HEADINGS.step, HEADINGS.time, HEADINGS.temp, HEADINGS.volume, HEADINGS.label]
  return renderMarkdownTable(header, rows)
}

function stepCell(steps: readonly BrewStep[], index: number): string {
  const step = steps[index]
  if (step.rinse) return HEADINGS.rinse
  return String(infusionNumber(steps, index) ?? index + 1)
}

/** Pads columns so the raw text stays readable when the file is opened as source. */
function renderMarkdownTable(header: readonly string[], rows: readonly string[][]): string {
  const widths = header.map((cell, column) =>
    Math.max(displayWidth(cell), ...rows.map((row) => displayWidth(row[column] ?? ''))),
  )
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, i) => pad(cell, widths[i])).join(' | ')} |`
  const divider = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`

  return [line(header), divider, ...rows.map(line)].join('\n')
}

function pad(cell: string, width: number): string {
  return cell + ' '.repeat(Math.max(0, width - displayWidth(cell)))
}

/**
 * Counts code points rather than UTF-16 units, so an emoji in a label does not
 * throw the padding out. Not a true terminal width — good enough for alignment.
 */
function displayWidth(cell: string): number {
  return [...cell].length
}
