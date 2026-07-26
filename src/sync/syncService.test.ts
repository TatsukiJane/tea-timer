import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { base64ToUtf8, utf8ToBase64 } from '@/lib/base64'
import { serializeMode } from '@/md/serialize'
import type { BrewMode } from '@/types/brew'
import type { GithubConfig, StoredImage, SyncMeta, Tombstone } from '@/db/schema'

/* ── In-memory stand-ins for the IndexedDB layer ───────────────────────────── */

const store = {
  modes: new Map<string, BrewMode>(),
  images: new Map<string, StoredImage>(),
  meta: new Map<string, SyncMeta>(),
  tombstones: new Map<string, Tombstone>(),
  config: {
    owner: 'tatsukijane',
    repo: 'tea-vault',
    branch: 'main',
    modesDir: 'modes',
    assetsDir: 'assets',
  } satisfies GithubConfig,
  token: 'ghp_test' as string | undefined,
  lastSyncAt: undefined as string | undefined,
}

vi.mock('@/db/modes', () => ({
  getMode: (id: string) => Promise.resolve(store.modes.get(id)),
  listModes: () => Promise.resolve([...store.modes.values()]),
  putModeFromRemote: (mode: BrewMode, meta: Partial<SyncMeta>) => {
    store.modes.set(mode.id, mode)
    store.meta.set(mode.id, {
      ...(store.meta.get(mode.id) ?? { modeId: mode.id, dirty: false }),
      ...meta,
      modeId: mode.id,
      dirty: false,
      lastPushedUpdatedAt: mode.updatedAt,
    })
    return Promise.resolve()
  },
}))

vi.mock('@/db/images', () => ({
  getImage: (id: string) => Promise.resolve(store.images.get(id)),
  markImageClean: (id: string) => {
    const existing = store.images.get(id)
    if (existing) store.images.set(id, { ...existing, dirty: false })
    return Promise.resolve()
  },
  putImageFromRemote: (id: string, image: { blob: Blob; mime: string; ext: string }) => {
    store.images.set(id, {
      id,
      blob: image.blob,
      mime: image.mime,
      ext: image.ext,
      width: 0,
      height: 0,
      updatedAt: new Date().toISOString(),
      dirty: false,
    })
    return Promise.resolve()
  },
}))

vi.mock('@/db/settings', async (importOriginal) => {
  // isConfigured and normaliseConfig are pure helpers; only the storage calls
  // need replacing.
  const actual = await importOriginal<typeof import('@/db/settings')>()
  return {
    ...actual,
    getGithubConfig: () => Promise.resolve(store.config),
    getToken: () => Promise.resolve(store.token),
    setLastSyncAt: (iso: string) => {
      store.lastSyncAt = iso
      return Promise.resolve()
    },
  }
})

vi.mock('@/db/syncMeta', () => ({
  getSyncMeta: (id: string) => Promise.resolve(store.meta.get(id)),
  setSyncMeta: (id: string, patch: Partial<SyncMeta>) => {
    store.meta.set(id, { ...(store.meta.get(id) ?? { modeId: id, dirty: false }), ...patch, modeId: id })
    return Promise.resolve()
  },
  listDirtyModeIds: () =>
    Promise.resolve([...store.meta.values()].filter((m) => m.dirty).map((m) => m.modeId)),
  listTombstones: () => Promise.resolve([...store.tombstones.values()]),
  clearTombstone: (id: string) => {
    store.tombstones.delete(id)
    return Promise.resolve()
  },
  countPending: () => Promise.resolve(0),
}))

vi.mock('@/state/useModes', () => ({ notifyModesChanged: () => undefined }))

/* ── A fake GitHub over the Contents API ───────────────────────────────────── */

type Call = { method: string; path: string }

