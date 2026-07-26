import { getImage, markImageClean, putImageFromRemote } from '@/db/images'
import { getMode, listModes, putModeFromRemote } from '@/db/modes'
import type { GithubConfig, SyncMeta } from '@/db/schema'
import { getGithubConfig, getToken, isConfigured, setLastSyncAt } from '@/db/settings'
import {
  clearTombstone,
  getSyncMeta,
  listDirtyModeIds,
  listTombstones,
  setSyncMeta,
} from '@/db/syncMeta'
import { imageFilePath, modeFilePath } from '@/lib/slug'
import { base64ToUtf8 } from '@/lib/base64'
import { parseMode } from '@/md/parse'
import { serializeMode } from '@/md/serialize'
import { notifyModesChanged } from '@/state/useModes'
import type { BrewMode } from '@/types/brew'
import { ConflictError, NotConfiguredError, SyncError } from './errors'
import { GithubClient } from './githubClient'

/**
 * Push/pull orchestration.
 *
 * Every operation is serialised through a module-level promise-chain mutex.
 * Concurrent commits to the same branch race each other and produce 409s, and a
 * personal app has no reason at all to parallelise them.
 */

let chain: Promise<unknown> = Promise.resolve()

function serialised<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  // Keep the chain alive regardless of outcome, without swallowing the result.
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Small gap between consecutive writes: the secondary rate limit targets bursts. */
const WRITE_GAP_MS = 250
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function makeClient(): Promise<{ client: GithubClient; config: GithubConfig }> {
  const [config, token] = await Promise.all([getGithubConfig(), getToken()])
  if (!isConfigured(config, token)) throw new NotConfiguredError()
  return { client: new GithubClient(config, token as string), config }
}

export async function isSyncConfigured(): Promise<boolean> {
  const [config, token] = await Promise.all([getGithubConfig(), getToken()])
  return isConfigured(config, token)
}

/* ── Conflict handling ─────────────────────────────────────────────────────────
 * Not silent last-write-wins. Before overwriting we check whether the remote file
 * still carries the updatedAt we last pushed; if not, someone wrote from another
 * device and the user is asked what to do. The alternative loses an edit with no
 * trace beyond the git history. */

export type Conflict = {
  mode: BrewMode
  remoteMode: BrewMode
  remotePath: string
  remoteSha: string
}

export type ConflictResolution = 'overwrite' | 'takeRemote' | 'skip'

type ConflictResolver = (conflict: Conflict) => Promise<ConflictResolution>

let resolveConflict: ConflictResolver = () => Promise.resolve('skip')

/** The UI installs the dialog here; without one, conflicts are left pending. */
export function setConflictResolver(resolver: ConflictResolver): void {
  resolveConflict = resolver
}

/* ── Push ─────────────────────────────────────────────────────────────────── */

export type PushOutcome =
  | { kind: 'pushed' }
  | { kind: 'skipped'; reason: 'not-configured' | 'no-mode' | 'conflict-pending' }
  | { kind: 'took-remote' }
  | { kind: 'failed'; error: unknown }

/**
 * Fire-and-forget push after a local save. Never blocks or fails the local write:
 * IndexedDB has already committed, so on failure the mode simply stays dirty and
 * the Sync button will pick it up.
 */
export function requestPush(modeId: string): Promise<PushOutcome> {
  return serialised(() => pushOne(modeId)).catch((error: unknown) => ({
    kind: 'failed' as const,
    error,
  }))
}

