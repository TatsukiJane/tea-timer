import { afterEach, describe, expect, it, vi } from 'vitest'

import { GithubClient } from './githubClient'
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  OfflineError,
  RateLimitError,
  UnexpectedStatusError,
} from './errors'
import { utf8ToBase64 } from '@/lib/base64'

const CONFIG = {
  owner: 'tatsukijane',
  repo: 'tea-vault',
  branch: 'main',
  modesDir: 'modes',
  assetsDir: 'assets',
}

function clientWith(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('navigator', { onLine: true })
  return { client: new GithubClient(CONFIG, 'ghp_test'), fetchMock }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('request shaping', () => {
  it('sends the auth, accept and api-version headers', async () => {
    const { client, fetchMock } = clientWith(() => json({ default_branch: 'main' }))
    await client.getRepo()
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer ghp_test')
    expect(headers.get('Accept')).toBe('application/vnd.github+json')
    expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28')
  })

  it('omits the auth header entirely when no token is set', async () => {
    // Sending "Bearer " makes GitHub answer 401 even for a public repo, which
    // would be reported as "invalid token" when in fact none was configured.
    const { fetchMock } = clientWith(() => json({ default_branch: 'main' }))
    await new GithubClient(CONFIG, '').getRepo()
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers)
    expect(headers.get('Authorization')).toBeNull()
  })

  it('targets the configured branch on reads and writes', async () => {
    const urls: string[] = []
    const { client } = clientWith((url) => {
      urls.push(url)
      return json({ content: utf8ToBase64('x'), sha: 'abc' })
    })
    await client.getContent('modes/a.md')
    expect(urls[0]).toContain('?ref=main')

    const bodies: string[] = []
    const { client: writer } = clientWith((_url, init) => {
      bodies.push(String(init?.body))
      return json({ content: { sha: 'new' } }, 201)
    })
    await writer.putText('modes/a.md', 'hi', 'msg')
    expect(JSON.parse(bodies[0]).branch).toBe('main')
  })

  it('percent-encodes path segments but keeps the separators', async () => {
    const urls: string[] = []
    const { client } = clientWith((url) => {
      urls.push(url)
      return json({ content: '', sha: 's' })
    })
    await client.getContent('чай записи/шу пуэр.md')
    expect(urls[0]).toContain('/contents/%D1%87%D0%B0%D0%B9%20%D0%B7%D0%B0%D0%BF%D0%B8%D1%81%D0%B8/')
    expect(urls[0]).not.toContain('%2F')
  })

  it('refuses to hit the network when the browser reports offline', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })
    const client = new GithubClient(CONFIG, 'ghp_test')
    await expect(client.getRepo()).rejects.toBeInstanceOf(OfflineError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('wraps a transport failure as NetworkError', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const client = new GithubClient(CONFIG, 'ghp_test')
    await expect(client.getRepo()).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('getContent', () => {
  it('returns null on 404, because a missing file just means "create it"', async () => {
    const { client } = clientWith(() => json({ message: 'Not Found' }, 404))
    await expect(client.getContent('modes/absent.md')).resolves.toBeNull()
  })

  it('returns the content and sha on success', async () => {
    const { client } = clientWith(() =>
      json({ content: utf8ToBase64('Шу'), sha: 'deadbeef', size: 4, type: 'file' }),
    )
    const file = await client.getContent('modes/a.md')
    expect(file).toMatchObject({ sha: 'deadbeef', size: 4 })
  })

  it('returns null when the path turns out to be a directory', async () => {
    const { client } = clientWith(() => json({ type: 'dir' }))
    await expect(client.getContent('modes')).resolves.toBeNull()
  })
})

describe('listDir', () => {
  it('returns an empty list on 404, because the directory may not exist yet', async () => {
    const { client } = clientWith(() => json({ message: 'Not Found' }, 404))
    await expect(client.listDir('modes')).resolves.toEqual([])
  })

  it('maps entries including download_url', async () => {
    const { client } = clientWith(() =>
      json([
        {
          name: 'shu-6f1c.md',
          path: 'modes/shu-6f1c.md',
          sha: 'aaa',
          size: 900,
          type: 'file',
          download_url: 'https://raw.example/shu.md',
        },
      ]),
    )
    const entries = await client.listDir('modes')
    expect(entries[0]).toEqual({
      name: 'shu-6f1c.md',
      path: 'modes/shu-6f1c.md',
      sha: 'aaa',
      size: 900,
      type: 'file',
      downloadUrl: 'https://raw.example/shu.md',
    })
  })
})

describe('writes', () => {
  it('omits sha when creating and includes it when updating', async () => {
    const bodies: Record<string, unknown>[] = []
    const { client } = clientWith((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return json({ content: { sha: 'new' }, commit: { sha: 'c1' } }, 201)
    })
    await client.putText('modes/a.md', 'hello', 'create')
    await client.putText('modes/a.md', 'hello', 'update', 'oldsha')
    expect('sha' in bodies[0]).toBe(false)
    expect(bodies[1].sha).toBe('oldsha')
  })

  it('encodes UTF-8 content as base64 rather than calling btoa on characters', async () => {
    const bodies: Record<string, unknown>[] = []
    const { client } = clientWith((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return json({ content: { sha: 'new' } }, 201)
    })
    await client.putText('modes/a.md', 'Шу Пуэр 🍵', 'msg')
    expect(bodies[0].content).toBe(utf8ToBase64('Шу Пуэр 🍵'))
  })

  it('treats a 404 on delete as success, since the file is already gone', async () => {
    const { client } = clientWith(() => json({ message: 'Not Found' }, 404))
    await expect(client.deleteFile('modes/a.md', 'sha', 'delete')).resolves.toBeUndefined()
  })
})

describe('status mapping', () => {
  const cases: Array<[number, unknown]> = [
    [401, AuthError],
    [403, ForbiddenError],
    [409, ConflictError],
    [422, ConflictError],
    [500, UnexpectedStatusError],
  ]

  for (const [status, expected] of cases) {
    it(`maps ${status} to ${(expected as { name: string }).name}`, async () => {
      const { client } = clientWith(() => json({ message: 'x' }, status))
      await expect(client.getRepo()).rejects.toBeInstanceOf(expected as never)
    })
  }

  it('maps 404 on getRepo to NotFoundError, whose message must not claim the repo is simply missing', async () => {
    // A fine-grained PAT answers 404, not 403, for a private repo outside its
    // selected list, so the wording has to cover both possibilities.
    const { client } = clientWith(() => json({ message: 'Not Found' }, 404))
    const error = await client.getRepo().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NotFoundError)
    expect((error as NotFoundError).userMessage).toContain('не даёт к нему доступа')
  })

  it('detects a rate limit from the remaining header, not from the status alone', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 600
    const { client } = clientWith(() =>
      json({ message: 'API rate limit exceeded' }, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetAt),
      }),
    )
    const error = await client.getRepo().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimitError)
    expect((error as RateLimitError).resetAt.getTime()).toBe(resetAt * 1000)
  })

  it('treats 429 with a zero remaining count as a rate limit too', async () => {
    const { client } = clientWith(() =>
      json({}, 429, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }),
    )
    await expect(client.getRepo()).rejects.toBeInstanceOf(RateLimitError)
  })

  it('still reports a plain 403 as a permissions problem when quota remains', async () => {
    const { client } = clientWith(() => json({}, 403, { 'x-ratelimit-remaining': '4999' }))
    const error = await client.getRepo().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ForbiddenError)
    // All three indistinguishable causes are named, since the API cannot tell them apart.
    expect((error as ForbiddenError).userMessage).toContain('Contents')
    expect((error as ForbiddenError).userMessage).toContain('SSO')
  })
})