function fakeGithub(files: Map<string, string>) {
  const calls: Call[] = []
  let shaCounter = 0
  const shas = new Map<string, string>()
  for (const path of files.keys()) shas.set(path, `sha-${++shaCounter}`)

  const handler = (rawUrl: string, init?: RequestInit): Response => {
    const url = new URL(rawUrl)
    const method = init?.method ?? 'GET'
    const match = /\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/.exec(url.pathname)
    const path = match === null ? '' : decodeURIComponent(match[1])
    calls.push({ method, path })

    if (method === 'GET') {
      if (files.has(path)) {
        return json({
          type: 'file',
          content: utf8ToBase64(files.get(path) as string),
          sha: shas.get(path),
          size: 100,
        })
      }
      // Directory listing.
      const children = [...files.keys()].filter((p) => p.startsWith(`${path}/`))
      if (children.length > 0) {
        return json(
          children.map((p) => ({
            name: p.split('/').pop(),
            path: p,
            sha: shas.get(p),
            size: 100,
            type: 'file',
            download_url: `https://raw.example/${p}`,
          })),
        )
      }
      return json({ message: 'Not Found' }, 404)
    }

    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { content: string; sha?: string }
      // Enforce the real API's optimistic-concurrency rule.
      if (files.has(path) && body.sha !== shas.get(path)) {
        return json({ message: 'is at ... but expected ...' }, 409)
      }
      files.set(path, base64ToUtf8(body.content))
      const sha = `sha-${++shaCounter}`
      shas.set(path, sha)
      return json({ content: { sha }, commit: { sha: `commit-${shaCounter}` } }, 201)
    }

    if (method === 'DELETE') {
      files.delete(path)
      shas.delete(path)
      return json({})
    }

    return json({ message: 'unexpected' }, 500)
  }

  return { handler, calls, files }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function install(files: Map<string, string>) {
  const gh = fakeGithub(files)
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://raw.example/')) {
        return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])])))
      }
      return Promise.resolve(gh.handler(url, init))
    }),
  )
  return gh
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const modeFixture = (overrides: Partial<BrewMode> = {}): BrewMode => ({
  id: '6f1c2a3b-1111-4222-8333-444455556666',
  title: 'Шу Пуэр 2018',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-26T10:00:00.000Z',
  presets: [
    {
      id: 'aaaaaaaa-1111-4222-8333-444455556666',
      vesselVolume: 150,
      leafGrams: 8,
      steps: [{ seconds: 25 }, { seconds: 45 }],
    },
  ],
  ...overrides,
})

const EXPECTED_PATH = 'modes/shu-puer-2018-6f1c2a3b.md'

let service: typeof import('./syncService')

beforeEach(async () => {
  store.modes.clear()
  store.images.clear()
  store.meta.clear()
  store.tombstones.clear()
  store.token = 'ghp_test'
  store.config = {
    owner: 'tatsukijane',
    repo: 'tea-vault',
    branch: 'main',
    modesDir: 'modes',
    assetsDir: 'assets',
  }
  vi.resetModules()
  service = await import('./syncService')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe('push', () => {
  it('writes a new mode to the slug path and clears the dirty flag', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    store.meta.set(mode.id, { modeId: mode.id, dirty: true })
    const gh = install(new Map())

    const outcome = await service.requestPush(mode.id)
    expect(outcome).toEqual({ kind: 'pushed' })
    expect([...gh.files.keys()]).toEqual([EXPECTED_PATH])
    expect(store.meta.get(mode.id)).toMatchObject({
      path: EXPECTED_PATH,
      dirty: false,
      lastPushedUpdatedAt: mode.updatedAt,
    })
  })

  it('does nothing when GitHub is not configured', async () => {
    store.token = undefined
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    const gh = install(new Map())

    await expect(service.requestPush(mode.id)).resolves.toEqual({
      kind: 'skipped',
      reason: 'not-configured',
    })
    expect(gh.calls).toHaveLength(0)
  })

  it('reports failure without throwing, so a save can never fail on sync', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('fetch', vi.fn())

    const outcome = await service.requestPush(mode.id)
    expect(outcome.kind).toBe('failed')
  })

  it('uploads the image before the markdown, so image: never dangles', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    store.images.set(mode.id, {
      id: mode.id,
      blob: new Blob([new Uint8Array([1, 2, 3])]),
      mime: 'image/webp',
      ext: 'webp',
      width: 512,
      height: 512,
      updatedAt: mode.updatedAt,
      dirty: true,
    })
    const gh = install(new Map())

    await service.requestPush(mode.id)

    const writes = gh.calls.filter((c) => c.method === 'PUT').map((c) => c.path)
    expect(writes).toEqual(['assets/6f1c2a3b.webp', EXPECTED_PATH])
    expect(gh.files.get(EXPECTED_PATH)).toContain('image: assets/6f1c2a3b.webp')
  })

  it('recovers from a stale sha by re-reading and retrying once', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    // A sha we were never given: the fake rejects it exactly as GitHub would.
    store.meta.set(mode.id, { modeId: mode.id, dirty: true, sha: 'stale', path: EXPECTED_PATH })
    const gh = install(new Map([[EXPECTED_PATH, serializeMode(mode)]]))

    await expect(service.requestPush(mode.id)).resolves.toEqual({ kind: 'pushed' })
    expect(gh.calls.filter((c) => c.method === 'PUT')).toHaveLength(2)
  })
})

