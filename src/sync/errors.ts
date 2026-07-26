import { t } from '@/i18n'
import { formatTime } from '@/lib/format'

/**
 * Typed sync errors, so the UI can say something true rather than echoing a
 * status code.
 *
 * The error messages here are shaped by how fine-grained PATs actually behave,
 * which is not how you would guess:
 *
 *  - A private repository outside the token's selected list answers 404, not 403.
 *    So a "not found" must never be reported as simply missing.
 *  - A 403 can mean any of three different things — missing Contents:
 *    Read and write, the repo not being in the token's selected repositories, or
 *    unauthorised org SSO — and the API does not distinguish them. All three are
 *    listed rather than guessing one.
 *  - A 404 from getContent is not an error at all: it means the file does not
 *    exist yet and should be created.
 */

export class SyncError extends Error {
  /** Text shown to the user, already localised. */
  readonly userMessage: string

  constructor(message: string, userMessage: string) {
    super(message)
    this.name = 'SyncError'
    this.userMessage = userMessage
  }
}

export class OfflineError extends SyncError {
  constructor() {
    super('offline', t('error.offline'))
    this.name = 'OfflineError'
  }
}

export class NetworkError extends SyncError {
  constructor(cause?: unknown) {
    super('network failure', t('error.network'))
    this.name = 'NetworkError'
    this.cause = cause
  }
}

export class AuthError extends SyncError {
  constructor() {
    super('401 unauthorized', t('error.auth'))
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends SyncError {
  constructor() {
    super('403 forbidden', t('error.forbidden'))
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends SyncError {
  constructor() {
    super('404 not found', t('error.notFound'))
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends SyncError {
  readonly detail: string | undefined

  constructor(detail?: string) {
    super(`409/422 conflict${detail === undefined ? '' : `: ${detail}`}`, t('error.conflict'))
    this.name = 'ConflictError'
    this.detail = detail
  }
}

export class RateLimitError extends SyncError {
  readonly resetAt: Date

  constructor(resetAt: Date) {
    super('rate limit exceeded', t('error.rateLimit', { when: formatTime(resetAt) }))
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

export class NotConfiguredError extends SyncError {
  constructor() {
    super('github not configured', t('error.notConfigured'))
    this.name = 'NotConfiguredError'
  }
}

export class UnexpectedStatusError extends SyncError {
  readonly status: number

  constructor(status: number, detail: string) {
    super(`unexpected status ${status}: ${detail}`, t('error.unknown', { message: `${status}` }))
    this.name = 'UnexpectedStatusError'
    this.status = status
  }
}

/** Anything we show the user; falls back to a generic message for unknowns. */
export function userMessageOf(error: unknown): string {
  if (error instanceof SyncError) return error.userMessage
  if (error instanceof Error) return t('error.unknown', { message: error.message })
  return t('error.unknown', { message: String(error) })
}

/**
 * Maps a failed response to a typed error. `response` is consumed for its body
 * text, so the caller must not read it again.
 */
export async function errorForResponse(response: Response): Promise<SyncError> {
  const detail = await safeText(response)

  // Rate limiting arrives as 403 or 429; the remaining-count header is what
  // distinguishes it from a permissions problem.
  const remaining = response.headers.get('x-ratelimit-remaining')
  if ((response.status === 403 || response.status === 429) && remaining === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : new Date()
    return new RateLimitError(resetAt)
  }

  switch (response.status) {
    case 401:
      return new AuthError()
    case 403:
      return new ForbiddenError()
    case 404:
      return new NotFoundError()
    case 409:
      return new ConflictError(detail)
    case 422:
      // 422 is usually a stale or missing sha, which is the same recovery path
      // as a 409: re-read the file and retry once.
      return new ConflictError(detail)
    default:
      return new UnexpectedStatusError(response.status, detail)
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text()
    // Keep it short: this ends up in console output, never in a toast.
    return text.slice(0, 300)
  } catch {
    return ''
  }
}
