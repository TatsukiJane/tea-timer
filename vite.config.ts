import { fileURLToPath, URL } from 'node:url'
// vitest/config re-exports Vite's defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed to GitHub Pages as a project site, so everything lives under /tea-timer/.
// Anything that needs the base path written out by hand (service worker
// navigateFallback) is kept next to this constant so the two can never drift apart.
export const BASE = '/tea-timer/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate' — which is not the same thing as asking the user.
      // Updates are applied automatically; 'prompt' only means the app decides *when*,
      // because 'autoUpdate' reloads the moment a new worker is ready and would kill a
      // running infusion or an unsaved edit. See components/pwa/AutoUpdate.tsx.
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: BASE,
        start_url: BASE,
        scope: BASE,
        name: 'Чайный таймер',
        short_name: 'Чай',
        description: 'Таймер для заваривания чая проливами: свои времена для каждого чая.',
        lang: 'ru',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#18181b',
        theme_color: '#18181b',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The base path is NOT injected here by the plugin, so it is spelled out.
        // A mismatch is the classic "works locally, white screen on Pages" failure;
        // e2e/smoke.mjs asserts the built sw.js carries the prefix.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Intentionally empty, and load-bearing. Everything the app needs is
        // precached; the only network traffic is api.github.com. Caching that would
        // (a) feed stale updatedAt/sha values into conflict detection and corrupt
        // data, and (b) risk writing a request bearing the PAT into Cache Storage.
        // Never add a rule that could match api.github.com.
        runtimeCaching: [],
      },
      devOptions: {
        // Only worth enabling while actually debugging the service worker; otherwise
        // it makes `npm run dev` cache aggressively and confuse iteration.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // Off by default: sourcemaps triple the size of the Pages deploy and the
    // Tailwind plugin can't produce one for its CSS anyway. Use
    // `vite build --sourcemap` when actually debugging a production bundle.
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
