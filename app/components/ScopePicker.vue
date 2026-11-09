<template>
  <BottomSheet :open="open" title="Review scope" centred @close="emit('close')">
    <form class="scope-form" @submit.prevent="submit">
      <fieldset class="segmented">
        <legend>Photos from</legend>
        <label :class="{ on: source === 'library' }">
          <input v-model="source" type="radio" value="library" class="sr-only"> Whole library
        </label>
        <label :class="{ on: source === 'album' }">
          <input v-model="source" type="radio" value="album" class="sr-only"> An album
        </label>
      </fieldset>

      <label v-if="source === 'album'" class="field">
        <span>Album</span>
        <select v-model="albumId" class="input" :disabled="albumsLoading" required>
          <option :value="null" disabled>{{ albumsLoading ? 'Loading albums…' : 'Choose an album' }}</option>
          <option v-for="a in albums ?? []" :key="a.id" :value="a.id">
            {{ a.name }} ({{ formatCount(a.assetCount) }})
          </option>
        </select>
      </label>
      <p v-if="source === 'album' && albumsError" class="error">
        {{ albumsError }} <button type="button" class="link" @click="loadAlbums(true)">Retry</button>
      </p>
      <p v-else-if="source === 'album' && albums && !albums.length" class="hint">No albums found in Immich.</p>

      <fieldset class="segmented">
        <legend>Order</legend>
        <label v-for="o in ORDERS" :key="o" :class="{ on: order === o }">
          <input v-model="order" type="radio" :value="o" class="sr-only"> {{ orderLabel(o) }}
        </label>
      </fieldset>

      <div class="dates">
        <label class="field">
          <span>Taken from</span>
          <input v-model="from" type="date" class="input" :max="to || undefined">
        </label>
        <label class="field">
          <span>Taken until</span>
          <input v-model="to" type="date" class="input" :min="from || undefined">
        </label>
      </div>
      <button v-if="from || to" type="button" class="link" @click="clearDates">Clear dates</button>

      <p v-if="formError" class="error" role="alert">{{ formError }}</p>

      <div class="buttons">
        <button type="button" class="btn" :disabled="saving" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : 'Apply' }}</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ReviewScope, ScopeOrder } from '~/types/api'
import { dateInputToIso, formatCount, inclusiveEndToIso, isoToDateInput, orderLabel } from '~/utils/format'
import BottomSheet from './BottomSheet.vue'

const props = defineProps<{
  open: boolean
  scope: ReviewScope
  /** Persists the scope; rejects with an error whose message is shown. */
  save: (scope: ReviewScope) => Promise<void>
}>()

const emit = defineEmits<{ close: [] }>()

const ORDERS: ScopeOrder[] = ['random', 'oldest', 'newest']

const { albums, loading: albumsLoading, error: albumsError, load: loadAlbums } = useAlbums()

const source = ref<'library' | 'album'>('library')
const albumId = ref<string | null>(null)
const order = ref<ScopeOrder>('random')
const from = ref('')
const to = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

function syncFromScope() {
  source.value = props.scope.albumId ? 'album' : 'library'
  albumId.value = props.scope.albumId
  order.value = props.scope.order
  from.value = isoToDateInput(props.scope.takenAfter)
  // takenBefore is exclusive; the form shows the inclusive last day.
  to.value = isoToDateInput(props.scope.takenBefore, -1)
  formError.value = null
}

watch(() => props.open, (open) => {
  if (!open) return
  syncFromScope()
  void loadAlbums()
}, { immediate: true })

function clearDates() {
  from.value = ''
  to.value = ''
}

async function submit() {
  formError.value = null
  if (source.value === 'album' && !albumId.value) {
    formError.value = 'Choose an album'
    return
  }
  if (from.value && to.value && from.value > to.value) {
    formError.value = '"Taken from" must be on or before "Taken until"'
    return
  }
  const next: ReviewScope = {
    albumId: source.value === 'album' ? albumId.value : null,
    order: order.value,
    takenAfter: from.value ? dateInputToIso(from.value) : null,
    takenBefore: to.value ? inclusiveEndToIso(to.value) : null,
  }
  saving.value = true
  try {
    await props.save(next)
    emit('close')
  }
  catch (e) {
    formError.value = toApiError(e).message
  }
  finally {
    saving.value = false
  }
}
</script>

<style scoped>
.scope-form {
  display: grid;
  gap: 16px;
}
.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 4px;
  border: none;
  border-radius: 12px;
  background: var(--surface-2);
}
.segmented legend {
  float: left;
  width: 100%;
  margin-bottom: 6px;
  padding: 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.segmented label {
  flex: 1 1 0;
  display: grid;
  place-items: center;
  min-height: 44px;
  padding: 0 8px;
  border-radius: 9px;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}
.segmented label.on {
  background: var(--surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
.segmented label:has(input:focus-visible) {
  outline: 2px solid var(--focus);
}
.dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.dates .input {
  min-width: 0;
  -webkit-appearance: none;
  appearance: none;
}
.link {
  justify-self: start;
  min-height: 44px;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
}
.error {
  margin: 0;
  color: var(--trash);
  font-size: 14px;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
