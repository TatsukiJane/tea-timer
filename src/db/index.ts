import { openDB, type IDBPDatabase } from 'idb'

import { DB_NAME, DB_VERSION, type TeaTimerDB } from './schema'

let dbPromise: Promise<IDBPDatabase<TeaTimerDB>> | null = null

/**
 * Opens (and lazily caches) the database.
 *
 * Migrations: add a new `if (oldVersion < N)` block and bump DB_VERSION. Never
 * edit an existing block retroactively — a user's browser may be upgrading from
 * any earlier version. Data here is recoverable from the storage repository, so
 * a destructive migration would not be catastrophic, but it should still never
 * be the plan.
 */
export function getDb(): Promise<IDBPDatabase<TeaTimerDB>> {
  dbPromise ??= openDB<TeaTimerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const modes = db.createObjectStore('modes', { keyPath: 'id' })
        modes.createIndex('by-updatedAt', 'updatedAt')

        db.createObjectStore('images', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
        db.createObjectStore('syncMeta', { keyPath: 'modeId' })
        db.createObjectStore('tombstones', { keyPath: 'modeId' })
      }
    },
    blocked() {
      console.warn('[db] upgrade blocked by another open tab')
    },
    blocking() {
      // Another tab wants to upgrade. Close our handle so it can proceed
      // instead of hanging; the next call reopens at the new version.
      void dbPromise?.then((db) => db.close())
      dbPromise = null
    },
  })
  return dbPromise
}

/** Test/dev helper: forget the cached handle. */
export function resetDbHandle(): void {
  dbPromise = null
}
