import { computed, ref, shallowRef } from 'vue'
import type { Decision, QueueItem, ReviewScope, Stats } from '~/types/api'
import { DEFAULT_SCOPE, EMPTY_STATS, imageUrl } from '~/types/api'
import type { Api } from './useApi'
import { toApiError } from './useApi'

export const QUEUE_TARGET = 10
export const REFILL_AT = 3
export const PRELOAD_AHEAD = 3
/** Cap on skipped ids sent as `exclude`, to keep the query string a sane length. */
export const MAX_SKIP_EXCLUDE = 250
/** Empty non-exhausted pages tolerated in a row before treating the scope as done. */
const MAX_EMPTY_REFILLS = 3

export type ReviewQueueApi = Pick<Api, 'queue' | 'review' | 'undo' | 'stats' | 'getScope' | 'putScope' | 'reset'>

export type ReviewQueueOptions = {
  api: ReviewQueueApi
  /** Shows an error to the user (toast). */
  onError?: (message: string) => void
  /** Shows a neutral notice to the user (toast). */
  onInfo?: (message: string) => void
  /** Preloads an image URL; defaults to `new Image()`. */
  preload?: (url: string) => void
}

/**
 * Runs before the queue advances, after the server has confirmed. The page
 * uses it to play the card's exit animation, so the card only ever leaves
 * once the decision is recorded.
 */
export type BeforeAdvance = () => Promise<void> | void

function browserPreload() {
  const held = new Map<string, HTMLImageElement>()
  return (url: string) => {
    if (typeof Image === 'undefined' || held.has(url)) return
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    held.set(url, img)
    // Keep a bounded number of references alive so the browser finishes them.
    if (held.size > 30) {
      const oldest = held.keys().next().value
      if (oldest !== undefined) held.delete(oldest)
    }
  }
}

