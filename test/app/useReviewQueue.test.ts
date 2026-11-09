import { describe, expect, it, vi } from 'vitest'
import { useReviewQueue } from '~/composables/useReviewQueue'
import type { ReviewQueueApi } from '~/composables/useReviewQueue'
import type { Decision, QueueItem, QueueQuery, Stats } from '~/types/api'
import { DEFAULT_SCOPE } from '~/types/api'

function item(n: number): QueueItem {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    takenAt: '2024-05-01T10:00:00.000Z',
    fileName: `IMG_${n}.jpg`,
    isFavorite: false,
    width: 4000,
    height: 3000,
    location: { text: null, city: 'Paris', state: null, country: 'France', latitude: null, longitude: null },
    camera: 'Apple iPhone 15',
  }
}

function stats(reviewed: number, total: number): Stats {
  return { total, reviewed, kept: reviewed, trashed: 0, favourited: 0, remaining: total - reviewed, percent: total ? Math.round((reviewed / total) * 1000) / 10 : 0 }
}

function httpError(statusCode: number, statusMessage: string) {
  return Object.assign(new Error(`[POST] ${statusCode}`), { statusCode, data: { statusCode, statusMessage } })
}

/** In-memory fake of the backend, honouring `exclude`, `size` and reviewed rows. */
function fakeServer(count: number) {
  const pool = Array.from({ length: count }, (_, i) => item(i + 1))
  const reviewed: string[] = []
  const current = () => stats(reviewed.length, count)
  const api = {
    getScope: vi.fn(async () => ({ ...DEFAULT_SCOPE })),
    putScope: vi.fn(async (scope: typeof DEFAULT_SCOPE) => scope),
    stats: vi.fn(async () => current()),
    queue: vi.fn(async (q: QueueQuery) => {
      const available = pool.filter(i => !reviewed.includes(i.id) && !q.exclude.includes(i.id))
      const items = available.slice(0, q.size)
      return { items, nextCursor: null, exhausted: available.length <= q.size }
    }),
    review: vi.fn(async (assetId: string, _decision: Decision) => {
      reviewed.push(assetId)
      return { review: { assetId, status: 'kept' as const, reviewedAt: new Date().toISOString() }, stats: current() }
    }),
    undo: vi.fn(async () => {
      const id = reviewed.pop()
      const asset = pool.find(i => i.id === id) ?? null
      return { undone: id ? { assetId: id, status: 'kept' as const, reviewedAt: '' } : null, asset, stats: current() }
    }),
    reset: vi.fn(async () => ({ deleted: reviewed.splice(0).length })),
  } satisfies ReviewQueueApi
  return { api, pool, reviewed }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function setup(count = 20) {
  const server = fakeServer(count)
  const onError = vi.fn()
  const onInfo = vi.fn()
  const preload = vi.fn()
  const queue = useReviewQueue({ api: server.api, onError, onInfo, preload })
  await queue.init()
  return { ...server, queue, onError, onInfo, preload }
}

/** Lets background refills settle. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('useReviewQueue', () => {
  it('loads the saved scope, a queue of 10 and the stats', async () => {
    const { api, queue } = await setup()
    expect(api.getScope).toHaveBeenCalledOnce()
    expect(api.queue).toHaveBeenCalledOnce()
    expect(api.queue.mock.calls[0]?.[0]).toMatchObject({ size: 10, exclude: [], page: null, order: 'random' })
    expect(queue.items.value).toHaveLength(10)
    expect(queue.current.value?.id).toBe(item(1).id)
    expect(queue.stats.value.total).toBe(20)
    expect(queue.loading.value).toBe(false)
  })

  it('preloads the next three preview images', async () => {
    const { preload } = await setup()
    expect(preload.mock.calls.map(c => c[0])).toEqual([2, 3, 4].map(n => `/api/assets/${item(n).id}/image?size=preview`))
  })

  it('advances and takes the server stats after a confirmed review', async () => {
    const { api, queue } = await setup()
    const outcome = await queue.decide('keep')
    expect(outcome).toBe('done')
    expect(api.review).toHaveBeenCalledWith(item(1).id, 'keep')
    expect(queue.current.value?.id).toBe(item(2).id)
    expect(queue.stats.value.reviewed).toBe(1)
  })

  it('does not advance or change stats when the action fails', async () => {
    const { api, queue, onError } = await setup()
    api.review.mockRejectedValueOnce(httpError(502, 'Immich did not accept the change'))
    const before = { ...queue.stats.value }
    const beforeAdvance = vi.fn()
    const outcome = await queue.decide('trash', beforeAdvance)
    expect(outcome).toBe('failed')
    expect(beforeAdvance).not.toHaveBeenCalled()
    expect(queue.current.value?.id).toBe(item(1).id)
    expect(queue.items.value).toHaveLength(10)
    expect(queue.stats.value).toEqual(before)
    expect(onError).toHaveBeenCalledWith('Immich did not accept the change')
    expect(queue.pending.value).toBe(false)
  })

  it('only leaves after the server confirms, then runs the exit animation before advancing', async () => {
    const { api, queue } = await setup()
    const response = deferred<Awaited<ReturnType<typeof api.review>>>()
    api.review.mockReturnValueOnce(response.promise)
    const seenDuringExit: (string | undefined)[] = []
    const done = queue.decide('keep', () => {
      seenDuringExit.push(queue.current.value?.id)
    })
    expect(queue.pending.value).toBe(true)
    expect(queue.current.value?.id).toBe(item(1).id)
    response.resolve({ review: { assetId: item(1).id, status: 'kept', reviewedAt: '' }, stats: stats(1, 20) })
    await done
    expect(seenDuringExit).toEqual([item(1).id])
    expect(queue.current.value?.id).toBe(item(2).id)
  })

  it('blocks a second action while one is pending', async () => {
    const { api, queue } = await setup()
    const response = deferred<Awaited<ReturnType<typeof api.review>>>()
    api.review.mockReturnValueOnce(response.promise)
    const first = queue.decide('keep')
    expect(await queue.decide('trash')).toBe('ignored')
    expect(await queue.skip()).toBe('ignored')
    expect(await queue.undo()).toBe('ignored')
    expect(api.review).toHaveBeenCalledOnce()
    expect(api.undo).not.toHaveBeenCalled()
    response.resolve({ review: { assetId: item(1).id, status: 'kept', reviewedAt: '' }, stats: stats(1, 20) })
    expect(await first).toBe('done')
    expect(queue.current.value?.id).toBe(item(2).id)
  })

  it('drops an already-reviewed photo (409) quietly and advances', async () => {
    const { api, queue, onError } = await setup()
    api.review.mockRejectedValueOnce(httpError(409, 'Already reviewed'))
    const outcome = await queue.decide('keep')
    expect(outcome).toBe('dropped')
    expect(onError).not.toHaveBeenCalled()
    expect(queue.current.value?.id).toBe(item(2).id)
    expect(queue.items.value.map(i => i.id)).not.toContain(item(1).id)
  })

  it('skips without calling the server and excludes skipped ids from refills', async () => {
    const { api, queue } = await setup()
    await queue.skip()
    expect(api.review).not.toHaveBeenCalled()
    expect(queue.current.value?.id).toBe(item(2).id)
    expect(queue.skipped.value.has(item(1).id)).toBe(true)
    // Drain to the refill threshold and check the refill excludes the skip.
    for (let i = 0; i < 6; i++) await queue.decide('keep')
    await flush()
    const refillQuery = api.queue.mock.calls.at(-1)?.[0]
    expect(api.queue).toHaveBeenCalledTimes(2)
    expect(refillQuery?.exclude).toContain(item(1).id)
    expect(queue.items.value.map(i => i.id)).not.toContain(item(1).id)
  })

  it('never re-adds a skipped photo even if the server returns it', async () => {
    const { api, queue } = await setup(12)
    await queue.skip()
    api.queue.mockResolvedValueOnce({ items: [item(1), item(11)], nextCursor: null, exhausted: true })
    for (let i = 0; i < 6; i++) await queue.decide('keep')
    await flush()
    expect(queue.items.value.map(i => i.id)).toEqual([item(8), item(9), item(10), item(11)].map(i => i.id))
  })

  it('refills when three or fewer remain, excluding the held ids', async () => {
    const { api, queue } = await setup()
    for (let i = 0; i < 6; i++) await queue.decide('keep')
    await flush()
    expect(queue.items.value).toHaveLength(4)
    expect(api.queue).toHaveBeenCalledOnce()
    await queue.decide('keep')
    await flush()
    expect(api.queue).toHaveBeenCalledTimes(2)
    const q = api.queue.mock.calls[1]?.[0]
    expect(q?.size).toBe(7)
    expect(q?.exclude).toEqual([item(8), item(9), item(10)].map(i => i.id))
    expect(queue.items.value).toHaveLength(10)
  })

  it('undo puts the returned photo back at the front', async () => {
    const { api, queue } = await setup()
    await queue.decide('keep')
    expect(queue.current.value?.id).toBe(item(2).id)
    expect(await queue.undo()).toBe('done')
    expect(api.undo).toHaveBeenCalledOnce()
    expect(queue.current.value?.id).toBe(item(1).id)
    expect(queue.items.value.filter(i => i.id === item(1).id)).toHaveLength(1)
    expect(queue.stats.value.reviewed).toBe(0)
  })

  it('undo with nothing to undo leaves the queue alone and says so', async () => {
    const { queue, onInfo } = await setup()
    await queue.undo()
    expect(onInfo).toHaveBeenCalledWith('Nothing to undo')
    expect(queue.current.value?.id).toBe(item(1).id)
  })

  it('a failed undo shows the error and changes nothing', async () => {
    const { api, queue, onError } = await setup()
    await queue.decide('keep')
    api.undo.mockRejectedValueOnce(httpError(502, 'Could not restore from trash'))
    expect(await queue.undo()).toBe('failed')
    expect(onError).toHaveBeenCalledWith('Could not restore from trash')
    expect(queue.current.value?.id).toBe(item(2).id)
    expect(queue.stats.value.reviewed).toBe(1)
  })

  it('reports exhaustion once the server has nothing left', async () => {
    const { queue } = await setup(2)
    expect(queue.exhausted.value).toBe(false)
    await queue.decide('keep')
    await queue.decide('trash')
    await flush()
    expect(queue.current.value).toBeNull()
    expect(queue.exhausted.value).toBe(true)
    // Undo brings the last photo back.
    await queue.undo()
    expect(queue.exhausted.value).toBe(false)
    expect(queue.current.value?.id).toBe(item(2).id)
  })

  it('shows a load error when the first page fails, and retry recovers', async () => {
    const server = fakeServer(5)
    server.api.queue.mockRejectedValueOnce(httpError(502, 'Immich is unreachable'))
    const queue = useReviewQueue({ api: server.api, preload: vi.fn() })
    await queue.init()
    expect(queue.loadError.value).toBe('Immich is unreachable')
    expect(queue.exhausted.value).toBe(false)
    await queue.retry()
    expect(queue.loadError.value).toBeNull()
    expect(queue.items.value).toHaveLength(5)
  })

  it('saving a scope restarts the queue with the new scope', async () => {
    const { api, queue } = await setup()
    await queue.decide('keep')
    const scope = { albumId: '11111111-1111-4111-8111-111111111111', order: 'oldest' as const, takenAfter: null, takenBefore: null }
    await queue.setScope(scope)
    expect(api.putScope).toHaveBeenCalledWith(scope)
    expect(api.queue.mock.calls.at(-1)?.[0]).toMatchObject({ albumId: scope.albumId, order: 'oldest', page: null, exclude: [] })
    expect(api.stats).toHaveBeenLastCalledWith(scope)
  })

  it('reset history clears skips and reloads', async () => {
    const { api, queue } = await setup()
    await queue.skip()
    await queue.decide('keep')
    expect(await queue.resetHistory()).toBe(1)
    expect(api.reset).toHaveBeenCalledOnce()
    expect(queue.skipped.value.size).toBe(0)
    expect(queue.current.value?.id).toBe(item(1).id)
  })
})
