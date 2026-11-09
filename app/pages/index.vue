<template>
  <div class="page">
    <AppTopBar :summary="summary" @scope="scopeOpen = true" @help="helpOpen = true" @settings="settingsOpen = true" />
    <StatsBar :stats="queue.stats.value" />

    <main class="card-area">
      <div v-if="showSkeleton" class="skeleton" aria-busy="true" aria-label="Loading photos" />

      <div v-else-if="queue.loadError.value && !current" class="state" role="alert">
        <h2>Could not load photos</h2>
        <p>{{ queue.loadError.value }}</p>
        <button type="button" class="btn primary" @click="queue.retry()">Retry</button>
      </div>

      <div v-else-if="queue.exhausted.value" class="state">
        <h2>All done for this scope</h2>
        <p>
          {{ queue.stats.value.reviewed }} reviewed:
          {{ queue.stats.value.kept }} kept, {{ queue.stats.value.favourited }} favourited,
          {{ queue.stats.value.trashed }} trashed.
          <template v-if="queue.skipped.value.size">
            {{ queue.skipped.value.size }} skipped this session.
          </template>
        </p>
        <button type="button" class="btn primary" @click="scopeOpen = true">Change scope</button>
      </div>

      <SwipeCard
        v-else-if="current"
        ref="card"
        class="card"
        :style="{ '--ratio': ratio }"
        :item-key="current.id"
        :disabled="queue.pending.value || anyOverlayOpen"
        @swipe="onSwipe"
        @details="detailsOpen = true"
      >
        <PhotoView :item="current" @size="onSize" />
      </SwipeCard>
    </main>

    <ActionBar
      :disabled="queue.pending.value || queue.loading.value"
      :has-item="!!current"
      @undo="undo"
      @trash="act('trash')"
      @skip="skip"
      @favourite="act('favourite')"
      @keep="act('keep')"
    />

    <DetailsSheet
      :open="detailsOpen"
      :item="current"
      :immich-web-url="immichWebUrl"
      :disabled="queue.pending.value"
      @close="detailsOpen = false"
      @skip="skipFromDetails"
    />
    <ScopePicker :open="scopeOpen" :scope="queue.scope.value" :save="queue.setScope" @close="scopeOpen = false" />
    <SettingsSheet
      :open="settingsOpen"
      :scope-summary="summary"
      :reset="queue.resetHistory"
      @close="settingsOpen = false"
      @change-scope="openScopeFromSettings"
      @shortcuts="openHelpFromSettings"
    />
    <ShortcutsOverlay :open="helpOpen" @close="helpOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import ActionBar from '~/components/ActionBar.vue'
import AppTopBar from '~/components/AppTopBar.vue'
import DetailsSheet from '~/components/DetailsSheet.vue'
import PhotoView from '~/components/PhotoView.vue'
import ScopePicker from '~/components/ScopePicker.vue'
import SettingsSheet from '~/components/SettingsSheet.vue'
import ShortcutsOverlay from '~/components/ShortcutsOverlay.vue'
import StatsBar from '~/components/StatsBar.vue'
import SwipeCard from '~/components/SwipeCard.vue'
import type { Decision } from '~/types/api'
import { scopeSummary } from '~/utils/format'
import { isTypingTarget, keyToAction } from '~/utils/keyboard'

const toast = useToast()
const queue = useReviewQueue({ api: useApi(), onError: toast.error, onInfo: toast.info })
const { load: loadAlbums, nameOf } = useAlbums()
const immichWebUrl = useRuntimeConfig().public.immichWebUrl

const card = useTemplateRef('card')
const current = queue.current

const detailsOpen = ref(false)
const scopeOpen = ref(false)
const settingsOpen = ref(false)
const helpOpen = ref(false)
const anyOverlayOpen = computed(() => detailsOpen.value || scopeOpen.value || settingsOpen.value || helpOpen.value)

/** False until the first load has finished (avoids flashing an empty state). */
const started = ref(false)
const showSkeleton = computed(() =>
  !current.value && !queue.loadError.value && !queue.exhausted.value && (queue.loading.value || queue.refilling.value || !started.value),
)

