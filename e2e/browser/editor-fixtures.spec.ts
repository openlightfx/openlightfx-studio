import { expect } from '@playwright/test';
import { encodeTrack, type ProjectSidecar, type Track } from '../../src/lib/domain';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { openFixtureEditor, seekFraction } from '../harness/browser';
import { requirement } from '../harness/requirement';
import {
  DOCUMENT_ONLY_MEDIA,
  SHORT_PLAYABLE_MEDIA,
  TWO_HOUR_10K_DOCUMENT,
  TWO_HOUR_DURATION_MS,
  TWO_HOUR_KEYFRAME_COUNT,
  trackWithNeighboringKeys,
  twoHourDocumentFixture,
} from '../fixtures/editor';

const suppliedSidecar: ProjectSidecar = {
  version: 1,
  itemId: '42',
  trackId: 'proxy-fixture',
  sceneMarkers: [{ id: 'marker-1', timeMs: 1200, label: 'Opening', kind: 'manual' }],
  channelGroups: [
    {
      id: 'group-1',
      name: 'Front pair',
      mode: 'mirror',
      channelIds: ['left', 'right'],
      spreadMs: 0,
    },
  ],
};

async function getSidecar(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const response = await fetch('/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42');
    return { status: response.status, body: response.ok ? await response.json() : null };
  });
}

async function putSidecar(
  page: import('@playwright/test').Page,
  sidecar: ProjectSidecar
): Promise<number> {
  return page.evaluate(async (submitted) => {
    const response = await fetch('/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submitted),
    });
    return response.status;
  }, sidecar);
}

async function expectSelectedKeyExport(
  page: import('@playwright/test').Page,
  layout: 'LAYOUT_2_0' | 'LAYOUT_5_0'
) {
  const backend = await openFixtureEditor(page, { track: trackWithNeighboringKeys(layout) });
  const active = new ActiveEditorPage(page);
  for (let index = 0; index < 3; index++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await active.selectKeyframe('left', 7300);
  expect(
    await page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft)
  ).toBeGreaterThan(0);
  await page.getByLabel('Brightness value', { exact: true }).fill('37');
  const exported = await active.exportTrack();
  const target = exported.keyframes.find((frame) => frame.id === 'left-target');
  const neighbor = exported.keyframes.find((frame) => frame.id === 'left-neighbor');
  expect(target).toMatchObject({ id: 'left-target', timestampMs: 7300, brightness: 37 });
  expect(neighbor).toMatchObject({ id: 'left-neighbor', timestampMs: 7000, brightness: 21 });
  expect(exported.channels.map((channel) => channel.id)).toEqual(
    backend.track.channels.map((channel) => channel.id)
  );
}

requirement(
  'ED2-001 @browser the active editor opens a 2.0 document on its two position lanes',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true, layout: 'LAYOUT_2_0' });
    await expect(page.getByRole('combobox', { name: 'Track layout', exact: true })).toHaveValue(
      'LAYOUT_2_0'
    );
    await expect(page.locator('.lane-canvas')).toHaveCount(2);
    expect(backend.track.channels.map((channel) => channel.id)).toEqual(['left', 'right']);
  }
);

requirement(
  'ED2-001 @browser the active editor opens a 5.0 document on its five position lanes',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true, layout: 'LAYOUT_5_0' });
    await expect(page.getByRole('combobox', { name: 'Track layout', exact: true })).toHaveValue(
      'LAYOUT_5_0'
    );
    await expect(page.locator('.lane-canvas')).toHaveCount(5);
    expect(backend.track.channels.map((channel) => channel.id)).toEqual([
      'left',
      'center',
      'right',
      'surround-left',
      'surround-right',
    ]);
  }
);

requirement(
  'ED2-001 @browser zoomed and scrolled canvas coordinates select the 2.0 key instead of its neighbor',
  async ({ page }) => {
    await expectSelectedKeyExport(page, 'LAYOUT_2_0');
  }
);

requirement(
  'ED2-001 @browser zoomed and scrolled canvas coordinates select the 5.0 key instead of its neighbor',
  async ({ page }) => {
    await expectSelectedKeyExport(page, 'LAYOUT_5_0');
  }
);

