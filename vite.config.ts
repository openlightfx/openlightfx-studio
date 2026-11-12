import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  plugins: [svelte()],
  // Production assets are relative so the SPA works under any sub-path,
  // including /emby/OpenLightFX/studio/. Dev stays at '/'.
  base: command === 'build' ? './' : '/',
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  },
  assetsInclude: ['**/*.proto'],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
}));
