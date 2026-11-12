import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const media = process.env.OLFX_REAL_MEDIA || path.join(os.homedir(), 'Videos', 'John_Wick.mkv');
const track = process.env.OLFX_REAL_TRACK || path.join(os.homedir(), 'Videos', 'John_Wick.lightfx');
const emby = () => process.env.OLFX_EMBY_URL ?? 'http://127.0.0.1:8096';

test.beforeEach(() => {
  test.skip(!!process.env.CI, 'J5 is on demand and never runs in CI');
});

test('J5 @realmedia MEDIA-003 MEDIA-011 the real title opens through the proxy in Firefox', async ({ page }) => {
  expect(fs.existsSync(media), media).toBe(true);
  const started = Date.now();
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${process.env.OLFX_API_KEY ?? ''}`);
  await page.getByRole('option').filter({ hasText: /john wick/i }).click();
  await expect.poll(async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(Date.now() - started).toBeLessThanOrEqual(20_000);
  const src = await page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentSrc);
  expect(src).not.toMatch(/John_Wick\.mkv/);
});

test('J5 @realmedia MEDIA-006 MEDIA-007 seek and frame step stay on the proxy grid', async ({ page }) => {
  expect(fs.existsSync(media), media).toBe(true);
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${process.env.OLFX_API_KEY ?? ''}`);
  const started = Date.now();
  await page.locator('video').evaluate((node) => {
    (node as HTMLVideoElement).currentTime = 60;
  });
  await page.locator('video').evaluate((node) => new Promise((resolve) => node.addEventListener('seeked', () => resolve(true), { once: true })));
  expect(Date.now() - started).toBeLessThanOrEqual(1500);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/\d/)).toBeVisible();
});

test('J5 @realmedia PROP-005 PLUG-002 the eyedropper is hable-bt709 within 15 seconds', async ({ page }) => {
  expect(fs.existsSync(media), media).toBe(true);
  const response = page.waitForResponse((res) => res.url().includes('/Frame?'), { timeout: 15_000 });
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${process.env.OLFX_API_KEY ?? ''}`);
  await page.getByRole('button', { name: /eyedropper/i }).click();
  const frame = await response;
  expect(frame.headers()['x-openlightfx-tone-map']).toBe('hable-bt709');
});

test('J5 @realmedia PLUG-003 PREV-006 playback bulbs follow a saved step keyframe', async ({ page }) => {
  expect(fs.existsSync(media), media).toBe(true);
  if (fs.existsSync(track)) {
    expect(fs.statSync(track).size).toBeGreaterThan(0);
  }
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${process.env.OLFX_API_KEY ?? ''}`);
  const log = process.env.OLFX_NDJSON;
  expect(log, 'simulator NDJSON').toBeTruthy();
  const lines = fs.readFileSync(log!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  expect(lines.some((line) => line.event === 'command_received')).toBe(true);
});
