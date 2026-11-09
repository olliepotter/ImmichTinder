export type Toast = { id: number, message: string, kind: 'error' | 'info' }

let nextId = 1

/** App-wide toast list. Toasts dismiss themselves after a few seconds. */
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function show(message: string, kind: Toast['kind'] = 'info', durationMs = 4000) {
    const id = nextId++
    // Keep at most three on screen.
    toasts.value = [...toasts.value.slice(-2), { id, message, kind }]
    if (import.meta.client) setTimeout(() => dismiss(id), durationMs)
    return id
  }

  return {
    toasts,
    dismiss,
    error: (message: string) => show(message, 'error', 5000),
    info: (message: string) => show(message, 'info'),
  }
}