export function useReviewQueue(options: ReviewQueueOptions) {
  const { api } = options
  const preload = options.preload ?? browserPreload()
  const notifyError = (message: string) => options.onError?.(message)

  const scope = ref<ReviewScope>({ ...DEFAULT_SCOPE })
  const items = ref<QueueItem[]>([])
  const stats = ref<Stats>({ ...EMPTY_STATS })
  /** True while a review / undo / skip is in flight; all input is ignored meanwhile. */
  const pending = ref(false)
  /** True during the initial load of a scope (show a skeleton). */
  const loading = ref(false)
  /** Initial-load error (show an error state with Retry). */
  const loadError = ref<string | null>(null)
  /** The server reported no further candidates for this scope. */
  const serverExhausted = ref(false)
  const refilling = ref(false)
  let scopeLoaded = false

  const skipped = shallowRef(new Set<string>())
  let cursor: string | null = null
  let generation = 0
  let emptyRefills = 0
  let refillPromise: Promise<void> | null = null
  const preloaded = new Set<string>()

  const current = computed(() => items.value[0] ?? null)
  const exhausted = computed(() => !loading.value && !loadError.value && items.value.length === 0 && serverExhausted.value)

  function preloadAhead() {
    for (const item of items.value.slice(1, 1 + PRELOAD_AHEAD)) {
      const url = imageUrl(item.id)
      if (preloaded.has(url)) continue
      preloaded.add(url)
      preload(url)
    }
  }

  function excludeIds() {
    const skippedIds = [...skipped.value].slice(-MAX_SKIP_EXCLUDE)
    return [...new Set([...items.value.map(i => i.id), ...skippedIds])]
  }

  async function fetchMore(gen: number) {
    const size = QUEUE_TARGET - items.value.length
    if (size <= 0) return
    const res = await api.queue({ ...scope.value, size, exclude: excludeIds(), page: cursor })
    if (gen !== generation) return // scope changed meanwhile; drop the stale page
    cursor = res.nextCursor
    const held = new Set(items.value.map(i => i.id))
    const fresh = res.items.filter(i => !held.has(i.id) && !skipped.value.has(i.id))
    items.value = [...items.value, ...fresh]
    emptyRefills = fresh.length === 0 ? emptyRefills + 1 : 0
    serverExhausted.value = res.exhausted || emptyRefills >= MAX_EMPTY_REFILLS
    preloadAhead()
  }

  /** Tops the queue up when it is at or below the refill threshold. */
  function refill() {
    if (refillPromise) return refillPromise
    if (serverExhausted.value || items.value.length > REFILL_AT) return Promise.resolve()
    const gen = generation
    refilling.value = true
    refillPromise = (async () => {
      try {
        await fetchMore(gen)
        // An empty queue after a non-exhausted page: keep trying (bounded).
        while (gen === generation && items.value.length === 0 && !serverExhausted.value) await fetchMore(gen)
      }
      catch (error) {
        if (gen !== generation) return
        if (items.value.length === 0) loadError.value = toApiError(error).message
        // Otherwise stay quiet: the next advance retries the refill.
      }
      finally {
        if (gen === generation) {
          refilling.value = false
          refillPromise = null
        }
      }
    })()
    return refillPromise
  }

  async function refreshStats() {
    const gen = generation
    try {
      const next = await api.stats(scope.value)
      if (gen === generation) stats.value = next
    }
    catch {
      // Stats are advisory; the next review response carries fresh ones.
    }
  }

  /** Drops held items and reloads the queue and stats for the current scope. */
  async function reload() {
    generation++
    refillPromise = null
    refilling.value = false
    cursor = null
    emptyRefills = 0
    items.value = []
    serverExhausted.value = false
    loadError.value = null
    loading.value = true
    const gen = generation
    try {
      await Promise.all([refill(), refreshStats()])
    }
    finally {
      if (gen === generation) loading.value = false
    }
  }

  /** Loads the saved scope, then the queue. */
  async function init() {
    loading.value = true
    loadError.value = null
    try {
      scope.value = await api.getScope()
      scopeLoaded = true
    }
    catch (error) {
      loading.value = false
      loadError.value = toApiError(error).message
      return
    }
    await reload()
  }

  function retry() {
    return scopeLoaded ? reload() : init()
  }

  function removeItem(id: string) {
    items.value = items.value.filter(i => i.id !== id)
    preloadAhead()
    void refill()
  }

  async function decide(decision: Decision, beforeAdvance?: BeforeAdvance) {
    const item = current.value
    if (pending.value || !item) return 'ignored'
    pending.value = true
    try {
      let res
      try {
        res = await api.review(item.id, decision)
      }
      catch (error) {
        const apiError = toApiError(error)
        if (apiError.status === 409) {
          // Already reviewed (elsewhere, or a double submit): drop it quietly.
          removeItem(item.id)
          void refreshStats()
          return 'dropped'
        }
        notifyError(apiError.message)
        return 'failed'
      }
      stats.value = res.stats
      await beforeAdvance?.()
      removeItem(item.id)
      return 'done'
    }
    finally {
      pending.value = false
    }
  }

  /** Skips the current photo for this session. Never sent to the server. */
  async function skip(beforeAdvance?: BeforeAdvance) {
    const item = current.value
    if (pending.value || !item) return 'ignored'
    pending.value = true
    try {
      skipped.value = new Set([...skipped.value, item.id])
      await beforeAdvance?.()
      removeItem(item.id)
      return 'done'
    }
    finally {
      pending.value = false
    }
  }

  async function undo() {
    if (pending.value) return 'ignored'
    pending.value = true
    try {
      const res = await api.undo()
      stats.value = res.stats
      if (!res.undone) {
        options.onInfo?.('Nothing to undo')
        return 'done'
      }
      const asset = res.asset
      if (asset) {
        if (skipped.value.has(asset.id)) {
          const next = new Set(skipped.value)
          next.delete(asset.id)
          skipped.value = next
        }
        items.value = [asset, ...items.value.filter(i => i.id !== asset.id)]
        preloadAhead()
      }
      return 'done'
    }
    catch (error) {
      notifyError(toApiError(error).message)
      return 'failed'
    }
    finally {
      pending.value = false
    }
  }

  /** Saves a new scope and restarts the queue. Throws ApiError on failure. */
  async function setScope(next: ReviewScope) {
    scope.value = await api.putScope(next)
    scopeLoaded = true
    await reload()
  }

  /** Deletes local review history (never touches Immich) and restarts. */
  async function resetHistory() {
    const res = await api.reset()
    skipped.value = new Set()
    preloaded.clear()
    await reload()
    return res.deleted
  }

  return {
    scope,
    items,
    current,
    stats,
    pending,
    loading,
    loadError,
    exhausted,
    refilling,
    skipped,
    init,
    retry,
    reload,
    refill,
    decide,
    skip,
    undo,
    setScope,
    resetHistory,
  }
}

export type ReviewQueue = ReturnType<typeof useReviewQueue>
