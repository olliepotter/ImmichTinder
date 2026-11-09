export type KeyAction = NonNullable<ReturnType<typeof keyToAction>>

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>

/** Keyboard mapping from docs/DESIGN.md "Frontend behaviour". */
export function keyToAction(event: KeyLike) {
  const key = event.key
  if (event.altKey) return null
  if (event.ctrlKey || event.metaKey) {
    // Only Ctrl+Z / Cmd+Z; leave every other browser shortcut alone.
    return key.toLowerCase() === 'z' ? 'undo' : null
  }
  switch (key) {
    case 'ArrowLeft':
      return 'trash'
    case 'ArrowRight':
      return 'keep'
    case 'ArrowUp':
      return 'favourite'
    case 'ArrowDown':
      return 'details'
    case 'Escape':
      return 'close'
    case '?':
      return 'help'
  }
  switch (key.toLowerCase()) {
    case 'd':
      return 'trash'
    case 'k':
      return 'keep'
    case 'f':
      return 'favourite'
    case 'i':
      return 'details'
    case 's':
      return 'skip'
    case 'u':
      return 'undo'
  }
  return null
}

/** True when the event target is somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export const SHORTCUTS: { keys: string[], label: string }[] = [
  { keys: ['←', 'D'], label: 'Trash' },
  { keys: ['→', 'K'], label: 'Keep' },
  { keys: ['↑', 'F'], label: 'Favourite' },
  { keys: ['↓', 'I'], label: 'Details' },
  { keys: ['S'], label: 'Skip (this session only)' },
  { keys: ['U', 'Ctrl Z', '⌘ Z'], label: 'Undo' },
  { keys: ['?'], label: 'Show shortcuts' },
  { keys: ['Esc'], label: 'Close panel' },
]
