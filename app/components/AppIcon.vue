<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle v-if="name === 'help' || name === 'info'" cx="12" cy="12" r="10" />
    <polygon v-if="name === 'star'" :points="STAR" :fill="filled ? 'currentColor' : 'none'" />
    <path v-for="(d, i) in PATHS[name]" :key="i" :d="d" />
  </svg>
</template>

<script setup lang="ts">
export type IconName = 'undo' | 'trash' | 'skip' | 'star' | 'check' | 'settings' | 'help' | 'info' | 'close' | 'external' | 'logout'

withDefaults(defineProps<{
  name: IconName
  size?: number
  strokeWidth?: number
  filled?: boolean
}>(), { size: 24, strokeWidth: 2, filled: false })

const STAR = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'

const PATHS: Record<IconName, string[]> = {
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v5', 'M14 11v5'],
  skip: ['M5 4l10 8-10 8V4z', 'M19 5v14'],
  star: [],
  check: ['M20 6 9 17l-5-5'],
  settings: ['M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'],
  help: ['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  info: ['M12 16v-4', 'M12 8h.01'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
}
</script>

<style scoped>
.app-icon {
  display: block;
  flex: none;
}
</style>
