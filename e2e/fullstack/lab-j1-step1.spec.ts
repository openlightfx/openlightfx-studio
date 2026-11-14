import { test } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (browser !== 'chromium' && browser !== 'firefox') throw new Error('Invalid OLFX_LAB_BROWSER');
test.use({ browserName: browser });

// Order matters: discover the isolated fixture first, then Identify it, then
// exercise room CRUD with the discovered identities. No mocks or seed metadata
// stand in for the Find bulbs assertions.
for (const file of [
  'lab-j1-discovery.spec.ts',
  'lab-j1-identify.spec.ts',
  'lab-j1-rooms.spec.ts',
]) {
  await import(pathToFileURL(`${process.cwd()}/e2e/fullstack/${file}`).href);
}
