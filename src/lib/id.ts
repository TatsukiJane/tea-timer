/** UUID v4 from the platform — no `uuid` dependency needed. */
export function newId(): string {
  return crypto.randomUUID()
}

/**
 * First 8 hex chars of an id, used as the filename suffix in the repo so two
 * teas with the same title get distinct files. The authoritative id always
 * lives in the frontmatter; this is presentation only.
 */
export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8)
}
