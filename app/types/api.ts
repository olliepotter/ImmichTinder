// Mirrors the HTTP API contract in docs/DESIGN.md. Keep the two in sync.

export type ScopeOrder = 'random' | 'oldest' | 'newest'

export type ReviewScope = {
  albumId: string | null // null = whole library
  order: ScopeOrder
  takenAfter: string | null // ISO date (inclusive)
  takenBefore: string | null // ISO date (exclusive)
}

export type QueueItemLocation = {
  text: string | null
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}

export type QueueItem = {
  id: string
  takenAt: string | null
  fileName: string | null
  isFavorite: boolean
  width: number | null
  height: number | null
  location: QueueItemLocation
  camera: string | null // "Make Model"
}

export type ReviewStatus = 'kept' | 'trashed' | 'favourited'
export type Decision = 'keep' | 'trash' | 'favourite'

export type Review = { assetId: string, status: ReviewStatus, reviewedAt: string }

export type Stats = {
  total: number
  reviewed: number
  kept: number
  trashed: number
  favourited: number
  remaining: number
  percent: number
}

export type Album = {
  id: string
  name: string
  assetCount: number
  thumbnailAssetId: string | null
}

export type QueueResponse = { items: QueueItem[], nextCursor: string | null, exhausted: boolean }
export type ReviewResponse = { review: Review, stats: Stats }
export type UndoResponse = { undone: Review | null, asset: QueueItem | null, stats: Stats }
export type ResetResponse = { deleted: number }
export type SessionResponse = { authenticated: boolean }

export type QueueQuery = ReviewScope & {
  size: number
  exclude: string[]
  page: string | null
}

export const DEFAULT_SCOPE: ReviewScope = {
  albumId: null,
  order: 'random',
  takenAfter: null,
  takenBefore: null,
}

export const EMPTY_STATS: Stats = {
  total: 0,
  reviewed: 0,
  kept: 0,
  trashed: 0,
  favourited: 0,
  remaining: 0,
  percent: 0,
}

export function imageUrl(id: string, size: 'preview' | 'thumbnail' = 'preview') {
  return `/api/assets/${encodeURIComponent(id)}/image?size=${size}`
}
