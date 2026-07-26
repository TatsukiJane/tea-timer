import { parse as parseYaml } from 'yaml'

import { brewModeSchema, completeMode, type BrewMode } from '@/types/brew'

/**
 * Parses a mode out of a .md file.
 *
 * Only the frontmatter is read. Everything after it — heading, tables, notes
 * section — is discarded, because the body is regenerated on every push. This is
 * enforced by simply not writing a body parser: the temptation to "at least
 * recover the notes from ## Заметки" is precisely how a one-way format becomes
 * accidentally bidirectional and the two representations start to disagree.
 *
 * Failures are returned, never thrown: one hand-mangled file must not abort a
 * whole pull, so the caller reports it per-file instead.
 */

export type ParseFailure =
  | { ok: false; reason: 'no-frontmatter' }
  | { ok: false; reason: 'bad-yaml'; message: string }
  | { ok: false; reason: 'invalid'; message: string }

export type ParseResult = { ok: true; mode: BrewMode } | ParseFailure

/**
 * Anchored at the start of the file. Tolerates CRLF (Obsidian on Windows, and
 * GitHub's web editor) and a trailing space after the closing fence.
 */
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function extractFrontmatter(source: string): string | null {
  // A leading BOM survives round trips through some editors and would otherwise
  // stop the anchored match.
  const text = source.replace(/^﻿/, '')
  const match = FRONTMATTER_RE.exec(text)
  return match === null ? null : match[1]
}

export function parseMode(source: string): ParseResult {
  const block = extractFrontmatter(source)
  if (block === null) return { ok: false, reason: 'no-frontmatter' }

  let raw: unknown
  try {
    raw = parseYaml(block)
  } catch (error) {
    return { ok: false, reason: 'bad-yaml', message: messageOf(error) }
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid', message: 'frontmatter is not a mapping' }
  }

  const parsed = brewModeSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path.join('.')
    return {
      ok: false,
      reason: 'invalid',
      message: path === undefined || path === '' ? (first?.message ?? 'invalid') : `${path}: ${first?.message}`,
    }
  }

  return { ok: true, mode: completeMode(parsed.data) }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
