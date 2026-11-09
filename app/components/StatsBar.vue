<template>
  <div class="stats" :aria-label="`${percentText} reviewed`">
    <div
      class="progress"
      role="progressbar"
      :aria-valuenow="stats.percent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="`${percentText} reviewed`"
    >
      <span class="bar kept" :style="{ width: share(stats.kept) }" />
      <span class="bar favourited" :style="{ width: share(stats.favourited) }" />
      <span class="bar trashed" :style="{ width: share(stats.trashed) }" />
    </div>
    <dl class="counts">
      <div class="count kept">
        <dt>Kept</dt><dd>{{ formatCount(stats.kept) }}</dd>
      </div>
      <div class="count trashed">
        <dt>Trashed</dt><dd>{{ formatCount(stats.trashed) }}</dd>
      </div>
      <div class="count favourited">
        <dt>Fav</dt><dd>{{ formatCount(stats.favourited) }}</dd>
      </div>
      <div class="count remaining">
        <dt>Left</dt><dd>{{ formatCount(stats.remaining) }}</dd>
      </div>
      <div class="count percent">
        <dt class="sr-only">Done</dt><dd>{{ percentText }}</dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Stats } from '~/types/api'
import { formatCount } from '~/utils/format'

const props = defineProps<{ stats: Stats }>()

const percentText = computed(() => `${props.stats.percent.toFixed(1)}%`)

/** Width of one segment, as a share of the eligible total. */
function share(n: number) {
  const total = props.stats.total
  return total > 0 ? `${Math.min(100, (n / total) * 100)}%` : '0%'
}
</script>

<style scoped>
.stats {
  display: grid;
  gap: 6px;
  padding: 4px 16px 6px;
}
.progress {
  display: flex;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-2);
}
.bar {
  height: 100%;
  transition: width 300ms ease;
}
.bar.kept { background: var(--keep); }
.bar.favourited { background: var(--fav); }
.bar.trashed { background: var(--trash); }
.counts {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.count {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.count dt {
  color: var(--muted);
}
.count dd {
  margin: 0;
  font-weight: 700;
}
.count.kept dd { color: var(--keep); }
.count.trashed dd { color: var(--trash); }
.count.favourited dd { color: var(--fav); }
.count.percent dd { color: var(--text); }
@media (max-width: 360px) {
  .counts { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .bar { transition: none; }
}
</style>
