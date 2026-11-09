<template>
  <div class="app-root">
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <ToastHost />
  </div>
</template>

<script setup lang="ts">
useHead({
  title: 'Immich Tinder',
  htmlAttrs: { lang: 'en' },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#f6f7f9', media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: '#0b0d10', media: '(prefers-color-scheme: dark)' },
    { name: 'color-scheme', content: 'light dark' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-title', content: 'Immich Tinder' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    { name: 'application-name', content: 'Immich Tinder' },
    { name: 'format-detection', content: 'telephone=no' },
  ],
  link: [
    { rel: 'apple-touch-icon', href: '/favicon.png' },
    { rel: 'manifest', href: '/manifest.webmanifest' },
  ],
})
</script>

<style>
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-2: #eef0f3;
  --text: #111827;
  --muted: #6b7280;
  --border: #e5e7eb;
  --card-bg: #111111;
  --keep: #10b981;
  --trash: #ef4444;
  --fav: #f5b301;
  --accent: #4250af; /* Immich-ish indigo */
  --focus: #6366f1;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0d10;
    --surface: #171a1f;
    --surface-2: #22262d;
    --text: #f3f4f6;
    --muted: #9ca3af;
    --border: #2d323a;
    --card-bg: #000000;
    --accent: #8b9cf7;
  }
}

html, body, #__nuxt, .app-root {
  height: 100%;
}
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden; /* no page-level scrollbars */
  overscroll-behavior: none; /* no rubber band / pull-to-refresh */
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
*, *::before, *::after {
  box-sizing: border-box;
}
/* 16px minimum stops iOS Safari zooming on focus. */
input, select, textarea, button {
  font: inherit;
}
input, select, textarea {
  font-size: 16px;
}
:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Shared buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}
.btn.danger {
  background: var(--trash);
  border-color: transparent;
  color: #fff;
}
.btn.block {
  width: 100%;
}
.icon-btn {
  display: inline-grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--surface-2);
}
.field {
  display: grid;
  gap: 6px;
}
.field > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
