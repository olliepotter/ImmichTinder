import { ImmichError } from '../utils/immich'

/**
 * Error thrown by services. Routes convert it to an h3 error with the same
 * status code; `message` is safe to show to the user.
 */
export class AppError extends Error {
  override readonly name = 'AppError'
  readonly statusCode: number

  constructor(statusCode: number, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.statusCode = statusCode
  }
}

/** Wraps an Immich failure in a 502 (or 404 for a missing asset) with a safe message. */
export function immichFailure(error: unknown, action: string) {
  if (error instanceof ImmichError) {
    if (error.status === 404) return new AppError(404, 'Photo not found in Immich', { cause: error })
    const detail = error.status ? `HTTP ${error.status}` : error.kind
    return new AppError(502, `${action} failed in Immich (${detail})`, { cause: error })
  }
  return new AppError(502, `${action} failed in Immich`, { cause: error })
}
