import type { GithubConfig } from '@/db/schema'
import { blobToBase64, utf8ToBase64 } from '@/lib/base64'
import { errorForResponse, NetworkError, OfflineError, SyncError } from './errors'

/**
 * Thin client over the GitHub Contents API.
 *
 * api.github.com sends permissive CORS and allows the Authorization header, so the
 * PWA calls it directly from the Pages origin — no backend and no proxy, as the
 * spec requires.
 *
 * Size limits are not a concern here by construction: mode files are 1–3 KB and
 * images are re-encoded to well under 100 KB, so everything stays inside the
 * Contents API's comfortable 1 MB single-file window. Image *pulls* go through
 * download_url unconditionally, so that limit never applies to them either.
 */

const API = 'https://api.github.com'
const API_VERSION = '2022-11-28'
const TIMEOUT_MS = 15_000

export type FileContent = {
  path: string
  contentBase64: string
  sha: string
  size: number
}

export type DirEntry = {
  name: string
  path: string
  sha: string
  size: number
  type: string
  downloadUrl: string | null
}

export type RepoInfo = {
  defaultBranch: string
  private: boolean
  canPush: boolean
  fullName: string
}

export type WriteResult = {
  contentSha: string
  commitSha: string | undefined
}

export class GithubClient {
  private readonly config: GithubConfig
  private readonly token: string

  constructor(config: GithubConfig, token: string) {
    this.config = config
    this.token = token
  }

  private get base(): string {
    return `${API}/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}`
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    // Cheap pre-check so an offline save reports "no network" instead of a
    // confusing fetch failure.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new OfflineError()
    }

    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/vnd.github+json')
    // An empty Bearer token makes GitHub answer 401 even for a public repo, which
    // would be reported to the user as "invalid token" when in fact none was set.
    // Omitting the header lets an anonymous read behave like an anonymous read.
    if (this.token !== '') headers.set('Authorization', `Bearer ${this.token}`)
    headers.set('X-GitHub-Api-Version', API_VERSION)
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')

    try {
      return await fetch(`${this.base}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof OfflineError) throw error
      throw new NetworkError(error)
    }
  }

  /** Repository metadata; also the "check access" probe. Never writes anything. */
  async getRepo(): Promise<RepoInfo> {
    const response = await this.request('')
    if (!response.ok) throw await errorForResponse(response)
    const json = (await response.json()) as {
      default_branch?: string
      private?: boolean
      full_name?: string
      permissions?: { push?: boolean }
    }
    return {
      defaultBranch: json.default_branch ?? 'main',
      private: json.private === true,
      canPush: json.permissions?.push === true,
      fullName: json.full_name ?? `${this.config.owner}/${this.config.repo}`,
    }
  }

  /**
   * Reads a file. Returns null on 404, because a missing file is the normal state
   * before the first push — not an error.
   */
  async getContent(path: string): Promise<FileContent | null> {
    const response = await this.request(this.contentsUrl(path))
    if (response.status === 404) return null
    if (!response.ok) throw await errorForResponse(response)

    const json = (await response.json()) as {
      content?: string
      sha?: string
      size?: number
      type?: string
    }
    if (json.type === 'dir' || json.content === undefined || json.sha === undefined) return null
    return { path, contentBase64: json.content, sha: json.sha, size: json.size ?? 0 }
  }

  /** Lists a directory. Returns [] on 404: the directory has yet to be created. */
  async listDir(dir: string): Promise<DirEntry[]> {
    const response = await this.request(this.contentsUrl(dir))
    if (response.status === 404) return []
    if (!response.ok) throw await errorForResponse(response)

    const json: unknown = await response.json()
    if (!Array.isArray(json)) return []
    return json.map((raw) => {
      const entry = raw as Record<string, unknown>
      return {
        name: String(entry.name ?? ''),
        path: String(entry.path ?? ''),
        sha: String(entry.sha ?? ''),
        size: Number(entry.size ?? 0),
        type: String(entry.type ?? ''),
        downloadUrl: typeof entry.download_url === 'string' ? entry.download_url : null,
      }
    })
  }

  async putText(path: string, text: string, message: string, sha?: string): Promise<WriteResult> {
    return this.putBase64(path, utf8ToBase64(text), message, sha)
  }

  async putBlob(path: string, blob: Blob, message: string, sha?: string): Promise<WriteResult> {
    return this.putBase64(path, await blobToBase64(blob), message, sha)
  }

  async putBase64(
    path: string,
    contentBase64: string,
    message: string,
    sha?: string,
  ): Promise<WriteResult> {
    const response = await this.request(this.contentsUrl(path, false), {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch: this.config.branch,
        ...(sha === undefined ? {} : { sha }),
      }),
    })
    if (!response.ok) throw await errorForResponse(response)

    const json = (await response.json()) as {
      content?: { sha?: string }
      commit?: { sha?: string }
    }
    return {
      contentSha: json.content?.sha ?? '',
      commitSha: json.commit?.sha,
    }
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    const response = await this.request(this.contentsUrl(path, false), {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: this.config.branch }),
    })
    // Already gone is a success as far as we are concerned.
    if (response.status === 404) return
    if (!response.ok) throw await errorForResponse(response)
  }

  /**
   * Fetches raw bytes from a download_url. Not under /repos, and the URL is
   * already absolute, so it bypasses `request`. Private-repo download URLs carry
   * their own short-lived token, so no Authorization header is sent — adding one
   * makes S3 reject the request.
   */
  async downloadRaw(url: string): Promise<Blob> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw await errorForResponse(response)
      return await response.blob()
    } catch (error) {
      if (error instanceof SyncError) throw error
      throw new NetworkError(error)
    }
  }

  /** Encodes each path segment but keeps the separators. */
  private contentsUrl(path: string, withRef = true): string {
    const encoded = path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    const ref = withRef ? `?ref=${encodeURIComponent(this.config.branch)}` : ''
    return `/contents/${encoded}${ref}`
  }
}
