import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { studioPrefixMiddleware } from './scripts/studio-prefix.mjs';

export default defineConfig({
  plugins: [
    sveltekit(),
    {
      name: 'studio-host-prefix',
      configureServer(server) {
        server.middlewares.use(studioPrefixMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(studioPrefixMiddleware);
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
  },
  // Allow importing .proto files as raw text
  assetsInclude: ['**/*.proto'],
});
