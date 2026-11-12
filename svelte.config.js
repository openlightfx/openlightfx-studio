import fs from 'node:fs';
import path from 'node:path';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { relativizeSpaHtml } from './scripts/relativize-html.mjs';

const pages = 'build';
const fallback = 'index.html';
const staticAdapter = adapter({ pages, fallback });

/** paths.relative is the default, but the SPA fallback still emits /_app from the site root. */
function relativeStaticAdapter() {
  return {
    name: 'adapter-static-relative',
    async adapt(builder) {
      await staticAdapter.adapt(builder);
      const file = path.join(pages, fallback);
      fs.writeFileSync(file, relativizeSpaHtml(fs.readFileSync(file, 'utf8')));
    },
  };
}

export default {
  preprocess: vitePreprocess(),
  kit: {
    paths: {
      relative: true,
    },
    adapter: relativeStaticAdapter(),
  },
};
