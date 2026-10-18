import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  // ── M0-09 · Tests con Vitest ────────────────────────────────────────
  test: {
    // `src/core` es dominio puro: sus tests corren en Node, rápido y sin DOM.
    // Los que necesiten navegador se marcan con `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
})
