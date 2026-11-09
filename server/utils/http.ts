import type { H3Event } from 'h3'
import type { z } from 'zod'
import { AppError } from '../services/errors'
import { ImmichError } from './immich'
import { log } from './logger'

/** Validates `input` with a zod schema; throws a 400 with the first issue otherwise. */
export function parseOr400<T extends z.ZodType>(schema: T, input: unknown) {
  return unwrapOr400(schema.safeParse(input))
}

/** Returns the data of a zod safeParse result or throws a 400 with the first issue. */
export function unwrapOr400<T>(result: z.ZodSafeParseResult<T>) {
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid request: ${where}${issue?.message ?? 'validation failed'}`.slice(0, 200),
    })
  }
  return result.data
}

/** Reads and validates the JSON body (a missing body counts as `{}`; invalid JSON is a 400). */
export async function readBodyAs<T extends z.ZodType>(event: H3Event, schema: T) {
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request: body is not valid JSON' })
  }
  return parseOr400(schema, body ?? {})
}

/**
 * Converts service / Immich errors to h3 errors with safe messages and logs them.
 * Unknown errors become a generic 500.
 */
export function toHttpError(event: H3Event, error: unknown, fields: Record<string, unknown> = {}) {
  const route = event.path.split('?')[0]
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      const cause = error.cause instanceof Error ? error.cause.message : undefined
      log.warn(error.message, { route, status: error.statusCode, cause, ...fields })
    }
    return createError({ statusCode: error.statusCode, statusMessage: error.message })
  }
  if (error instanceof ImmichError) {
    log.warn('immich request failed', { route, status: 502, cause: error.message, ...fields })
    return createError({ statusCode: error.status === 404 ? 404 : 502, statusMessage: 'Immich request failed' })
  }
  if (isError(error)) return error
  log.error('unexpected error', { route, status: 500, cause: error instanceof Error ? error.message : 'unknown', ...fields })
  return createError({ statusCode: 500, statusMessage: 'Internal server error' })
}
