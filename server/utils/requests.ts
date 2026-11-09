import { z } from 'zod'
import { uuidSchema } from '../services/scope'

// Shared zod schemas for request bodies and queries.

export const MAX_EXCLUDE = 500

export const reviewBodySchema = z
  .object({ assetId: uuidSchema, decision: z.enum(['keep', 'trash', 'favourite']) })
  .strict()

export const resetBodySchema = z.object({ confirm: z.literal('RESET', { message: 'Send { confirm: "RESET" }' }) })

const single = z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.string().max(20_000).optional())

export const queueQuerySchema = z.object({
  size: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.coerce.number().int().min(1).max(50).default(10),
  ),
  exclude: single.transform((value, ctx) => {
    const ids = (value ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (ids.length > MAX_EXCLUDE) {
      ctx.addIssue({ code: 'custom', message: `At most ${MAX_EXCLUDE} excluded ids` })
      return z.NEVER
    }
    for (const id of ids) {
      if (!uuidSchema.safeParse(id).success) {
        ctx.addIssue({ code: 'custom', message: 'Invalid id in exclude (expected UUIDs)' })
        return z.NEVER
      }
    }
    return ids
  }),
  page: z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.string().max(200).optional()),
})

export const imageParamsSchema = z.object({ id: uuidSchema })
export const imageQuerySchema = z.object({
  size: z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.enum(['preview', 'thumbnail']).default('preview')),
})