const summary = computed(() => scopeSummary(queue.scope.value, nameOf(queue.scope.value.albumId)))

// Card aspect ratio: real image size once loaded, else Immich's dimensions, else 3:4.
const natural = ref<{ id: string, ratio: number } | null>(null)
const ratio = computed(() => {
  const item = current.value
  if (!item) return 0.75
  if (natural.value?.id === item.id) return natural.value.ratio
  if (item.width && item.height) return item.width / item.height
  return 0.75
})
function onSize(width: number, height: number) {
  if (current.value) natural.value = { id: current.value.id, ratio: width / height }
}

const EXIT_DIR = { trash: 'left', keep: 'right', favourite: 'up' } as const
const SWIPE_DECISION = { left: 'trash', right: 'keep', up: 'favourite' } as const

/** Sends a decision; the card leaves only once the server has confirmed it. */
async function act(decision: Decision, fromSwipe = false) {
  if (!fromSwipe) {
    if (queue.pending.value || !current.value) return
    card.value?.nudge(EXIT_DIR[decision])
  }
  const outcome = await queue.decide(decision, () => card.value?.exit(EXIT_DIR[decision]))
  if (outcome === 'failed' || outcome === 'ignored') void card.value?.springBack()
}

function onSwipe(dir: 'left' | 'right' | 'up') {
  void act(SWIPE_DECISION[dir], true)
}

async function skip() {
  await queue.skip(() => card.value?.exit('down'))
}

function skipFromDetails() {
  detailsOpen.value = false
  void skip()
}

function undo() {
  void queue.undo()
}

function openScopeFromSettings() {
  settingsOpen.value = false
  scopeOpen.value = true
}
function openHelpFromSettings() {
  settingsOpen.value = false
  helpOpen.value = true
}

function closeTopOverlay() {
  if (helpOpen.value) helpOpen.value = false
  else if (scopeOpen.value) scopeOpen.value = false
  else if (settingsOpen.value) settingsOpen.value = false
  else if (detailsOpen.value) detailsOpen.value = false
  else return false
  return true
}

function onKeydown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) {
    // Escape still closes a panel from inside its inputs.
    if (e.key === 'Escape' && closeTopOverlay()) e.preventDefault()
    return
  }
  const action = keyToAction(e)
  if (!action) return
  if (action === 'close') {
    if (closeTopOverlay()) e.preventDefault()
    return
  }
  if (action === 'help') {
    e.preventDefault()
    helpOpen.value = !helpOpen.value
    return
  }
  if (action === 'details' && detailsOpen.value) {
    e.preventDefault()
    detailsOpen.value = false
    return
  }
  // Review actions only apply to the card, not while a panel is open.
  if (anyOverlayOpen.value) return
  e.preventDefault()
  if (e.repeat) return
  switch (action) {
    case 'trash':
    case 'keep':
    case 'favourite':
      void act(action)
      break
    case 'details':
      if (current.value) detailsOpen.value = true
      break
    case 'skip':
      void skip()
      break
    case 'undo':
      undo()
      break
  }
}

// The details sheet has nothing to show once the queue runs dry.
watch(current, (item) => {
  if (!item) detailsOpen.value = false
})

watch(() => queue.scope.value.albumId, (id) => {
  if (id) void loadAlbums()
})

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await queue.init()
  started.value = true
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.page {
  height: 100vh;
  height: 100dvh;
  max-width: 960px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
.card-area {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 6px 14px;
  container-type: size;
  overflow: hidden;
}
.card {
  --ratio: 0.75;
  width: min(100cqw, 100cqh * var(--ratio));
  aspect-ratio: var(--ratio);
  max-height: 100cqh;
  background: var(--card-bg);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.skeleton {
  width: min(100cqw, 100cqh * 0.75);
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  background: linear-gradient(100deg, var(--surface-2) 40%, var(--surface) 50%, var(--surface-2) 60%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
@keyframes shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}
.state {
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 420px;
  padding: 24px;
  text-align: center;
}
.state h2 {
  margin: 0;
  font-size: 20px;
}
.state p {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
}
</style>
