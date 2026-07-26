import { getDb } from './index'
import type { SyncMeta, Tombstone } from './schema'
import type { BrewMode } from '@/types/brew'

/** Newest first — matches the list order on the main screen. */
export async function listModes(): Promise<BrewMode[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('modes', 'by-updatedAt')
  return all.reverse()
}

export async function getMode(id: string): Promise<BrewMode | undefined> {
  const db = await getDb()
  return db.get('modes', id)
}

/**
 * Writes a mode and marks it for pushing, in one transaction. `updatedAt` is
 * stamped here so no caller can forget it — last-write-wins and the conflict
 * check both depend on it being accurate and uniformly formatted.
 */
export async function saveMode(mode: BrewMode): Promise<BrewMode> {
  const stamped: BrewMode = { ...mode, updatedAt: new Date().toISOString() }
  const db = await getDb()
  const tx = db.transaction(['modes', 'syncMeta'], 'readwrite')
  await tx.objectStore('modes').put(stamped)

  const metaStore = tx.objectStore('syncMeta')
  const existing = await metaStore.get(mode.id)
  const meta: SyncMeta = { ...(existing ?? { modeId: mode.id }), dirty: true }
  await metaStore.put(meta)

  await tx.done
  return stamped
}

/**
 * Removes the mode, its image and its sync record, and leaves a tombstone so the
 * repository files are deleted on the next sync even if we are offline now.
 * Returns the tombstone, or null when there was nothing in the repo to remove.
 */
export async function deleteModeCascade(id: string): Promise<Tombstone | null> {
  const db = await getDb()
  const tx = db.transaction(['modes', 'images', 'syncMeta', 'tombstones'], 'readwrite')

  const meta = await tx.objectStore('syncMeta').get(id)
  await tx.objectStore('modes').delete(id)
  await tx.objectStore('images').delete(id)
  await tx.objectStore('syncMeta').delete(id)

  let tombstone: Tombstone | null = null
  // Nothing was ever pushed, so there is no remote file to chase.
  if (meta?.path !== undefined || meta?.imagePath !== undefined) {
    tombstone = {
      modeId: id,
      path: meta.path,
      sha: meta.sha,
      imagePath: meta.imagePath,
      imageSha: meta.imageSha,
      deletedAt: new Date().toISOString(),
    }
    await tx.objectStore('tombstones').put(tombstone)
  }

  await tx.done
  return tombstone
}

/** Used by the pull path, which must not re-mark what it just received as dirty. */
export async function putModeFromRemote(mode: BrewMode, meta: Partial<SyncMeta>): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['modes', 'syncMeta'], 'readwrite')
  await tx.objectStore('modes').put(mode)
  const metaStore = tx.objectStore('syncMeta')
  const existing = await metaStore.get(mode.id)
  await metaStore.put({
    ...(existing ?? { modeId: mode.id }),
    ...meta,
    modeId: mode.id,
    dirty: false,
    lastPushedUpdatedAt: mode.updatedAt,
  })
  await tx.done
}
