<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <button
        v-for="t in toasts"
        :key="t.id"
        type="button"
        class="toast"
        :class="t.kind"
        :role="t.kind === 'error' ? 'alert' : 'status'"
        @click="dismiss(t.id)"
      >
        {{ t.message }}
      </button>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
const { toasts, dismiss } = useToast()
</script>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  top: calc(env(safe-area-inset-top) + 12px);
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(calc(100% - 24px), 480px);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  min-height: 44px;
  max-width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 12px;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  color: #fff;
  background: #1f2937;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}
.toast.error {
  background: #b91c1c;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
