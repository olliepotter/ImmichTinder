<template>
  <div class="photo-view">
    <img
      :src="imageUrl(item.id)"
      :alt="item.fileName ?? 'Photo'"
      class="photo"
      draggable="false"
      decoding="async"
      @load="onLoad"
      @error="failed = true"
    >
    <p v-if="failed" class="failed">Could not load this photo</p>
    <div v-if="taken || place" class="meta">
      <div v-if="taken" class="time">{{ taken }}</div>
      <div v-if="place" class="place">{{ place }}</div>
    </div>
    <span v-if="item.isFavorite" class="already-fav" title="Already a favourite in Immich">
      <AppIcon name="star" :size="18" filled />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { QueueItem } from '~/types/api'
import { imageUrl } from '~/types/api'
import { formatTakenAt, locationWithFlag } from '~/utils/format'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ item: QueueItem }>()
const emit = defineEmits<{ size: [width: number, height: number] }>()

const failed = ref(false)
watch(() => props.item.id, () => {
  failed.value = false
})

const taken = computed(() => formatTakenAt(props.item.takenAt))
const place = computed(() => locationWithFlag(props.item.location))

function onLoad(e: Event) {
  const img = e.target
  if (img instanceof HTMLImageElement && img.naturalWidth && img.naturalHeight) {
    emit('size', img.naturalWidth, img.naturalHeight)
  }
}
</script>

<style scoped>
.photo-view {
  position: relative;
  width: 100%;
  height: 100%;
}
.photo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
.failed {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: #9ca3af;
  font-size: 14px;
}
.meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28px 14px 12px;
  color: #fff;
  font-size: 14px;
  line-height: 1.35;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.45) 40%, rgba(0, 0, 0, 0.7) 100%);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
.time { font-weight: 700; }
.place { opacity: 0.95; }
.already-fav {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: var(--fav);
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
</style>
