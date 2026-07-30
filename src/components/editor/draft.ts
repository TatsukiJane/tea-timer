import { digitsToSeconds, secondsToDigits } from '@/lib/duration'
import { newId } from '@/lib/id'
import {
  DEFAULT_LEAF_GRAMS,
  DEFAULT_STEP_SECONDS,
  DEFAULT_VESSEL_VOLUME,
  type BrewMode,
  type BrewStep,
  type VolumePreset,
} from '@/types/brew'

/**
 * The editor keeps numbers as strings.
 *
 * A controlled <input type="number"> bound to a number cannot be emptied — the
 * moment the field is blank there is no number to store, so either the field
 * snaps back to the old value or you store NaN. Keeping the raw text in the draft
 * and converting once, on save, avoids that whole class of bug.
 */

export type StepDraft = {
  key: string
  /** Digits typed into the m:ss mask, e.g. "115" for 1:15. See lib/duration.ts. */
  seconds: string
  label: string
  rinse: boolean
}

export type PresetDraft = {
  id: string
  vesselVolume: string
  leafGrams: string
  tempC: string
  steps: StepDraft[]
}

export type ModeDraft = {
  id: string
  title: string
  notes: string
  image?: string
  presets: PresetDraft[]
  createdAt: string
  updatedAt: string
}

const num = (value: number | undefined): string => (value === undefined ? '' : String(value))

export function stepToDraft(step: BrewStep): StepDraft {
  return {
    key: newId(),
    seconds: secondsToDigits(step.seconds),
    label: step.label ?? '',
    rinse: step.rinse === true,
  }
}

export function newStepDraft(after?: StepDraft): StepDraft {
  return {
    key: newId(),
    // Seed from the previous step: the curve usually climbs from something close
    // to the last value rather than from a fixed default.
    seconds: after?.seconds ?? secondsToDigits(DEFAULT_STEP_SECONDS),
    label: '',
    rinse: false,
  }
}

export function presetToDraft(preset: VolumePreset): PresetDraft {
  return {
    id: preset.id,
    vesselVolume: num(preset.vesselVolume),
    leafGrams: num(preset.leafGrams),
    tempC: num(preset.tempC),
    steps: preset.steps.map(stepToDraft),
  }
}

export function newPresetDraft(): PresetDraft {
  return {
    id: newId(),
    vesselVolume: String(DEFAULT_VESSEL_VOLUME),
    leafGrams: String(DEFAULT_LEAF_GRAMS),
    tempC: '',
    steps: [newStepDraft()],
  }
}

export function modeToDraft(mode: BrewMode): ModeDraft {
  return {
    id: mode.id,
    title: mode.title,
    notes: mode.notes ?? '',
    image: mode.image,
    presets: mode.presets.map(presetToDraft),
    createdAt: mode.createdAt,
    updatedAt: mode.updatedAt,
  }
}

/**
 * A draft that is a copy of an existing tea, as a brand-new record.
 *
 * Everything identifying is re-minted: the mode id, every preset id (a preset id
 * is referenced by the stored brew session), and — via `stepToDraft` — the React
 * keys. `createdAt` is now, not the original's, or the copy would land in the
 * middle of the list sorted by date.
 *
 * `image` is dropped on purpose. It is a repository path derived from the *mode
 * id* (`lib/slug.ts`), so carrying it over would make the copy's .md point at the
 * original's asset. The picture travels as bytes instead: the caller re-attaches
 * the blob under the new id, and the push path computes the new path from it.
 */
export function copyModeDraft(mode: BrewMode, title: string): ModeDraft {
  const now = new Date().toISOString()
  const source = modeToDraft(mode)
  return {
    ...source,
    id: newId(),
    title,
    image: undefined,
    presets: source.presets.map((preset) => ({ ...preset, id: newId() })),
    createdAt: now,
    updatedAt: now,
  }
}

export function newModeDraft(): ModeDraft {
  const now = new Date().toISOString()
  return {
    id: newId(),
    title: '',
    notes: '',
    presets: [newPresetDraft()],
    createdAt: now,
    updatedAt: now,
  }
}

/* ── Parsing ──────────────────────────────────────────────────────────────── */

/** Optional positive number; '' means "not set", bad text means invalid. */
function parseOptional(input: string): number | null | undefined {
  const text = input.trim().replace(',', '.')
  if (text === '') return undefined
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function parseRequired(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export type DraftError =
  | { kind: 'title' }
  | { kind: 'preset'; presetId: string; field: 'vesselVolume' | 'leafGrams' | 'tempC' }
  | { kind: 'step'; presetId: string; stepKey: string; field: 'seconds' }
  | { kind: 'noSteps'; presetId: string }

export type DraftResult =
  | { ok: true; mode: BrewMode }
  | { ok: false; errors: DraftError[] }

/** Validates the whole draft and produces a BrewMode, or the list of problems. */
export function draftToMode(draft: ModeDraft): DraftResult {
  const errors: DraftError[] = []

  const title = draft.title.trim()
  if (title === '') errors.push({ kind: 'title' })

  const presets: VolumePreset[] = draft.presets.map((preset) => {
    const vesselVolume = parseRequired(preset.vesselVolume)
    if (vesselVolume === null) {
      errors.push({ kind: 'preset', presetId: preset.id, field: 'vesselVolume' })
    }
    const leafGrams = parseRequired(preset.leafGrams)
    if (leafGrams === null) {
      errors.push({ kind: 'preset', presetId: preset.id, field: 'leafGrams' })
    }
    const tempC = parseOptional(preset.tempC)
    if (tempC === null) {
      errors.push({ kind: 'preset', presetId: preset.id, field: 'tempC' })
    }
    if (preset.steps.length === 0) errors.push({ kind: 'noSteps', presetId: preset.id })

    const steps: BrewStep[] = preset.steps.map((step) => {
      const seconds = digitsToSeconds(step.seconds)
      if (seconds === null) {
        errors.push({ kind: 'step', presetId: preset.id, stepKey: step.key, field: 'seconds' })
      }

      const out: BrewStep = { seconds: seconds ?? 0 }
      const label = step.label.trim()
      if (label !== '') out.label = label
      if (step.rinse) out.rinse = true
      return out
    })

    const out: VolumePreset = {
      id: preset.id,
      vesselVolume: vesselVolume ?? 0,
      leafGrams: leafGrams ?? 0,
      steps,
    }
    if (tempC !== null && tempC !== undefined) out.tempC = tempC
    return out
  })

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    mode: {
      id: draft.id,
      title,
      image: draft.image,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
      presets,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    },
  }
}

export function hasError(errors: readonly DraftError[], predicate: (e: DraftError) => boolean): boolean {
  return errors.some(predicate)
}