describe('rename', () => {
  it('writes the new path and deletes the old one in a separate request', async () => {
    const original = modeFixture()
    const renamed = { ...original, title: 'Шэн Пуэр 2020', updatedAt: '2026-07-26T11:00:00.000Z' }
    store.modes.set(renamed.id, renamed)
    store.meta.set(renamed.id, {
      modeId: renamed.id,
      dirty: true,
      path: EXPECTED_PATH,
      sha: 'sha-1',
      lastPushedUpdatedAt: original.updatedAt,
    })
    const gh = install(new Map([[EXPECTED_PATH, serializeMode(original)]]))
    service.setConflictResolver(() => Promise.resolve('overwrite'))

    await service.requestPush(renamed.id)

    const newPath = 'modes/shen-puer-2020-6f1c2a3b.md'
    expect([...gh.files.keys()]).toEqual([newPath])

    // The API documentation warns against running a PUT and a DELETE against the
    // same repository concurrently, so the order must be strict.
    const mutations = gh.calls.filter((c) => c.method === 'PUT' || c.method === 'DELETE')
    expect(mutations).toEqual([
      { method: 'PUT', path: newPath },
      { method: 'DELETE', path: EXPECTED_PATH },
    ])
  })
})

describe('conflicts', () => {
  /** A remote file written by "another device" after our last push. */
  function setUpDivergence() {
    const ours = modeFixture({ title: 'Шу Пуэр 2018', updatedAt: '2026-07-26T12:00:00.000Z' })
    const theirs = modeFixture({
      title: 'Шу Пуэр 2018',
      updatedAt: '2026-07-26T11:00:00.000Z',
      notes: 'правка с телефона',
    })
    store.modes.set(ours.id, ours)
    store.meta.set(ours.id, {
      modeId: ours.id,
      dirty: true,
      path: EXPECTED_PATH,
      sha: 'sha-1',
      // We last pushed the 10:00 version; the repo now holds 11:00.
      lastPushedUpdatedAt: '2026-07-26T10:00:00.000Z',
    })
    return { ours, theirs, gh: install(new Map([[EXPECTED_PATH, serializeMode(theirs)]])) }
  }

  it('asks rather than silently overwriting', async () => {
    const { gh } = setUpDivergence()
    const resolver = vi.fn(() => Promise.resolve('skip' as const))
    service.setConflictResolver(resolver)

    const outcome = await service.requestPush(modeFixture().id)

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'skipped', reason: 'conflict-pending' })
    // Nothing was written, and the remote text is untouched.
    expect(gh.calls.some((c) => c.method === 'PUT')).toBe(false)
    expect(gh.files.get(EXPECTED_PATH)).toContain('правка с телефона')
  })

  it('leaves the mode dirty when the user defers, so it is not silently dropped', async () => {
    setUpDivergence()
    service.setConflictResolver(() => Promise.resolve('skip'))
    await service.requestPush(modeFixture().id)
    expect(store.meta.get(modeFixture().id)?.dirty).toBe(true)
  })

  it('overwrites with the fresh sha when the user chooses ours', async () => {
    const { ours, gh } = setUpDivergence()
    service.setConflictResolver(() => Promise.resolve('overwrite'))

    await expect(service.requestPush(ours.id)).resolves.toEqual({ kind: 'pushed' })
    expect(gh.files.get(EXPECTED_PATH)).not.toContain('правка с телефона')
    expect(store.meta.get(ours.id)?.dirty).toBe(false)
  })

  it('adopts the remote version when the user chooses theirs', async () => {
    const { ours, theirs, gh } = setUpDivergence()
    service.setConflictResolver(() => Promise.resolve('takeRemote'))

    await expect(service.requestPush(ours.id)).resolves.toEqual({ kind: 'took-remote' })
    expect(store.modes.get(ours.id)?.notes).toBe('правка с телефона')
    expect(store.modes.get(ours.id)?.updatedAt).toBe(theirs.updatedAt)
    expect(store.meta.get(ours.id)?.dirty).toBe(false)
    expect(gh.calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('does not ask on a first push, when there is nothing to diverge from', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    store.meta.set(mode.id, { modeId: mode.id, dirty: true })
    install(new Map())
    const resolver = vi.fn(() => Promise.resolve('skip' as const))
    service.setConflictResolver(resolver)

    await service.requestPush(mode.id)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('does not ask when the remote still holds exactly what we pushed', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, { ...mode, notes: 'локальная правка' })
    store.meta.set(mode.id, {
      modeId: mode.id,
      dirty: true,
      path: EXPECTED_PATH,
      sha: 'sha-1',
      lastPushedUpdatedAt: mode.updatedAt,
    })
    install(new Map([[EXPECTED_PATH, serializeMode(mode)]]))
    const resolver = vi.fn(() => Promise.resolve('skip' as const))
    service.setConflictResolver(resolver)

    await expect(service.requestPush(mode.id)).resolves.toEqual({ kind: 'pushed' })
    expect(resolver).not.toHaveBeenCalled()
  })
})