describe('getRepo', () => {
  it('reports visibility, default branch and push permission', async () => {
    const { client } = clientWith(() =>
      json({
        default_branch: 'trunk',
        private: true,
        full_name: 'tatsukijane/tea-vault',
        permissions: { push: true },
      }),
    )
    await expect(client.getRepo()).resolves.toEqual({
      defaultBranch: 'trunk',
      private: true,
      canPush: true,
      fullName: 'tatsukijane/tea-vault',
    })
  })

  it('does not write anything while checking access', async () => {
    const methods: (string | undefined)[] = []
    const { client } = clientWith((_url, init) => {
      methods.push(init?.method)
      return json({ default_branch: 'main' })
    })
    await client.getRepo()
    // A read-only probe is both better UX and a better security posture than
    // writing a throwaway file.
    expect(methods.every((m) => m === undefined || m === 'GET')).toBe(true)
  })
})

describe('downloadRaw', () => {
  it('fetches the absolute url without an Authorization header', async () => {
    // Private-repo download URLs carry their own short-lived token; adding ours
    // makes the storage backend reject the request.
    const seen: RequestInit[] = []
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        seen.push(init ?? {})
        return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])])))
      }),
    )
    const client = new GithubClient(CONFIG, 'ghp_test')
    const blob = await client.downloadRaw('https://raw.example/a.webp')
    expect(blob.size).toBe(3)
    expect(new Headers(seen[0].headers).get('Authorization')).toBeNull()
  })
})
