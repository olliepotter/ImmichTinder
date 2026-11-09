import type { Album } from '~/types/api'

/** Album list, loaded once on demand and shared between the top bar and the scope picker. */
export function useAlbums() {
  const albums = useState<Album[] | null>('albums', () => null)
  const loading = useState('albums-loading', () => false)
  const error = useState<string | null>('albums-error', () => null)
  const api = useApi()

  async function load(force = false) {
    if (loading.value || (albums.value && !force)) return
    loading.value = true
    error.value = null
    try {
      const res = await api.albums()
      albums.value = [...res.albums].sort((a, b) => a.name.localeCompare(b.name))
    }
    catch (e) {
      error.value = toApiError(e).message
    }
    finally {
      loading.value = false
    }
  }

  function nameOf(id: string | null) {
    if (!id) return null
    return albums.value?.find(a => a.id === id)?.name ?? null
  }

  return { albums, loading, error, load, nameOf }
}
