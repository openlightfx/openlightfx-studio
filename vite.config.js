import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true,
    port: 5173,
    headers: {
      // Required for ffmpeg.wasm multi-threaded mode (SharedArrayBuffer)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Allow importing .proto files as raw text
  assetsInclude: ['**/*.proto'],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg'],
  },
});
