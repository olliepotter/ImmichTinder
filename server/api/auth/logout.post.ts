// POST /api/auth/logout → { ok: true }
export default defineEventHandler(async (event) => {
  const session = await useAppSession(event)
  await session.clear()
  return { ok: true }
})
