/**
 * In-memory, non-blocking locks. `tryAcquire` is synchronous, so in Node's
 * single-threaded event loop check-and-set is atomic. A held lock means
 * "busy": callers fail fast (409) instead of waiting.
 */
export function createKeyedLock() {
  const held = new Set<string>()
  return {
    tryAcquire(key: string) {
      if (held.has(key)) return false
      held.add(key)
      return true
    },
    release(key: string) {
      held.delete(key)
    },
    isHeld: (key: string) => held.has(key),
  }
}

export type KeyedLock = ReturnType<typeof createKeyedLock>
