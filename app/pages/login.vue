<template>
  <div class="login-page">
    <form class="login" @submit.prevent="submit">
      <img class="logo" src="/logo.png" alt="Immich Tinder" draggable="false">
      <h1>Sign in</h1>
      <!-- Hidden username helps password managers (incl. iCloud Keychain) store the entry. -->
      <input class="sr-only" type="text" name="username" autocomplete="username" value="immich-tinder" tabindex="-1" aria-hidden="true" readonly>
      <label class="field">
        <span>Password</span>
        <input
          ref="passwordInput"
          v-model="password"
          class="input"
          type="password"
          name="password"
          autocomplete="current-password"
          required
          :disabled="submitting"
        >
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn primary block" :disabled="submitting || !password">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'

useHead({ title: 'Sign in · Immich Tinder' })

const api = useApi()
const route = useRoute()
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)
const passwordInput = useTemplateRef('passwordInput')

async function submit() {
  if (!password.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    await api.login(password.value)
    await navigateTo(safeRedirect(route.query.redirect), { replace: true })
  }
  catch (e) {
    const apiError = toApiError(e)
    error.value = apiError.status === 401 ? 'Wrong password' : apiError.message
    password.value = ''
  }
  finally {
    submitting.value = false
  }
}

onMounted(() => {
  // Desktop: focus straight away. On touch devices this would pop the keyboard over the logo, so skip.
  if (window.matchMedia?.('(hover: hover)').matches) passwordInput.value?.focus()
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  height: 100dvh;
  display: grid;
  place-items: center;
  padding: calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px);
  overflow-y: auto;
}
.login {
  display: grid;
  gap: 16px;
  width: min(100%, 360px);
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}
.logo {
  justify-self: center;
  height: 56px;
  width: auto;
}
h1 {
  margin: 0;
  font-size: 20px;
  text-align: center;
}
.error {
  margin: 0;
  color: var(--trash);
  font-size: 14px;
}
</style>
