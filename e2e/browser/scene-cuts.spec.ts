import { expect, test, type Page } from '@playwright/test';

const movie = {
  itemId: 'm1',
  name: 'Clip Short',
  year: 2020,
  runtimeMs: 10_000,
  posterUrl: '',
};
const mediaInfo = {
  runtimeMs: 10_000,
  width: 320,
  height: 180,
  videoCodec: 'h264',
  hdr: false,
  colorTransfer: 'bt709',
  audioCodec: 'aac',
  proxy: {
    state: 'ready',
    encodedThroughMs: 10_000,
    fps: 24,
    keyframeIntervalMs: 500,
    width: 320,
    height: 180,
    editUrl: '/media/clip-a-h264.mp4',
  },
};
const cuts = {
  itemId: 'm1',
  status: 'ready',
  detector: { name: 'ContentDetector', threshold: 27, fps: 24, minSceneLen: 15 },
  durationSeconds: 10,
  cuts: [2, 6],
  updatedAt: '2026-11-17T18:00:00.000Z',
};

async function openEditor(page: Page) {
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Items/*/SourceWorkspace', (route) =>
    route.fulfill({ json: { required: false, state: 'ready', progressPercent: 100 } })
  );
  await page.route('**/OpenLightFX/Settings', (route) =>
    route.fulfill({ json: { photosensitivityMode: false } })
  );
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: [] }));
  await page.route('**/OpenLightFX/Studio/Items?*', (route) => route.fulfill({ json: [movie] }));
  await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
    route.fulfill({ json: mediaInfo })
  );
  await page.route('**/OpenLightFX/Studio/Tracks?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: [] }));
  await page.route('**/OpenLightFX/Studio/Setup', (route) =>
    route.fulfill({ json: { roomCount: 0 } })
  );
  await page.route('**/OpenLightFX/Studio/CanManageRooms', (route) =>
    route.fulfill({ json: { canManageRooms: true } })
  );
  await page.route('**/OpenLightFX/Studio/Projects/*', (route) =>
    route.fulfill({ status: 404, body: 'Project sidecar not found' })
  );
  await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/m1/new');
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
}

test('scene cuts draw on the timeline and previous/next scene seek the playhead', async ({
  page,
}) => {
  await page.route('**/OpenLightFX/Studio/Items/m1/SceneCuts', (route) =>
    route.fulfill({ json: cuts })
  );
  await openEditor(page);
  await expect(page.locator('.scene-cut')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Previous scene' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next scene' }).click();
  await expect(page.locator('.transport time')).toContainText('00:02.000');
  await page.getByRole('button', { name: 'Previous scene' }).click();
  await expect(page.locator('.transport time')).toContainText('00:00.000');
  await expect(page.getByRole('button', { name: 'Detect scenes' })).toHaveCount(0);
});

test('scene markers appear incrementally while detection is running', async ({ page }) => {
  let started = false;
  let jobPolls = 0;
  await page.route('**/OpenLightFX/Studio/Items/m1/SceneCuts', async (route) => {
    if (route.request().method() === 'POST') {
      started = true;
      return route.fulfill({
        json: {
          jobId: 'job-1',
          itemId: 'm1',
          state: 'processing',
          error: '',
          progress: 0.1,
          throughMs: 1_000,
        },
      });
    }
    if (!started) return route.fulfill({ json: { ...cuts, status: 'none', cuts: [] } });
    if (jobPolls > 1) return route.fulfill({ json: cuts });
    return route.fulfill({ json: { ...cuts, status: 'running', cuts: [2] } });
  });
  await page.route('**/OpenLightFX/Studio/SceneCuts/job-1', (route) => {
    jobPolls++;
    return route.fulfill({
      json: {
        jobId: 'job-1',
        itemId: 'm1',
        state: jobPolls > 1 ? 'done' : 'processing',
        error: '',
        progress: jobPolls > 1 ? 1 : 0.5,
        throughMs: jobPolls > 1 ? 10_000 : 5_000,
      },
    });
  });
  await openEditor(page);
  await expect(page.getByRole('button', { name: 'Detect scenes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Detect scenes' }).click();
  await expect(page.locator('.scene-cut')).toHaveCount(1);
  await expect(page.locator('.scene-cut')).toHaveCount(2);
});

test('cached scene cuts remain visible when the server cannot be reached', async ({ page }) => {
  await page.addInitScript(
    (cached) => {
      localStorage.setItem('openlightfx.scene-cuts.v1', JSON.stringify(cached));
    },
    { version: 1, items: { m1: cuts } }
  );
  await page.route('**/OpenLightFX/Studio/Items/m1/SceneCuts', (route) => route.abort());
  await openEditor(page);
  await expect(page.locator('.scene-cut')).toHaveCount(2);
});