describe('pull', () => {
  it('adopts a remote mode that does not exist locally', async () => {
    const remote = modeFixture({ id: 'cccccccc-1111-4222-8333-444455556666', title: 'Да Хун Пао' })
    install(new Map([['modes/da-hun-pao-cccccccc.md', serializeMode(remote)]]))

    const report = await service.requestSync()
    expect(report.pulled).toBe(1)
    expect(store.modes.get(remote.id)?.title).toBe('Да Хун Пао')
  })

  it('takes the remote version when it is newer', async () => {
    const local = modeFixture({ updatedAt: '2026-07-20T10:00:00.000Z' })
    const remote = modeFixture({ updatedAt: '2026-07-26T10:00:00.000Z', notes: 'новее' })
    store.modes.set(local.id, local)
    install(new Map([[EXPECTED_PATH, serializeMode(remote)]]))

    const report = await service.requestSync()
    expect(report.pulled).toBe(1)
    expect(store.modes.get(local.id)?.notes).toBe('новее')
  })

  it('keeps the local version when it is newer, and only refreshes the sha', async () => {
    const local = modeFixture({ updatedAt: '2026-07-26T10:00:00.000Z', notes: 'локальная' })
    const remote = modeFixture({ updatedAt: '2026-07-20T10:00:00.000Z', notes: 'старая' })
    store.modes.set(local.id, local)
    install(new Map([[EXPECTED_PATH, serializeMode(remote)]]))

    await service.requestSync()
    expect(store.modes.get(local.id)?.notes).toBe('локальная')
    expect(store.meta.get(local.id)?.sha).toBeDefined()
  })

  it('does NOT delete a local mode whose remote file has vanished', async () => {
    // Auto-deleting on the strength of one listing — which may have been partial —
    // is how a vault gets wiped. Report it instead.
    const local = modeFixture()
    store.modes.set(local.id, local)
    install(new Map())

    const report = await service.requestSync()
    expect(store.modes.has(local.id)).toBe(true)
    expect(report.localOnly).toBe(1)
  })

  it('reports a malformed file per-file instead of aborting the whole pull', async () => {
    const good = modeFixture({ id: 'dddddddd-1111-4222-8333-444455556666', title: 'Хороший' })
    install(
      new Map([
        ['modes/broken.md', '# нет frontmatter'],
        ['modes/good-dddddddd.md', serializeMode(good)],
      ]),
    )

    const report = await service.requestSync()
    expect(report.pulled).toBe(1)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].name).toBe('broken.md')
    expect(store.modes.has(good.id)).toBe(true)
  })

  it('ignores non-markdown files in the modes directory', async () => {
    install(new Map([['modes/README.txt', 'ignore me'], ['modes/.gitkeep', '']]))
    const report = await service.requestSync()
    expect(report.pulled).toBe(0)
    expect(report.errors).toHaveLength(0)
  })

  it('downloads a referenced image that is missing locally', async () => {
    const remote = modeFixture({ image: 'assets/6f1c2a3b.webp' })
    install(
      new Map([
        [EXPECTED_PATH, serializeMode(remote)],
        ['assets/6f1c2a3b.webp', 'binary'],
      ]),
    )

    await service.requestSync()
    expect(store.images.get(remote.id)?.ext).toBe('webp')
  })

  it('honours a configured modes directory', async () => {
    store.config = { ...store.config, modesDir: 'чай/записи' }
    const remote = modeFixture({ id: 'eeeeeeee-1111-4222-8333-444455556666' })
    install(new Map([['чай/записи/shu-puer-2018-eeeeeeee.md', serializeMode(remote)]]))

    const report = await service.requestSync()
    expect(report.pulled).toBe(1)
  })

  it('records the sync timestamp', async () => {
    install(new Map())
    await service.requestSync()
    expect(store.lastSyncAt).toBeDefined()
  })
})

