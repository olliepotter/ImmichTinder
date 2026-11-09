<template>
  <BottomSheet :open="open" title="Settings" centred @close="emit('close')">
    <div class="settings">
      <section>
        <h3>Scope</h3>
        <p class="muted">{{ scopeSummary }}</p>
        <button type="button" class="btn block" @click="emit('change-scope')">Change scope</button>
      </section>

      <section>
        <h3>Keyboard</h3>
        <button type="button" class="btn block" @click="emit('shortcuts')">
          <AppIcon name="help" :size="18" /> Show shortcuts
        </button>
      </section>

      <section class="danger-zone">
        <h3>Reset review history</h3>
        <p class="muted">
          Forgets which photos you have kept, trashed or favourited here, so they can be reviewed again.
          <strong>This does not touch Immich:</strong> trashed photos stay in the Immich trash and favourites stay favourites.
        </p>
        <form class="reset" @submit.prevent="submitReset">
          <label class="field">
            <span>Type RESET to confirm</span>
            <input
              v-model="confirmText"
              class="input"
              autocomplete="off"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              placeholder="RESET"
            >
          </label>
          <button type="submit" class="btn danger block" :disabled="confirmText !== 'RESET' || resetting">
            {{ resetting ? 'Resetting…' : 'Reset history' }}
          </button>
        </form>
        <p v-if="resetMessage" class="result" role="status">{{ resetMessage }}</p>
        <p v-if="resetError" class="error" role="alert">{{ resetError }}</p>
      </section>

      <section>
        <button type="button" class="btn block" :disabled="loggingOut" @click="logout">
          <AppIcon name="logout" :size="18" /> {{ loggingOut ? 'Signing out…' : 'Sign out' }}
        </button>
      </section>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'

const props = defineProps<{
  open: boolean
  scopeSummary: string
  /** Resets review history; resolves with the number of rows deleted. */
  reset: () => Promise<number>
}>()

const emit = defineEmits<{
  'close': []
  'change-scope': []
  'shortcuts': []
}>()

const api = useApi()
const confirmText = ref('')
const resetting = ref(false)
const resetMessage = ref<string | null>(null)
const resetError = ref<string | null>(null)
const loggingOut = ref(false)

watch(() => props.open, (open) => {
  if (!open) return
  confirmText.value = ''
  resetMessage.value = null
  resetError.value = null
})

async function submitReset() {
  if (confirmText.value !== 'RESET' || resetting.value) return
  resetting.value = true
  resetMessage.value = null
  resetError.value = null
  try {
    const deleted = await props.reset()
    resetMessage.value = `Cleared ${deleted} review${deleted === 1 ? '' : 's'}. Immich was not changed.`
    confirmText.value = ''
  }
  catch (e) {
    resetError.value = toApiError(e).message
  }
  finally {
    resetting.value = false
  }
}

async function logout() {
  loggingOut.value = true
  try {
    await api.logout()
  }
  catch {
    // Go to the login page regardless; the session may already be gone.
  }
  finally {
    loggingOut.value = false
  }
  await navigateTo('/login', { replace: true })
}
</script>

<style scoped>
.settings {
  display: grid;
  gap: 22px;
}
section {
  display: grid;
  gap: 10px;
}
h3 {
  margin: 0;
  font-size: 15px;
}
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.45;
}
.muted strong {
  color: var(--text);
}
.danger-zone {
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--trash) 40%, transparent);
  border-radius: 14px;
}
.reset {
  display: grid;
  gap: 10px;
}
.result {
  margin: 0;
  color: var(--keep);
  font-size: 14px;
}
.error {
  margin: 0;
  color: var(--trash);
  font-size: 14px;
}
</style>
