// GET /api/assets/:id/image?size=preview|thumbnail → image bytes proxied from Immich.
export default defineEventHandler(async (event) => {
  const { id } = parseOr400(imageParamsSchema, getRouterParams(event))
  const { size } = parseOr400(imageQuerySchema, getQuery(event))
  const { immich } = useAppServices(event)
  try {
    const image = await immich.fetchThumbnail(id, size)
    setResponseHeader(event, 'Content-Type', image.contentType)
    setResponseHeader(event, 'Cache-Control', 'private, max-age=3600')
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    return Buffer.from(image.body)
  } catch (error) {
    throw toHttpError(event, error, { assetId: id })
  }
})
