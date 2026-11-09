<template>
  <div
    ref="card"
    class="swipe-card"
    :class="[`phase-${phase}`, hint ? `hint-${hint}` : null]"
    :style="cardStyle"
    role="group"
    aria-roledescription="swipeable photo"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onPointerCancel"
  >
    <slot />
    <div v-if="hint" class="tint" :class="`tint-${hint}`" :style="{ opacity: tintOpacity }" aria-hidden="true" />
    <div v-if="hint" class="stamp" :class="`stamp-${hint}`" :style="{ opacity: stampOpacity }" aria-hidden="true">
      {{ STAMP_LABELS[hint] }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { leaningDir, resolveSwipe } from '~/utils/swipe'
import type { SwipeDir } from '~/utils/swipe'

const props = withDefaults(defineProps<{
  /** Changes whenever a different photo is shown; resets the card. */
  itemKey?: string | null
  /** Ignore new drags (e.g. while a request is pending). */
  disabled?: boolean
}>(), { itemKey: null, disabled: false })

const emit = defineEmits<{
  /** Drag released past the threshold. The card holds until exit() or springBack(). */
  swipe: [dir: 'left' | 'right' | 'up']
  /** Drag released downwards: open the details sheet (card springs back). */
  details: []
}>()

const STAMP_LABELS: Record<SwipeDir, string> = {
  left: 'TRASH',
  right: 'KEEP',
  up: 'FAVOURITE',
  down: 'DETAILS',
}

type Phase = 'idle' | 'dragging' | 'holding' | 'exiting' | 'returning' | 'entering'

const EXIT_MS = 260
const RETURN_MS = 380
const MAX_ROTATION = 22

const card = ref<HTMLElement | null>(null)
const phase = ref<Phase>('idle')
const dx = ref(0)
const dy = ref(0)
const opacity = ref(1)
const scale = ref(1)
/** Hint forced by nudge()/exit(), overriding the drag direction. */
const forcedHint = ref<SwipeDir | null>(null)
const reducedMotion = ref(false)

let pointerId: number | null = null
let startX = 0
let startY = 0
let rotationSign = 1
let samples: { x: number, y: number, t: number }[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let motionQuery: MediaQueryList | null = null

function threshold() {
  const width = card.value?.getBoundingClientRect().width ?? 0
  return Math.max(80, Math.min(140, width * 0.28))
}

const hint = computed(() => forcedHint.value ?? leaningDir(dx.value, dy.value))

const progress = computed(() => {
  if (forcedHint.value) return 1
  const d = hint.value === 'left' || hint.value === 'right' ? Math.abs(dx.value) : Math.abs(dy.value)
  return Math.min(1, d / threshold())
})
const tintOpacity = computed(() => progress.value * 0.32)
const stampOpacity = computed(() => Math.min(1, progress.value * 1.3))

const cardStyle = computed(() => {
  const rotation = reducedMotion.value
    ? 0
    : Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, dx.value * 0.06 * rotationSign))
  let transition = 'none'
  if (phase.value === 'exiting') {
    transition = reducedMotion.value
      ? `opacity ${EXIT_MS / 2}ms linear`
      : `transform ${EXIT_MS}ms cubic-bezier(.4,0,1,1), opacity ${EXIT_MS}ms linear`
  }
  else if (phase.value === 'returning' || phase.value === 'holding') {
    transition = reducedMotion.value ? 'none' : `transform ${RETURN_MS}ms cubic-bezier(.18,1.3,.4,1)`
  }
  else if (phase.value === 'idle') {
    transition = reducedMotion.value ? 'opacity 120ms linear' : 'transform 200ms ease-out, opacity 200ms ease-out'
  }
  return {
    transform: `translate3d(${dx.value}px, ${dy.value}px, 0) rotate(${rotation}deg) scale(${scale.value})`,
    opacity: opacity.value,
    transition,
  }
})

function wait(ms: number) {
  if (timer) clearTimeout(timer)
  return new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timer = null
      resolve()
    }, ms)
  })
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled || pointerId !== null) return
  if (phase.value !== 'idle' && phase.value !== 'returning') return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  pointerId = e.pointerId
  try {
    card.value?.setPointerCapture(e.pointerId)
  }
  catch {
    // Capture is best-effort (unsupported in some test DOMs).
  }
  phase.value = 'dragging'
  forcedHint.value = null
  startX = e.clientX - dx.value
  startY = e.clientY - dy.value
  const rect = card.value?.getBoundingClientRect()
  // Grabbing the lower half tilts the other way, like holding a real card.
  rotationSign = rect && rect.height > 0 && e.clientY > rect.top + rect.height / 2 ? -1 : 1
  samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
}

function onPointerMove(e: PointerEvent) {
  if (phase.value !== 'dragging' || e.pointerId !== pointerId) return
  dx.value = e.clientX - startX
  dy.value = e.clientY - startY
  const t = performance.now()
  samples.push({ x: e.clientX, y: e.clientY, t })
  samples = samples.filter(s => t - s.t <= 100)
}

function releaseVelocity() {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!first || !last) return { vx: 0, vy: 0 }
  const dt = last.t - first.t
  if (dt < 16) return { vx: 0, vy: 0 }
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt }
}

