import { z } from 'zod'

import { newId } from '@/lib/id'

/**
 * The domain model, and the zod schemas used to validate anything that arrives
 * from outside the app (a .md file pulled from the repository, or an old record
 * in IndexedDB). Local writes go through the constructors below, so the schemas
 * exist to guard the *untrusted* direction.
 */

/** One infusion. Only `seconds` is required — not every tea gets a temperature. */
export type BrewStep = {
  seconds: number
  tempC?: number
  pourMl?: number
  label?: string
  /**
   * A rinse is not counted when numbering infusions: the step after a rinse is
   * "Пролив 1", not "Пролив 2". This is a flag rather than a match on `label`
   * because the label is free text the user may write in any wording.
   */
  rinse?: boolean
}

/**
 * A vessel-volume preset. Steps live here, not on the mode, because the time
 * curve can legitimately differ between a 150 ml and a 200 ml brew. Grams are
 * entered by hand per volume rather than derived from a ratio — real teas are
 * non-linear and an imposed calculation would simply be wrong.
 */
export type VolumePreset = {
  id: string
  vesselVolume: number
  leafGrams: number
  steps: BrewStep[]
}

export type BrewMode = {
  id: string
  title: string
  /** Repo-root-relative path such as `assets/6f1c2a3b.webp`, set by the sync layer. */
  image?: string
  notes?: string
  presets: VolumePreset[]
  createdAt: string
  updatedAt: string
}

/* ── Schemas ──────────────────────────────────────────────────────────────── */

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), { message: 'not a date' })
  // Normalise on the way in so every stored timestamp has the same shape and
  // lexicographic string comparison is a valid chronological comparison.
  .transform((s) => new Date(s).toISOString())

export const brewStepSchema = z.object({
  seconds: z.coerce.number().finite().positive().max(24 * 3600),
  tempC: z.coerce.number().finite().min(0).max(200).optional(),
  pourMl: z.coerce.number().finite().positive().max(10_000).optional(),
  label: z.string().trim().min(1).optional(),
  rinse: z.boolean().optional(),
})

export const volumePresetSchema = z.object({
  // Presets pulled from a hand-edited file may have no id; mint one so the brew
  // screen can keep linking to a preset by id.
  id: z.string().min(1).optional().transform((v) => v ?? newId()),
  vesselVolume: z.coerce.number().finite().positive().max(10_000),
  leafGrams: z.coerce.number().finite().positive().max(1000),
  steps: z.array(brewStepSchema),
})

export const brewModeSchema = z.object({
  id: z.string().min(1).optional().transform((v) => v ?? newId()),
  title: z.coerce.string().trim().min(1),
  image: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  presets: z.array(volumePresetSchema).min(1, { message: 'no presets' }),
  createdAt: isoDate.optional(),
  updatedAt: isoDate.optional(),
})

/** Shape of a mode after validation, before defaults are filled in. */
export type ParsedBrewMode = z.output<typeof brewModeSchema>

/* ── Constructors ─────────────────────────────────────────────────────────── */

export const DEFAULT_VESSEL_VOLUME = 150
export const DEFAULT_LEAF_GRAMS = 8
export const DEFAULT_STEP_SECONDS = 25

export function newStep(overrides: Partial<BrewStep> = {}): BrewStep {
  return { seconds: DEFAULT_STEP_SECONDS, ...overrides }
}

export function newPreset(overrides: Partial<Omit<VolumePreset, 'id'>> = {}): VolumePreset {
  return {
    id: newId(),
    vesselVolume: DEFAULT_VESSEL_VOLUME,
    leafGrams: DEFAULT_LEAF_GRAMS,
    steps: [newStep()],
    ...overrides,
  }
}

export function newMode(overrides: Partial<BrewMode> = {}): BrewMode {
  const now = new Date().toISOString()
  return {
    id: newId(),
    title: '',
    presets: [newPreset()],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Fills in the fields the schema leaves optional, producing a complete mode. */
export function completeMode(parsed: ParsedBrewMode): BrewMode {
  const now = new Date().toISOString()
  return {
    id: parsed.id,
    title: parsed.title,
    image: parsed.image,
    notes: parsed.notes,
    presets: parsed.presets.map((p) => ({
      id: p.id,
      vesselVolume: p.vesselVolume,
      leafGrams: p.leafGrams,
      steps: p.steps.map(cleanStep),
    })),
    createdAt: parsed.createdAt ?? parsed.updatedAt ?? now,
    updatedAt: parsed.updatedAt ?? now,
  }
}

/** Drops keys whose value is undefined so serialised output stays minimal. */
function cleanStep(step: z.output<typeof brewStepSchema>): BrewStep {
  const out: BrewStep = { seconds: step.seconds }
  if (step.tempC !== undefined) out.tempC = step.tempC
  if (step.pourMl !== undefined) out.pourMl = step.pourMl
  if (step.label !== undefined) out.label = step.label
  if (step.rinse) out.rinse = true
  return out
}

/* ── Derived helpers ──────────────────────────────────────────────────────── */

/** Ascending list of vessel volumes, for the "150 / 200 мл" badge. */
export function modeVolumes(mode: BrewMode): number[] {
  return mode.presets.map((p) => p.vesselVolume).sort((a, b) => a - b)
}

/** Steps in the largest preset — used as the headline count on a card. */
export function maxStepCount(mode: BrewMode): number {
  return mode.presets.reduce((max, p) => Math.max(max, p.steps.length), 0)
}

/**
 * Infusion number for a step, skipping rinses. Returns null for a rinse itself.
 * Index 0 being a rinse means index 1 is infusion 1.
 */
export function infusionNumber(steps: readonly BrewStep[], index: number): number | null {
  if (steps[index]?.rinse) return null
  let n = 0
  for (let i = 0; i <= index && i < steps.length; i++) {
    if (!steps[i].rinse) n++
  }
  return n
}

/** Total number of real infusions, excluding rinses. */
export function infusionCount(steps: readonly BrewStep[]): number {
  return steps.reduce((n, s) => (s.rinse ? n : n + 1), 0)
}

export function findPreset(mode: BrewMode, presetId: string | null): VolumePreset | undefined {
  if (presetId === null) return mode.presets[0]
  return mode.presets.find((p) => p.id === presetId) ?? mode.presets[0]
}
