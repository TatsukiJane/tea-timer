import { z } from 'zod'

import { newId } from '@/lib/id'

/**
 * The domain model, and the zod schemas used to validate anything that arrives
 * from outside the app (a .md file pulled from the repository, or an old record
 * in IndexedDB). Local writes go through the constructors below, so the schemas
 * exist to guard the *untrusted* direction.
 */

/**
 * One infusion. Time is the only thing that varies from pour to pour.
 *
 * Temperature deliberately does NOT live here. In practice you set the water
 * temperature once and it simply cools on its own while you drink, so repeating it
 * on every step was both busywork and a false claim that it changes per pour. It
 * belongs to the preset. Likewise there is no per-step water amount: the preset's
 * `vesselVolume` already says how much goes in.
 */
export type BrewStep = {
  seconds: number
  label?: string
  /**
   * A rinse is not counted when numbering infusions: the step after a rinse is
   * "Пролив 1", not "Пролив 2". This is a flag rather than a match on `label`
   * because the label is free text the user may write in any wording.
   */
  rinse?: boolean
}

/**
 * A vessel-volume preset: everything that is constant for one way of brewing this
 * tea — how much the vessel holds, how much leaf, and how hot the water is.
 *
 * Steps live here, not on the mode, because the time curve can legitimately differ
 * between a 150 ml and a 200 ml brew. Grams are entered by hand per volume rather
 * than derived from a ratio — real teas are non-linear and an imposed calculation
 * would simply be wrong.
 */
export type VolumePreset = {
  id: string
  vesselVolume: number
  leafGrams: number
  /** Water temperature, °C. Optional: not everyone tracks it. */
  tempC?: number
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

const temperature = z.coerce.number().finite().min(0).max(200)

export const brewStepSchema = z.object({
  seconds: z.coerce.number().finite().positive().max(24 * 3600),
  label: z.string().trim().min(1).optional(),
  rinse: z.boolean().optional(),
  // Accepted but not kept: records and .md files written before temperature moved
  // up to the preset carried these per step. They are hoisted in the preset
  // transform below so an older vault reads without losing anything.
  tempC: temperature.optional(),
  pourMl: z.coerce.number().finite().positive().max(10_000).optional(),
})

export const volumePresetSchema = z
  .object({
    // Presets pulled from a hand-edited file may have no id; mint one so the brew
    // screen can keep linking to a preset by id.
    id: z.string().min(1).optional().transform((v) => v ?? newId()),
    vesselVolume: z.coerce.number().finite().positive().max(10_000),
    leafGrams: z.coerce.number().finite().positive().max(1000),
    tempC: temperature.optional(),
    steps: z.array(brewStepSchema),
  })
  .transform((preset) => ({
    id: preset.id,
    vesselVolume: preset.vesselVolume,
    leafGrams: preset.leafGrams,
    // A preset-level value wins; otherwise hoist from the steps.
    tempC: preset.tempC ?? hoistTemperature(preset.steps),
    steps: preset.steps,
  }))

/**
 * Picks the temperature to lift out of legacy per-step values.
 *
 * Prefers the first real infusion over a rinse: a rinse is often done with hotter
 * water than the brew itself, so taking step zero blindly would record 100° for a
 * tea actually brewed at 95°.
 */
function hoistTemperature(steps: readonly { tempC?: number; rinse?: boolean }[]): number | undefined {
  const infusion = steps.find((step) => step.rinse !== true && step.tempC !== undefined)
  return infusion?.tempC ?? steps.find((step) => step.tempC !== undefined)?.tempC
}

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
    presets: parsed.presets.map((p) => {
      const preset: VolumePreset = {
        id: p.id,
        vesselVolume: p.vesselVolume,
        leafGrams: p.leafGrams,
        steps: p.steps.map(cleanStep),
      }
      if (p.tempC !== undefined) preset.tempC = p.tempC
      return preset
    }),
    createdAt: parsed.createdAt ?? parsed.updatedAt ?? now,
    updatedAt: parsed.updatedAt ?? now,
  }
}

/**
 * Drops keys whose value is undefined so serialised output stays minimal, and
 * discards the legacy per-step temperature and pour volume — by this point the
 * preset transform has already hoisted the temperature.
 */
function cleanStep(step: z.output<typeof brewStepSchema>): BrewStep {
  const out: BrewStep = { seconds: step.seconds }
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
