import { getDb } from './index'
import type { SyncMeta, Tombstone } from './schema'

export async function getSyncMeta(modeId: string): Promise<SyncMeta | undefined> {
  const db = await getDb()
  return db.get('syncMeta', modeId)
}

export async function setSyncMeta(modeId: string, patch: Partial<SyncMeta>): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('syncMeta', 'readwrite')
  const existing = await tx.store.get(modeId)
  await tx.store.put({ ...(existing ?? { modeId, dirty: false }), ...patch, modeId })
  await tx.done
}

export async function markDirty(modeId: string): Promise<void> {
  await setSyncMeta(modeId, { dirty: true })
}

/** The push queue: modes whose local state has not reached the repository. */
export async function listDirtyModeIds(): Promise<string[]> {
  const db = await getDb()
  const all = await db.getAll('syncMeta')
  return all.filter((m) => m.dirty).map((m) => m.modeId)
}

export async function countPending(): Promise<number> {
  const db = await getDb()
  const [meta, tombstones] = await Promise.all([db.getAll('syncMeta'), db.count('tombstones')])
  return meta.filter((m) => m.dirty).length + tombstones
}

/* ── Tombstones: the delete queue ─────────────────────────────────────────── */

export async function listTombstones(): Promise<Tombstone[]> {
  const db = await getDb()
  return db.getAll('tombstones')
}

export async function clearTombstone(modeId: string): Promise<void> {
  const db = await getDb()
  await db.delete('tombstones', modeId)
}
