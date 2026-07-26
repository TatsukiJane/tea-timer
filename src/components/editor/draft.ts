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
 * and converting once, on save, avoids that whole class of bug and lets us accept
 * "1:15" as well as "75" for a duration.
 */

export type StepDraft = {
  key: string
  seconds: string
  tempC: string
  pourMl: string
  label: string
  rinse: boolean
}

export type PresetDraft = {
  id: string
  vesselVolume: string
  leafGrams: string
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
    seconds: num(step.seconds),
    tempC: num(step.tempC),
    pourMl: num(step.pourMl),
    label: step.label ?? '',
    rinse: step.rinse === true,
  }
}

export function newStepDraft(after?: StepDraft): StepDraft {
  // Carrying temperature and pour volume forward from the previous step is what
  // the user almost always wants: those stay constant while the time ramps up.
  return {
    key: newId(),
    seconds: after?.seconds ?? String(DEFAULT_STEP_SECONDS),
    tempC: after?.tempC ?? '',
    pourMl: after?.pourMl ?? '',
    label: '',
    rinse: false,
  }
}

export function presetToDraft(preset: VolumePreset): PresetDraft {
  return {
    id: preset.id,
    vesselVolume: num(preset.vesselVolume),
    leafGrams: num(preset.leafGrams),
    steps: preset.steps.map(stepToDraft),
  }
}

export function newPresetDraft(): PresetDraft {
  return {
    id: newId(),
    vesselVolume: String(DEFAULT_VESSEL_VOLUME),
    leafGrams: String(DEFAULT_LEAF_GRAMS),
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

/**
 * Accepts "90", "1:30" and "1,5" (comma decimal, as Russian keyboards produce).
 * Returns null when the text is not a usable duration.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (text === '') return null

  if (text.includes(':')) {
    const parts = text.split(':')
    if (parts.length > 3) return null
    let total = 0
    for (const part of parts) {
      const piece = Number(part)
      if (!Number.isFinite(piece) || piece < 0) return null
      total = total * 60 + piece
    }
    return total > 0 ? Math.round(total) : null
  }

  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

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
  | { kind: 'preset'; presetId: string; field: 'vesselVolume' | 'leafGrams' }
  | { kind: 'step'; presetId: string; stepKey: string; field: 'seconds' | 'tempC' | 'pourMl' }
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
    if (preset.steps.length === 0) errors.push({ kind: 'noSteps', presetId: preset.id })

    const steps: BrewStep[] = preset.steps.map((step) => {
      const seconds = parseDuration(step.seconds)
      if (seconds === null) {
        errors.push({ kind: 'step', presetId: preset.id, stepKey: step.key, field: 'seconds' })
      }
      const tempC = parseOptional(step.tempC)
      if (tempC === null) {
        errors.push({ kind: 'step', presetId: preset.id, stepKey: step.key, field: 'tempC' })
      }
      const pourMl = parseOptional(step.pourMl)
      if (pourMl === null) {
        errors.push({ kind: 'step', presetId: preset.id, stepKey: step.key, field: 'pourMl' })
      }

      const out: BrewStep = { seconds: seconds ?? 0 }
      if (tempC !== null && tempC !== undefined) out.tempC = tempC
      if (pourMl !== null && pourMl !== undefined) out.pourMl = pourMl
      const label = step.label.trim()
      if (label !== '') out.label = label
      if (step.rinse) out.rinse = true
      return out
    })

    return {
      id: preset.id,
      vesselVolume: vesselVolume ?? 0,
      leafGrams: leafGrams ?? 0,
      steps,
    }
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