function onPointerUp(e: PointerEvent) {
  if (phase.value !== 'dragging' || e.pointerId !== pointerId) return
  pointerId = null
  const { vx, vy } = releaseVelocity()
  const dir = resolveSwipe(dx.value, dy.value, vx, vy, threshold())
  if (dir === 'down') {
    void springBack()
    emit('details')
    return
  }
  if (dir) {
    // Hold the card where it was dropped until the parent confirms or rejects.
    phase.value = 'holding'
    forcedHint.value = dir
    emit('swipe', dir)
    return
  }
  void springBack()
}

function onPointerCancel(e: PointerEvent) {
  if (phase.value !== 'dragging' || e.pointerId !== pointerId) return
  pointerId = null
  void springBack()
}

/** Animates the card off-screen. Resolves when it has gone. */
async function exit(dir: SwipeDir) {
  pointerId = null
  forcedHint.value = dir === 'down' ? null : dir
  phase.value = 'exiting'
  if (reducedMotion.value) {
    opacity.value = 0
    await wait(EXIT_MS / 2)
    return
  }
  const w = typeof window === 'undefined' ? 1000 : window.innerWidth
  const h = typeof window === 'undefined' ? 1000 : window.innerHeight
  if (dir === 'left' || dir === 'right') {
    const sign = dir === 'right' ? 1 : -1
    dx.value = sign * (w + 200)
    dy.value = dy.value + 40
  }
  else {
    dy.value = dir === 'up' ? -(h + 200) : h + 200
  }
  opacity.value = 0.4
  await wait(EXIT_MS)
}

/** Returns the card to the centre (e.g. after a failed action). */
async function springBack() {
  pointerId = null
  forcedHint.value = null
  phase.value = 'returning'
  dx.value = 0
  dy.value = 0
  opacity.value = 1
  scale.value = 1
  await wait(reducedMotion.value ? 0 : RETURN_MS)
  if (phase.value === 'returning') phase.value = 'idle'
}

/** Leans the card towards a direction while a button/keyboard action is pending. */
function nudge(dir: 'left' | 'right' | 'up') {
  if (phase.value === 'dragging' || phase.value === 'exiting') return
  phase.value = 'holding'
  forcedHint.value = dir
  if (reducedMotion.value) return
  dx.value = dir === 'left' ? -36 : dir === 'right' ? 36 : 0
  dy.value = dir === 'up' ? -36 : 0
}

function enter() {
  if (timer) clearTimeout(timer)
  pointerId = null
  forcedHint.value = null
  phase.value = 'entering'
  dx.value = 0
  dy.value = 0
  opacity.value = 0
  scale.value = reducedMotion.value ? 1 : 0.94
  // Two frames so the reset is painted before transitioning back in.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (phase.value !== 'entering') return
    phase.value = 'idle'
    opacity.value = 1
    scale.value = 1
  }))
}

watch(() => props.itemKey, (next, prev) => {
  if (next !== prev) enter()
})

// iOS Safari: stop the page from scrolling / pull-to-refresh while dragging.
function blockTouchMove(e: TouchEvent) {
  if (phase.value === 'dragging' && e.cancelable) e.preventDefault()
}

function onMotionChange(e: MediaQueryListEvent) {
  reducedMotion.value = e.matches
}

onMounted(() => {
  card.value?.addEventListener('touchmove', blockTouchMove, { passive: false })
  if (typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = motionQuery.matches
    motionQuery.addEventListener?.('change', onMotionChange)
  }
})

onBeforeUnmount(() => {
  card.value?.removeEventListener('touchmove', blockTouchMove)
  motionQuery?.removeEventListener?.('change', onMotionChange)
  if (timer) clearTimeout(timer)
})

defineExpose({ exit, springBack, nudge })
</script>

<style scoped>
.swipe-card {
  position: relative;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  will-change: transform;
  cursor: grab;
}
.swipe-card.phase-dragging {
  cursor: grabbing;
}
.tint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
.tint-left { background: #ef4444; }
.tint-right { background: #10b981; }
.tint-up { background: #f5b301; }
.tint-down { background: #64748b; }

/* Bold rubber stamps, kept from the original design. */
.stamp {
  position: absolute;
  top: 12%;
  padding: 8px 14px;
  border-radius: 10px;
  font-weight: 800;
  font-size: clamp(22px, 6vw, 42px);
  letter-spacing: 2px;
  border: 4px solid currentColor;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  background: rgba(0, 0, 0, 0.12);
  pointer-events: none;
  z-index: 5;
}
/* Each stamp sits on the side that stays on screen while dragging. */
.stamp-right {
  left: 16px;
  color: #10b981;
  transform: rotate(-12deg);
}
.stamp-left {
  right: 16px;
  color: #ef4444;
  transform: rotate(12deg);
}
.stamp-up {
  top: auto;
  bottom: 18%;
  left: 50%;
  color: #f5b301;
  transform: translateX(-50%);
}
.stamp-down {
  left: 50%;
  color: #e2e8f0;
  font-size: clamp(16px, 4vw, 24px);
  transform: translateX(-50%);
}
</style>