async function pushOne(modeId: string): Promise<PushOutcome> {
  if (!(await isSyncConfigured())) return { kind: 'skipped', reason: 'not-configured' }
  const mode = await getMode(modeId)
  if (mode === undefined) return { kind: 'skipped', reason: 'no-mode' }

  const { client, config } = await makeClient()
  const meta = (await getSyncMeta(modeId)) ?? { modeId, dirty: true }
  const path = modeFilePath(config.modesDir, mode.title, mode.id)

  // Conflict check: only meaningful once we have pushed this mode at least once.
  if (meta.lastPushedUpdatedAt !== undefined && meta.path !== undefined) {
    const remote = await client.getContent(meta.path)
    if (remote !== null) {
      const parsed = parseMode(base64ToUtf8(remote.contentBase64))
      if (parsed.ok && parsed.mode.updatedAt !== meta.lastPushedUpdatedAt) {
        const decision = await resolveConflict({
          mode,
          remoteMode: parsed.mode,
          remotePath: meta.path,
          remoteSha: remote.sha,
        })
        if (decision === 'skip') return { kind: 'skipped', reason: 'conflict-pending' }
        if (decision === 'takeRemote') {
          await adoptRemote(parsed.mode, meta.path, remote.sha, client, config)
          notifyModesChanged()
          return { kind: 'took-remote' }
        }
        // 'overwrite' falls through, but with the fresh sha so the PUT succeeds.
        await setSyncMeta(modeId, { sha: remote.sha })
        meta.sha = remote.sha
      }
    }
  }

  // The image goes first, so the markdown's `image:` never points at a blob that
  // does not exist yet.
  let imagePath = meta.imagePath
  let imageSha = meta.imageSha
  const image = await getImage(modeId)
  if (image !== undefined && image.dirty) {
    imagePath = imageFilePath(config.assetsDir, modeId, image.ext)
    const result = await client.putBlob(
      imagePath,
      image.blob,
      `chore(tea): image for ${mode.title}`,
      imagePath === meta.imagePath ? meta.imageSha : await shaFor(client, imagePath),
    )
    imageSha = result.contentSha
    await markImageClean(modeId)
    await pause(WRITE_GAP_MS)
  }

  const modeForFile: BrewMode = imagePath === undefined ? mode : { ...mode, image: imagePath }
  const body = serializeMode(modeForFile)

  const write = await putWithRetry(
    client,
    path,
    body,
    `chore(tea): ${mode.title}`,
    path === meta.path ? meta.sha : await shaFor(client, path),
  )

  // A retitle changes the slug. PUT the new path first, then DELETE the old one in
  // a separate request — the API docs warn explicitly against running a PUT and a
  // DELETE against the same repository concurrently.
  if (meta.path !== undefined && meta.path !== path) {
    await pause(WRITE_GAP_MS)
    const stale = await client.getContent(meta.path)
    if (stale !== null) {
      await client.deleteFile(meta.path, stale.sha, `chore(tea): rename ${mode.title}`)
    }
  }

  await setSyncMeta(modeId, {
    path,
    sha: write.contentSha,
    imagePath,
    imageSha,
    dirty: false,
    lastPushedAt: new Date().toISOString(),
    lastPushedUpdatedAt: mode.updatedAt,
  })

  // Persist the image path into the local record so the two agree.
  if (imagePath !== undefined && mode.image !== imagePath) {
    await putModeFromRemote({ ...mode, image: imagePath }, { path, sha: write.contentSha, imagePath, imageSha })
    notifyModesChanged()
  }

  return { kind: 'pushed' }
}

/** On a sha conflict, re-read for a fresh sha and retry exactly once. */
async function putWithRetry(
  client: GithubClient,
  path: string,
  text: string,
  message: string,
  sha: string | undefined,
) {
  try {
    return await client.putText(path, text, message, sha)
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error
    const fresh = await client.getContent(path)
    return await client.putText(path, text, message, fresh?.sha)
  }
}

async function shaFor(client: GithubClient, path: string): Promise<string | undefined> {
  const existing = await client.getContent(path)
  return existing?.sha
}

async function adoptRemote(
  remoteMode: BrewMode,
  path: string,
  sha: string,
  client: GithubClient,
  config: GithubConfig,
): Promise<void> {
  await putModeFromRemote(remoteMode, { path, sha })
  await pullImageIfMissing(remoteMode, client, config)
}

/* ── Pull ─────────────────────────────────────────────────────────────────── */

export type SyncReport = {
  pushed: number
  pulled: number
  deleted: number
  /** Modes that exist locally but have no file in the repository. */
  localOnly: number
  conflictsPending: number
  errors: { name: string; message: string }[]
}

export function requestSync(): Promise<SyncReport> {
  return serialised(() => runSync())
}