describe('deletions', () => {
  it('removes the repository files a tombstone points at', async () => {
    store.tombstones.set('x', {
      modeId: 'x',
      path: EXPECTED_PATH,
      sha: 'sha-1',
      imagePath: 'assets/6f1c2a3b.webp',
      deletedAt: '2026-07-26T10:00:00.000Z',
    })
    const gh = install(
      new Map([
        [EXPECTED_PATH, 'whatever'],
        ['assets/6f1c2a3b.webp', 'binary'],
      ]),
    )

    const report = await service.requestSync()
    expect(report.deleted).toBe(1)
    expect(gh.files.size).toBe(0)
    expect(store.tombstones.size).toBe(0)
  })

  it('runs deletions before pushes, so a recreated slug is not removed after being written', async () => {
    const mode = modeFixture()
    store.modes.set(mode.id, mode)
    store.meta.set(mode.id, { modeId: mode.id, dirty: true })
    store.tombstones.set('old', {
      modeId: 'old',
      path: 'modes/old-11111111.md',
      sha: 'sha-1',
      deletedAt: '2026-07-26T09:00:00.000Z',
    })
    const gh = install(new Map([['modes/old-11111111.md', 'stale']]))

    await service.requestSync()

    const mutations = gh.calls.filter((c) => c.method === 'DELETE' || c.method === 'PUT')
    expect(mutations[0]).toEqual({ method: 'DELETE', path: 'modes/old-11111111.md' })
    expect(mutations.some((c) => c.method === 'PUT' && c.path === EXPECTED_PATH)).toBe(true)
  })

  it('clears a tombstone whose file is already gone', async () => {
    store.tombstones.set('x', {
      modeId: 'x',
      path: 'modes/gone-22222222.md',
      deletedAt: '2026-07-26T10:00:00.000Z',
    })
    install(new Map())

    const report = await service.requestSync()
    expect(report.deleted).toBe(1)
    expect(store.tombstones.size).toBe(0)
  })
})

describe('serialisation', () => {
  it('never runs two operations against the repository concurrently', async () => {
    // Concurrent commits to one branch race and produce 409s, so the service funnels
    // everything through a mutex.
    const a = modeFixture({ id: 'aaaa1111-1111-4222-8333-444455556666', title: 'Первый' })
    const b = modeFixture({ id: 'bbbb2222-1111-4222-8333-444455556666', title: 'Второй' })
    store.modes.set(a.id, a)
    store.modes.set(b.id, b)
    install(new Map())

    let inFlight = 0
    let maxInFlight = 0
    const originalFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        try {
          return await originalFetch(input as never, init)
        } finally {
          inFlight -= 1
        }
      }),
    )

    await Promise.all([service.requestPush(a.id), service.requestPush(b.id)])
    expect(maxInFlight).toBe(1)
  })
})
