import { immichFailure } from '../services/errors'

// GET /api/albums → { albums: { id, name, assetCount, thumbnailAssetId }[] }
export default defineEventHandler(async (event) => {
  const { immich } = useAppServices(event)
  try {
    const albums = await immich.listAlbums()
    return {
      albums: albums
        .map((album) => ({
          id: album.id,
          name: album.albumName,
          assetCount: album.assetCount,
          thumbnailAssetId: album.albumThumbnailAssetId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  } catch (error) {
    throw toHttpError(event, immichFailure(error, 'Loading albums'))
  }
})
