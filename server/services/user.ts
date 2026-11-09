import type { ImmichClient } from '../utils/immich'
import { immichFailure } from './errors'

/**
 * Resolves the Immich user id once (GET /api/users/me) and caches it. A failed
 * lookup is not cached, so the next request retries.
 */
export function createUserIdResolver(immich: Pick<ImmichClient, 'getMe'>) {
  let pending: Promise<string> | null = null
  return function getUserId() {
    if (!pending) {
      pending = immich.getMe().then(
        (user) => user.id,
        (error: unknown) => {
          pending = null
          throw immichFailure(error, 'Looking up the Immich user')
        },
      )
    }
    return pending
  }
}
