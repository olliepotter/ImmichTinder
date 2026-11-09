<template>
  <BottomSheet :open="open" title="Photo details" @close="emit('close')">
    <dl v-if="item" class="details">
      <div><dt>Taken</dt><dd>{{ taken || 'Unknown' }}</dd></div>
      <div><dt>Location</dt><dd>{{ place || 'Unknown' }}</dd></div>
      <div v-if="coords"><dt>Coordinates</dt><dd>{{ coords }}</dd></div>
      <div><dt>Camera</dt><dd>{{ item.camera || 'Unknown' }}</dd></div>
      <div><dt>File</dt><dd class="file">{{ item.fileName || 'Unknown' }}</dd></div>
      <div v-if="item.width && item.height"><dt>Size</dt><dd>{{ item.width }} × {{ item.height }}</dd></div>
      <div v-if="item.isFavorite"><dt>Immich</dt><dd>Already a favourite</dd></div>
    </dl>
    <div class="buttons">
      <a v-if="immichLink" class="btn" :href="immichLink" target="_blank" rel="noopener noreferrer">
        <AppIcon name="external" :size="18" /> Open in Immich
      </a>
      <button type="button" class="btn" :disabled="!item || disabled" @click="emit('skip')">
        <AppIcon name="skip" :size="18" /> Skip
      </button>
      <button type="button" class="btn primary" @click="emit('close')">Close</button>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { QueueItem } from '~/types/api'
import { formatTakenAt, immichPhotoUrl, locationWithFlag } from '~/utils/format'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'

const props = withDefaults(defineProps<{
  open: boolean
  item: QueueItem | null
  immichWebUrl?: string
  disabled?: boolean
}>(), { immichWebUrl: '', disabled: false })

const emit = defineEmits<{ close: [], skip: [] }>()

const taken = computed(() => formatTakenAt(props.item?.takenAt ?? null, 'long'))
const place = computed(() => locationWithFlag(props.item?.location ?? null))
const coords = computed(() => {
  const loc = props.item?.location
  if (!loc || loc.latitude === null || loc.longitude === null) return ''
  return `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
})
const immichLink = computed(() => (props.item ? immichPhotoUrl(props.immichWebUrl, props.item.id) : ''))
</script>

<style scoped>
.details {
  display: grid;
  gap: 10px;
  margin: 0 0 16px;
}
.details > div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 12px;
}
.details dt {
  color: var(--muted);
  font-size: 14px;
}
.details dd {
  margin: 0;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.buttons > * {
  flex: 1 1 auto;
}
</style>
