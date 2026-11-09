export type SwipeDir = 'left' | 'right' | 'up' | 'down'

/** Minimum travel (px) for a flick to count when it is fast enough. */
export const FLICK_MIN_DISTANCE = 30
/** Release speed (px/ms) that counts as a flick. */
export const FLICK_VELOCITY = 0.6

/**
 * Decides what a released drag means. A drag commits when it travels past
 * `threshold` along its dominant axis, or when it is flicked fast enough in
 * that direction. Returns null to spring back.
 */
export function resolveSwipe(dx: number, dy: number, vx: number, vy: number, threshold: number) {
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const d = horizontal ? dx : dy
  const v = horizontal ? vx : vy
  const far = Math.abs(d) >= threshold
  const flicked = Math.abs(d) >= FLICK_MIN_DISTANCE && Math.abs(v) >= FLICK_VELOCITY && Math.sign(v) === Math.sign(d)
  if (!far && !flicked) return null
  if (horizontal) return d > 0 ? 'right' : 'left'
  return d > 0 ? 'down' : 'up'
}

/** Direction the card is currently leaning, if it has moved far enough to say. */
export function leaningDir(dx: number, dy: number, deadZone = 12) {
  if (Math.hypot(dx, dy) < deadZone) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}
