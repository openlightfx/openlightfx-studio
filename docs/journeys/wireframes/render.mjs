// Renders every wireframe in ./src to a 1280x800 PNG next to this script.
// Run from the repo root: node docs/journeys/wireframes/render.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'src');
const pages = fs
  .readdirSync(src)
  .filter((f) => /^\d\d-.*\.html$/.test(f))
  .sort();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const file of pages) {
  await page.goto('file://' + path.join(src, file));
  const out = path.join(here, file.replace(/\.html$/, '.png'));
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
