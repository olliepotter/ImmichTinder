<template>
  <nav class="actions" aria-label="Review actions">
    <button type="button" class="action small undo" :disabled="disabled || !canUndo" aria-label="Undo (U)" title="Undo (U)" @click="emit('undo')">
      <AppIcon name="undo" />
    </button>
    <button type="button" class="action large trash" :disabled="disabled || !hasItem" aria-label="Trash (←)" title="Trash (←)" @click="emit('trash')">
      <AppIcon name="trash" :size="30" />
    </button>
    <button type="button" class="action small skip" :disabled="disabled || !hasItem" aria-label="Skip (S)" title="Skip (S)" @click="emit('skip')">
      <AppIcon name="skip" />
    </button>
    <button type="button" class="action medium favourite" :disabled="disabled || !hasItem" aria-label="Favourite (↑)" title="Favourite (↑)" @click="emit('favourite')">
      <AppIcon name="star" :size="28" filled />
    </button>
    <button type="button" class="action large keep" :disabled="disabled || !hasItem" aria-label="Keep (→)" title="Keep (→)" @click="emit('keep')">
      <AppIcon name="check" :size="32" :stroke-width="2.6" />
    </button>
  </nav>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{
  disabled?: boolean
  hasItem?: boolean
  canUndo?: boolean
}>(), { disabled: false, hasItem: true, canUndo: true })

const emit = defineEmits<{
  undo: []
  trash: []
  skip: []
  favourite: []
  keep: []
}>()
</script>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 3vw keeps all five buttons (290px) on screen down to 320px-wide phones. */
  gap: clamp(6px, 3vw, 22px);
  padding: 10px 12px 14px;
}
.action {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: transform 120ms ease, opacity 120ms ease;
  touch-action: manipulation;
}
.action:active:not(:disabled) {
  transform: scale(0.92);
}
.action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.small { width: 48px; height: 48px; }
.medium { width: 58px; height: 58px; }
.large { width: 68px; height: 68px; }
.undo, .skip { color: var(--muted); }
.trash { color: var(--trash); }
.favourite { color: var(--fav); }
.keep { color: var(--keep); }
@media (hover: hover) {
  .action:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .action { transition: none; }
}
</style>
