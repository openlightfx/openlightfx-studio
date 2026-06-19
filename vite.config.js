import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/** @returns {import('vite').Plugin} Vite plugin that sets COOP/COEP on every response. */
function crossOriginIsolation() {
  /** @param {import('vite').ViteDevServer | import('vite').PreviewServer} server */
  const addHeaders = (server) => {
    server.middlewares.use(/** @param {any} _req */ (_req, /** @param {any} res */ res, /** @param {any} next */ next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      next();
    });
  };
  return {
    name: 'cross-origin-isolation',
    configureServer: addHeaders,
    configurePreviewServer: addHeaders,
  };
}

export default defineConfig({
  plugins: [sveltekit(), crossOriginIsolation()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  assetsInclude: ['**/*.proto'],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core-mt'],
  },
});
