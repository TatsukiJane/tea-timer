import type { DBSchema } from 'idb'

import type { BrewMode } from '@/types/brew'

/** A tea photo, re-encoded on import. Stored as a Blob, not a dataURL — see db/images.ts. */
export type StoredImage = {
  id: string
  blob: Blob
  mime: string
  ext: string
  width: number
  height: number
  updatedAt: string
  /** True until the sync layer has uploaded this blob to the repository. */
  dirty: boolean
}

export type GithubConfig = {
  owner: string
  repo: string
  branch: string
  modesDir: string
  assetsDir: string
}

export type Prefs = {
  sound: boolean
  vibration: boolean
  wakeLock: boolean
}

/** An interrupted brew, so a reload mid-session does not lose your place. */
export type BrewSession = {
  modeId: string
  presetId: string
  stepIndex: number
  completed: boolean[]
  /** Absolute deadline if a step was running when we were interrupted. */
  endAt?: number
  savedAt: number
}

export type SettingsRow =
  | { key: 'github'; value: GithubConfig }
  // The token is its own row on purpose: clearing it is a single delete, and no
  // code path can accidentally serialise it alongside the other preferences.
  | { key: 'token'; value: string }
  | { key: 'prefs'; value: Prefs }
  | { key: 'session'; value: BrewSession }
  | { key: 'lastSyncAt'; value: string }

export type SettingsKey = SettingsRow['key']

/**
 * Per-mode sync bookkeeping. This store *is* the outbox: `dirty` is the push
 * queue and the tombstones store is the delete queue. There is no separate
 * queue store, because a queue derived from current state is idempotent by
 * construction — no duplicate entries and no ordering problems.
 */
export type SyncMeta = {
  modeId: string
  /** Path of the .md file in the repo, as last written. */
  path?: string
  sha?: string
  imagePath?: string
  imageSha?: string
  dirty: boolean
  lastPushedAt?: string
  /**
   * The mode's `updatedAt` at the moment we last pushed it. If the remote file
   * no longer carries this value, someone else has written since — that is the
   * conflict signal.
   */
  lastPushedUpdatedAt?: string
}

/** A mode deleted locally whose repository files still need removing. */
export type Tombstone = {
  modeId: string
  path?: string
  sha?: string
  imagePath?: string
  imageSha?: string
  deletedAt: string
}

export interface TeaTimerDB extends DBSchema {
  modes: {
    key: string
    value: BrewMode
    indexes: { 'by-updatedAt': string }
  }
  images: {
    key: string
    value: StoredImage
  }
  settings: {
    key: SettingsKey
    value: SettingsRow
  }
  syncMeta: {
    key: string
    value: SyncMeta
  }
  tombstones: {
    key: string
    value: Tombstone
  }
}

export const DB_NAME = 'tea-timer'
export const DB_VERSION = 1