requirement(
  'ED2-001 @browser sidecar GET returns supplied data and PUT snapshots are immutable while failed PUT leaves server state unchanged',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { sidecar: suppliedSidecar });
    const before = await getSidecar(page);
    expect(before).toEqual({ status: 200, body: suppliedSidecar });

    const submitted: ProjectSidecar = {
      ...suppliedSidecar,
      sceneMarkers: [{ ...suppliedSidecar.sceneMarkers[0], label: 'Act one' }],
    };
    expect(await putSidecar(page, submitted)).toBe(204);
    expect(backend.projects).toEqual([submitted]);
    backend.sidecar!.sceneMarkers[0].label = 'Changed after accepted write';
    expect(backend.projects[0]).toEqual(submitted);

    const beforeFailure = structuredClone(backend.sidecar);
    const rejected: ProjectSidecar = {
      ...submitted,
      sceneMarkers: [{ ...submitted.sceneMarkers[0], label: 'Must not persist' }],
    };
    backend.failNextWrite('project', { status: 500, message: 'Sidecar disk full' });
    expect(await putSidecar(page, rejected)).toBe(500);
    expect(backend.sidecar).toEqual(beforeFailure);
    expect((await getSidecar(page)).body).toEqual(beforeFailure);
    expect(backend.projects).toEqual([submitted]);
    expect(backend.writeAttempts.at(-1)).toMatchObject({
      resource: 'project',
      outcome: 'failed',
      status: 500,
      snapshot: rejected,
    });
  }
);

requirement(
  'ED2-001 @browser a gated write remains pending and a stale track write is rejected without mutation',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    const sidecar: ProjectSidecar = {
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [],
      channelGroups: [],
    };
    const release = backend.gateNextWrite('project');
    let settled = false;
    const gatedRequest = putSidecar(page, sidecar).then((status) => {
      settled = true;
      return status;
    });
    await expect.poll(() => backend.writeAttempts.at(-1)?.outcome).toBe('gated');
    await page.waitForTimeout(100);
    expect(settled).toBe(false);
    release();
    expect(await gatedRequest).toBe(204);
    expect(backend.writeAttempts.at(-1)).toMatchObject({
      resource: 'project',
      outcome: 'written',
      status: 204,
    });

    const originalTrack = structuredClone(backend.track) as Track;
    const bytes = Array.from(encodeTrack(originalTrack));
    const staleStatus = await page.evaluate(async (payload) => {
      const response = await fetch('/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=42', {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'if-match': 'stale-revision' },
        body: new Uint8Array(payload),
      });
      return response.status;
    }, bytes);
    expect(staleStatus).toBe(409);
    expect(backend.track).toEqual(originalTrack);
    expect(backend.writeAttempts.at(-1)).toMatchObject({
      resource: 'track',
      ifMatch: 'stale-revision',
      outcome: 'stale',
      status: 409,
    });
  }
);

requirement(
  'ED2-001 @browser long documents stay separate from the generated short playable proxy and report actual video time',
  async ({ page }) => {
    const document = twoHourDocumentFixture();
    expect(document.metadata.durationMs).toBe(TWO_HOUR_DURATION_MS);
    expect(document.keyframes).toHaveLength(TWO_HOUR_KEYFRAME_COUNT);
    expect(TWO_HOUR_10K_DOCUMENT.keyframes).toHaveLength(10_000);
    expect(SHORT_PLAYABLE_MEDIA.runtimeMs).toBe(10_000);
    expect(DOCUMENT_ONLY_MEDIA.runtimeMs).toBe(0);
    expect(DOCUMENT_ONLY_MEDIA.proxy.state).toBe('failed');
    expect(document.metadata.durationMs).not.toBe(SHORT_PLAYABLE_MEDIA.runtimeMs);

    const backend = await openFixtureEditor(page, {
      durationMs: SHORT_PLAYABLE_MEDIA.runtimeMs,
      media: SHORT_PLAYABLE_MEDIA,
    });
    expect(backend.media.proxy.editUrl).toBe('/media/clip-a-h264.mp4');
    const video = page.locator('video');
    await video.evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          const media = node as HTMLVideoElement;
          if (media.readyState >= 2) resolve();
          else media.addEventListener('loadeddata', () => resolve(), { once: true });
        })
    );
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).duration))
      .toBeCloseTo(10, 1);
    await seekFraction(page, 0.3);
    await new ActiveEditorPage(page).expectProxyTime(3, 1);
  }
);
