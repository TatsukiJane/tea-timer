import { Document, isPair, isScalar, isSeq, visit } from 'yaml'

import { renderBody } from './tables'
import type { BrewMode } from '@/types/brew'

/**
 * Serialises a mode to markdown: YAML frontmatter carrying the full structure,
 * plus a generated human-readable body.
 *
 * The `yaml` library is used rather than a hand-rolled emitter, and the decisive
 * reason is quoting correctness, not the cosmetics of flow-style steps. This file
 * has to survive a round trip with arbitrary user text: a title containing ':' or
 * '#' or a leading '-', a purely numeric title like "2018" that must not come back
 * as a number, a label like "да" that must not come back as a boolean, multiline
 * notes. A hand-rolled emitter would have to reimplement YAML's plain-scalar
 * safety predicate, and getting that subtly wrong is exactly the class of bug that
 * quietly corrupts a knowledge base. js-yaml was rejected instead because it has
 * no Document API and no per-node style control, so it cannot produce flow-style
 * maps for step entries only.
 */

/** The frontmatter shape. Order here is the order in the file. */
type Frontmatter = {
  id: string
  title: string
  image?: string
  createdAt: string
  updatedAt: string
  notes?: string
  presets: {
    id: string
    vesselVolume: number
    leafGrams: number
    tempC?: number
    steps: Record<string, unknown>[]
  }[]
}

export function toFrontmatterObject(mode: BrewMode): Frontmatter {
  const hasNotes = mode.notes !== undefined && mode.notes.trim() !== ''
  // Key insertion order is the order in the emitted file, so the optional fields
  // are spread in position rather than assigned afterwards — otherwise `image`
  // and `notes` land below the presets block and the head of the file stops
  // being scannable.
  return {
    id: mode.id,
    title: mode.title,
    ...(mode.image !== undefined ? { image: mode.image } : {}),
    createdAt: mode.createdAt,
    updatedAt: mode.updatedAt,
    ...(hasNotes ? { notes: mode.notes } : {}),
    presets: mode.presets.map((preset) => ({
      id: preset.id,
      vesselVolume: preset.vesselVolume,
      leafGrams: preset.leafGrams,
      ...(preset.tempC !== undefined ? { tempC: preset.tempC } : {}),
      // Keys are emitted only when set, so a simple timer stays a simple file.
      steps: preset.steps.map((step) => {
        const entry: Record<string, unknown> = { seconds: step.seconds }
        if (step.label !== undefined) entry.label = step.label
        if (step.rinse) entry.rinse = true
        return entry
      }),
    })),
  }
}

export function serializeFrontmatter(mode: BrewMode): string {
  const doc = new Document(toFrontmatterObject(mode))

  // Steps are emitted inline — `{ seconds: 25, tempC: 95 }` — because a column of
  // one-line steps is far easier to scan in Obsidian than four nested lines each.
  visit(doc, {
    Map(_key, node, path) {
      if (isStepEntry(path)) node.flow = true
    },
  })

  return doc.toString({
    // Never fold long lines: a long Cyrillic title wrapped across two lines is
    // still valid YAML but unreadable, and it makes git diffs noisy.
    lineWidth: 0,
    flowCollectionPadding: true,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
    singleQuote: true,
    directives: false,
  })
}

/**
 * True when the visited map is an element of a `steps:` sequence.
 *
 * The ancestry of a step map is [doc, rootMap, Pair(presets), Seq, presetMap,
 * Pair(steps), Seq] — note the immediate grandparent of the sequence is a Pair,
 * not a Map, which is the easy thing to get wrong here.
 */
function isStepEntry(path: readonly unknown[]): boolean {
  if (!isSeq(path.at(-1))) return false
  const owner = path.at(-2)
  return isPair(owner) && isScalar(owner.key) && owner.key.value === 'steps'
}

export function serializeMode(mode: BrewMode): string {
  const frontmatter = serializeFrontmatter(mode).replace(/\n$/, '')
  return `---\n${frontmatter}\n---\n\n${renderBody(mode)}`
}
