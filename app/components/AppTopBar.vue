<template>
  <header class="top-bar">
    <img class="logo" src="/logo.png" alt="Immich Tinder" draggable="false">
    <button type="button" class="scope" :title="`Scope: ${summary}`" @click="emit('scope')">
      <span class="scope-label">{{ summary }}</span>
    </button>
    <button type="button" class="icon-btn help" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)" @click="emit('help')">
      <AppIcon name="help" />
    </button>
    <button type="button" class="icon-btn" aria-label="Settings" title="Settings" @click="emit('settings')">
      <AppIcon name="settings" />
    </button>
  </header>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{ summary: string }>()
const emit = defineEmits<{ scope: [], help: [], settings: [] }>()
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 2px 14px;
}
.logo {
  flex: none;
  height: 34px;
  width: auto;
}
.scope {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.scope-label {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* The shortcuts button only makes sense with a keyboard / pointer. */
@media (hover: none) {
  .help { display: none; }
}
@media (max-width: 380px) {
  .logo { height: 28px; }
}
</style>
