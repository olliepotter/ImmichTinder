<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-backdrop" :class="{ centred }" @click.self="emit('close')">
        <section
          ref="panel"
          class="sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <header class="sheet-head">
            <h2>{{ title }}</h2>
            <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')">
              <AppIcon name="close" />
            </button>
          </header>
          <div class="sheet-body">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** Centred dialog on wide screens instead of a bottom sheet. */
  centred?: boolean
}>(), { centred: false })

const emit = defineEmits<{ close: [] }>()

const panel = useTemplateRef('panel')

watch(() => props.open, async (open) => {
  if (!open) return
  await nextTick()
  panel.value?.focus({ preventScroll: true })
})
</script>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  overscroll-behavior: contain;
}
.sheet {
  width: min(100%, 560px);
  max-height: min(85dvh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.35);
  padding-bottom: env(safe-area-inset-bottom);
  outline: none;
}
@media (min-width: 720px) and (min-height: 560px) {
  .sheet-backdrop.centred {
    align-items: center;
  }
  .centred .sheet {
    border-radius: 18px;
    padding-bottom: 0;
  }
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 8px 4px 20px;
}
.sheet-head h2 {
  margin: 0;
  font-size: 18px;
}
.sheet-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 4px 20px 20px;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 200ms ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 240ms cubic-bezier(.2, .8, .2, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(40px);
}
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active .sheet,
  .sheet-leave-active .sheet {
    transition: none;
  }
}
</style>
