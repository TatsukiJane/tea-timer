import { getDb } from './index'
import type { StoredImage } from './schema'

/**
 * Images are stored as Blobs, deliberately, rather than the dataURLs the spec
 * suggested. A Blob in IndexedDB is kept as bytes; a dataURL costs an extra 33%
 * in size and materialises a very large string in the JS heap on every read.
 * Rendering goes through URL.createObjectURL, which is just as immediate, and
 * the GitHub upload path needs raw bytes anyway.
 *
 * The one real hazard of this choice is leaking object URLs, so creating them is
 * confined to useImageUrl() in @/state/useImage.
 */

export type NewImage = {
  blob: Blob
  mime: string
  ext: string
  width: number
  height: number
}

export async function putImage(modeId: string, image: NewImage): Promise<void> {
  const db = await getDb()
  await db.put('images', {
    id: modeId,
    ...image,
    updatedAt: new Date().toISOString(),
    dirty: true,
  })
}

/** Used by the pull path: the bytes came from the repo, so they are not dirty. */
export async function putImageFromRemote(modeId: string, image: NewImage): Promise<void> {
  const db = await getDb()
  await db.put('images', {
    id: modeId,
    ...image,
    updatedAt: new Date().toISOString(),
    dirty: false,
  })
}

export async function getImage(modeId: string): Promise<StoredImage | undefined> {
  const db = await getDb()
  return db.get('images', modeId)
}

export async function deleteImage(modeId: string): Promise<void> {
  const db = await getDb()
  await db.delete('images', modeId)
}

export async function markImageClean(modeId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('images', 'readwrite')
  const existing = await tx.store.get(modeId)
  if (existing) await tx.store.put({ ...existing, dirty: false })
  await tx.done
}
