import type { ReviewRow } from '../database/repository'
import type { ImmichAsset } from '../utils/immich'

/** QueueItem as defined in docs/DESIGN.md. */
export function toQueueItem(asset: ImmichAsset) {
  const exif = asset.exifInfo
  const parts = [exif?.city, exif?.state, exif?.country].filter((part): part is string => Boolean(part))
  return {
    id: asset.id,
    takenAt: exif?.dateTimeOriginal ?? asset.localDateTime ?? asset.fileCreatedAt ?? null,
    fileName: asset.originalFileName ?? null,
    isFavorite: asset.isFavorite,
    width: asset.width ?? exif?.exifImageWidth ?? null,
    height: asset.height ?? exif?.exifImageHeight ?? null,
    location: {
      text: parts.length > 0 ? parts.join(', ') : null,
      city: exif?.city ?? null,
      state: exif?.state ?? null,
      country: exif?.country ?? null,
      latitude: exif?.latitude ?? null,
      longitude: exif?.longitude ?? null,
    },
    camera: cameraName(exif?.make ?? null, exif?.model ?? null),
  }
}

export type QueueItem = ReturnType<typeof toQueueItem>

/** "Make Model", without repeating the make when the model already starts with it. */
export function cameraName(make: string | null, model: string | null) {
  const m = make?.trim() || null
  const n = model?.trim() || null
  if (m && n) return n.toLowerCase().startsWith(m.toLowerCase()) ? n : `${m} ${n}`
  return m ?? n
}

/** Review as defined in docs/DESIGN.md. */
export function toReview(row: ReviewRow) {
  return { assetId: row.asset_id, status: row.status, reviewedAt: row.reviewed_at }
}

export type Review = ReturnType<typeof toReview>
