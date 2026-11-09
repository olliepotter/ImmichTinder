import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApi, toApiError } from '~/composables/useApi'

describe('toApiError', () => {
  it('prefers the h3 statusMessage from the error body', () => {
    const err = toApiError({ statusCode: 502, statusMessage: 'Bad Gateway', data: { statusCode: 502, statusMessage: 'Immich did not respond' } })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.message).toBe('Immich did not respond')
  })

  it('falls back to the status text, then a generic message', () => {
    expect(toApiError({ statusCode: 500, statusMessage: 'Server Error' }).message).toBe('Server Error')
    expect(toApiError({ statusCode: 409 }).message).toBe('Already reviewed')
    expect(toApiError(new TypeError('fetch failed')).message).toBe('Network error, check your connection')
  })
})

describe('createApi', () => {
  it('serialises the queue query and calls onUnauthorized on 401', async () => {
    const fetcher = vi.fn(async () => {
      throw Object.assign(new Error('401'), { statusCode: 401, data: { statusMessage: 'Unauthorized' } })
    })
    const onUnauthorized = vi.fn()
    // @ts-expect-error a plain mock stands in for Nuxt's typed $fetch
    const api = createApi(fetcher, { onUnauthorized })
    await expect(api.queue({ albumId: null, order: 'random', takenAfter: null, takenBefore: null, size: 10, exclude: ['a', 'b'], page: null }))
      .rejects.toMatchObject({ status: 401, message: 'Unauthorized' })
    expect(fetcher).toHaveBeenCalledWith('/api/queue', { query: { albumId: '', order: 'random', takenAfter: '', takenBefore: '', size: 10, exclude: 'a,b' } })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('does not redirect for auth endpoints (wrong password)', async () => {
    const fetcher = vi.fn(async () => {
      throw Object.assign(new Error('401'), { statusCode: 401 })
    })
    const onUnauthorized = vi.fn()
    // @ts-expect-error a plain mock stands in for Nuxt's typed $fetch
    const api = createApi(fetcher, { onUnauthorized })
    await expect(api.login('nope')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