async function runSync(): Promise<SyncReport> {
  const report: SyncReport = {
    pushed: 0,
    pulled: 0,
    deleted: 0,
    localOnly: 0,
    conflictsPending: 0,
    errors: [],
  }
  const { client, config } = await makeClient()

  // Deletions before pushes: otherwise a recreated slug could be removed by a
  // pending tombstone right after being written.
  for (const tombstone of await listTombstones()) {
    try {
      if (tombstone.path !== undefined) {
        const current = await client.getContent(tombstone.path)
        if (current !== null) {
          await client.deleteFile(tombstone.path, current.sha, 'chore(tea): удалено')
          await pause(WRITE_GAP_MS)
        }
      }
      if (tombstone.imagePath !== undefined) {
        const current = await client.getContent(tombstone.imagePath)
        if (current !== null) {
          await client.deleteFile(tombstone.imagePath, current.sha, 'chore(tea): удалена картинка')
          await pause(WRITE_GAP_MS)
        }
      }
      await clearTombstone(tombstone.modeId)
      report.deleted += 1
    } catch (error) {
      report.errors.push(describe(error))
    }
  }

  for (const modeId of await listDirtyModeIds()) {
    try {
      const outcome = await pushOne(modeId)
      if (outcome.kind === 'pushed') report.pushed += 1
      else if (outcome.kind === 'skipped' && outcome.reason === 'conflict-pending') {
        report.conflictsPending += 1
      } else if (outcome.kind === 'took-remote') report.pulled += 1
      await pause(WRITE_GAP_MS)
    } catch (error) {
      report.errors.push(describe(error))
    }
  }

  // Now read the repository back.
  const entries = await client.listDir(config.modesDir)
  const mdFiles = entries.filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md'))
  const seenIds = new Set<string>()

  for (const entry of mdFiles) {
    try {
      const file = await client.getContent(entry.path)
      if (file === null) continue
      const parsed = parseMode(base64ToUtf8(file.contentBase64))
      if (!parsed.ok) {
        report.errors.push({ name: entry.name, message: parsed.reason })
        continue
      }

      const remoteMode = parsed.mode
      seenIds.add(remoteMode.id)
      const local = await getMode(remoteMode.id)

      if (local === undefined || remoteMode.updatedAt > local.updatedAt) {
        await putModeFromRemote(remoteMode, { path: entry.path, sha: file.sha })
        await pullImageIfMissing(remoteMode, client, config)
        report.pulled += 1
      } else {
        // Same or older: just refresh the sha so the next push has a valid one.
        await setSyncMeta(remoteMode.id, { path: entry.path, sha: file.sha })
      }
    } catch (error) {
      report.errors.push(describe(error))
    }
  }

  // Local records whose remote file has vanished are NOT deleted here. Auto-deleting
  // on the strength of one listing — which may have been partial — is how a vault
  // gets wiped. Report the count and let the next push recreate the files.
  for (const mode of await listModes()) {
    if (!seenIds.has(mode.id)) report.localOnly += 1
  }

  await setLastSyncAt(new Date().toISOString())
  notifyModesChanged()
  return report
}

async function pullImageIfMissing(
  mode: BrewMode,
  client: GithubClient,
  config: GithubConfig,
): Promise<void> {
  if (mode.image === undefined) return
  const existing = await getImage(mode.id)
  if (existing !== undefined) return

  const dir = mode.image.split('/').slice(0, -1).join('/') || config.assetsDir
  const entries = await client.listDir(dir)
  const entry = entries.find((e) => e.path === mode.image)
  if (entry?.downloadUrl == null) return

  const blob = await client.downloadRaw(entry.downloadUrl)
  const ext = mode.image.split('.').pop() ?? 'webp'
  await putImageFromRemote(mode.id, {
    blob,
    mime: blob.type === '' ? `image/${ext}` : blob.type,
    ext,
    // Dimensions are only used for bookkeeping; decoding here would need a DOM.
    width: 0,
    height: 0,
  })
}

function describe(error: unknown): { name: string; message: string } {
  if (error instanceof SyncError) return { name: error.name, message: error.userMessage }
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'Error', message: String(error) }
}

/* ── Draining ─────────────────────────────────────────────────────────────── */

let drainInstalled = false

/**
 * Pushes whatever is pending. The queue is the `dirty` flags plus the tombstones,
 * both derived from current state rather than a log of intents, which makes
 * draining idempotent: running it twice cannot duplicate or reorder anything.
 */
export async function drainPending(): Promise<void> {
  if (!(await isSyncConfigured())) return
  for (const modeId of await listDirtyModeIds()) {
    await requestPush(modeId)
  }
  const tombstones = await listTombstones()
  if (tombstones.length > 0) {
    await requestSync().catch(() => undefined)
  }
}

/** Drains on regaining connectivity, and once at startup. */
export function installAutoDrain(): void {
  if (drainInstalled) return
  drainInstalled = true
  window.addEventListener('online', () => void drainPending().catch(() => undefined))
  void drainPending().catch(() => undefined)
}

export type { SyncMeta }
