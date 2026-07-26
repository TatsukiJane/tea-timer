import { openDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb'

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
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const modes = db.createObjectStore('modes', { keyPath: 'id' })
        modes.createIndex('by-updatedAt', 'updatedAt')

        db.createObjectStore('images', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
        db.createObjectStore('syncMeta', { keyPath: 'modeId' })
        db.createObjectStore('tombstones', { keyPath: 'modeId' })
      }

      if (oldVersion < 2 && oldVersion >= 1) {
        // Temperature used to sit on every step, which claimed it changes from pour
        // to pour. It does not — you set it once and the water cools on its own —
        // so it now belongs to the preset. Hoist whatever the existing steps say.
        void migrateTemperatureToPreset(tx)
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

/**
 * v1 → v2: fold each step's `tempC` up to its preset and drop the per-step
 * temperature and pour volume.
 *
 * Runs inside the upgrade transaction, so it must not await anything outside it.
 * Marked `void` at the call site because `upgrade` is synchronous by contract; the
 * cursor walk stays within the same transaction and therefore completes with it.
 */
async function migrateTemperatureToPreset(
  tx: IDBPTransaction<TeaTimerDB, ArrayLike<StoreNames<TeaTimerDB>>, 'versionchange'>,
): Promise<void> {
  const store = tx.objectStore('modes')
  for await (const cursor of store.iterate()) {
    const mode = cursor.value as LegacyMode
    let changed = false

    const presets = mode.presets.map((preset) => {
      // Prefer a real infusion over a rinse: rinses are often poured hotter, so
      // taking step zero blindly would record 100° for a tea brewed at 95°.
      const fromInfusion = preset.steps.find((s) => s.rinse !== true && s.tempC !== undefined)?.tempC
      const hoisted =
        preset.tempC ?? fromInfusion ?? preset.steps.find((s) => s.tempC !== undefined)?.tempC
      const steps = preset.steps.map((step) => {
        if (step.tempC === undefined && step.pourMl === undefined) return step
        changed = true
        const { tempC: _tempC, pourMl: _pourMl, ...rest } = step
        return rest
      })
      if (hoisted !== undefined && preset.tempC === undefined) changed = true
      return hoisted === undefined ? { ...preset, steps } : { ...preset, tempC: hoisted, steps }
    })

    if (changed) await cursor.update({ ...mode, presets } as never)
  }
}

/** The shape as it was stored before v2, used only by the migration above. */
type LegacyMode = {
  presets: {
    tempC?: number
    steps: { seconds: number; tempC?: number; pourMl?: number; label?: string; rinse?: boolean }[]
  }[]
}
