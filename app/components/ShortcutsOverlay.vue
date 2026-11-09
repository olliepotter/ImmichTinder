<template>
  <BottomSheet :open="open" title="Keyboard shortcuts" centred @close="emit('close')">
    <table class="shortcuts">
      <tbody>
        <tr v-for="s in SHORTCUTS" :key="s.label">
          <td class="keys">
            <kbd v-for="k in s.keys" :key="k">{{ k }}</kbd>
          </td>
          <td>{{ s.label }}</td>
        </tr>
      </tbody>
    </table>
    <p class="note">On touch screens: swipe left to trash, right to keep, up to favourite and down for details.</p>
  </BottomSheet>
</template>

<script setup lang="ts">
import { SHORTCUTS } from '~/utils/keyboard'
import BottomSheet from './BottomSheet.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<style scoped>
.shortcuts {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}
.shortcuts td {
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.keys {
  width: 50%;
}
kbd {
  display: inline-block;
  min-width: 28px;
  margin-right: 6px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--surface-2);
  font-family: inherit;
  font-size: 13px;
  text-align: center;
}
.note {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 14px;
}
</style>
