import { getDb } from './index'
import type { BrewSession, GithubConfig, Prefs } from './schema'

export const DEFAULT_PREFS: Prefs = {
  sound: true,
  vibration: true,
  wakeLock: true,
}

export const DEFAULT_GITHUB: GithubConfig = {
  owner: '',
  repo: '',
  branch: 'main',
  modesDir: 'modes',
  assetsDir: 'assets',
}

export async function getPrefs(): Promise<Prefs> {
  const db = await getDb()
  const row = await db.get('settings', 'prefs')
  return row?.key === 'prefs' ? { ...DEFAULT_PREFS, ...row.value } : DEFAULT_PREFS
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...patch }
  const db = await getDb()
  await db.put('settings', { key: 'prefs', value: next })
  return next
}

export async function getGithubConfig(): Promise<GithubConfig> {
  const db = await getDb()
  const row = await db.get('settings', 'github')
  return row?.key === 'github' ? { ...DEFAULT_GITHUB, ...row.value } : DEFAULT_GITHUB
}

export async function setGithubConfig(patch: Partial<GithubConfig>): Promise<GithubConfig> {
  const next = normaliseConfig({ ...(await getGithubConfig()), ...patch })
  const db = await getDb()
  await db.put('settings', { key: 'github', value: next })
  return next
}

/** Trims stray whitespace and slashes so path building never doubles a separator. */
export function normaliseConfig(config: GithubConfig): GithubConfig {
  const dir = (value: string, fallback: string) => {
    const cleaned = value.trim().replace(/^\/+|\/+$/g, '')
    return cleaned === '' ? fallback : cleaned
  }
  return {
    owner: config.owner.trim(),
    repo: config.repo.trim().replace(/^\/+|\/+$/g, ''),
    branch: config.branch.trim() === '' ? 'main' : config.branch.trim(),
    modesDir: dir(config.modesDir, DEFAULT_GITHUB.modesDir),
    assetsDir: dir(config.assetsDir, DEFAULT_GITHUB.assetsDir),
  }
}

export function isConfigured(config: GithubConfig, token: string | undefined): boolean {
  return config.owner !== '' && config.repo !== '' && (token ?? '') !== ''
}

/* ── Token ────────────────────────────────────────────────────────────────────
 * Its own row so that clearing it is one delete. Never logged, never put into an
 * error object, never written to localStorage or a URL. */

export async function getToken(): Promise<string | undefined> {
  const db = await getDb()
  const row = await db.get('settings', 'token')
  return row?.key === 'token' ? row.value : undefined
}

export async function setToken(token: string): Promise<void> {
  const db = await getDb()
  const trimmed = token.trim()
  if (trimmed === '') {
    await db.delete('settings', 'token')
    return
  }
  await db.put('settings', { key: 'token', value: trimmed })
}

export async function clearToken(): Promise<void> {
  const db = await getDb()
  await db.delete('settings', 'token')
}

/* ── In-flight brew session ───────────────────────────────────────────────── */

export async function getSession(): Promise<BrewSession | undefined> {
  const db = await getDb()
  const row = await db.get('settings', 'session')
  return row?.key === 'session' ? row.value : undefined
}

export async function setSession(session: BrewSession): Promise<void> {
  const db = await getDb()
  await db.put('settings', { key: 'session', value: session })
}

export async function clearSession(): Promise<void> {
  const db = await getDb()
  await db.delete('settings', 'session')
}

/* ── Sync timestamp ───────────────────────────────────────────────────────── */

export async function getLastSyncAt(): Promise<string | undefined> {
  const db = await getDb()
  const row = await db.get('settings', 'lastSyncAt')
  return row?.key === 'lastSyncAt' ? row.value : undefined
}

export async function setLastSyncAt(iso: string): Promise<void> {
  const db = await getDb()
  await db.put('settings', { key: 'lastSyncAt', value: iso })
}
