import { fileURLToPath, URL } from 'node:url'
// vitest/config re-exports Vite's defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed to GitHub Pages as a project site, so everything lives under /tea-timer/.
// Anything that needs the base path written out by hand (service worker navigateFallback)
// is kept next to this constant so the two can never drift apart.
export const BASE = '/tea-timer/'

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
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
