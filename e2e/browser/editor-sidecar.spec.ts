import { expect, type Page } from '@playwright/test';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { newTrackFromMovie } from '../../src/lib/domain';
import { installBackend, menu, openFixtureEditor } from '../harness/browser';
import { requirement } from '../harness/requirement';
import type { ProjectSidecar } from '../../src/lib/domain';

function authoredSidecar(trackId = 'proxy-fixture'): ProjectSidecar {
  return {
    version: 1,
    itemId: '42',
    trackId,
    sceneMarkers: [
      { id: 'm-manual', timeMs: 125, label: 'Manual note', kind: 'manual' },
      { id: 'm-chapter', timeMs: 250, label: 'Chapter note', kind: 'chapter' },
      { id: 'm-detected', timeMs: 375, label: 'Detected note', kind: 'detected' },
    ],
    channelGroups: [
      {
        id: 'g-mirror',
        name: 'Mirror pair',
        mode: 'mirror',
        channelIds: ['left', 'right'],
        spreadMs: 0,
      },
      {
        id: 'g-spread',
        name: 'Spread pair',
        mode: 'spread',
        channelIds: ['left', 'right'],
        spreadMs: 180,
      },
      {
        id: 'g-alternate',
        name: 'Alternating',
        mode: 'alternate',
        channelIds: ['left', 'right'],
        spreadMs: 0,
      },
    ],
    editorNote: { owner: 'fixture', tags: ['opaque', 'preserve'] },
    undo: ['must be filtered'],
    Duration: 10000,
  };
}

async function recoveryRows(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open('openlightfx-studio');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const rows = db.transaction('crash', 'readonly').objectStore('crash').getAll();
          rows.onsuccess = () => resolve(rows.result as Record<string, unknown>[]);
          rows.onerror = () => reject(rows.error);
          rows.transaction.oncomplete = () => db.close();
        };
      })
  );
}

requirement(
  'ED2-027 @browser loaded markers groups and opaque sidecar fields survive save reload and Save as new with correct identities',
  async ({ page }) => {
    const initial = authoredSidecar();
    const backend = await openFixtureEditor(page, { sidecar: initial });
    const originalTrack = structuredClone(backend.track);
    await page.getByLabel('Track title', { exact: true }).fill('Edited with project notes');
    await menu(page, 'File', '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(backend.projects.at(-1)).toMatchObject({
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: initial.sceneMarkers,
      channelGroups: initial.channelGroups,
      editorNote: initial.editorNote,
    });
    expect(backend.projects.at(-1)).not.toHaveProperty('undo');
    expect(backend.projects.at(-1)).not.toHaveProperty('Duration');
    expect(backend.track).toMatchObject({
      metadata: { title: 'Edited with project notes', author: originalTrack.metadata.author },
      effects: originalTrack.effects,
    });
    expect(backend.track.keyframes.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
      originalTrack.keyframes.toSorted((a, b) => a.id.localeCompare(b.id))
    );

    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(
      'Edited with project notes'
    );
    await page.getByLabel('Track title', { exact: true }).fill('Copy keeps project notes');
    backend.updatedAt = new Date(Date.parse(backend.updatedAt) + 60_000).toISOString();
    await menu(page, 'File', '^Save');
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    const beforeCopy = backend.projects.length;
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect.poll(() => page.url().split('/').at(-1)).not.toBe('proxy-fixture');
    const copied = backend.projects.slice(beforeCopy).at(-1)!;
    const copiedTrackId = page.url().split('/').at(-1);
    expect(copied).toMatchObject({
      itemId: '42',
      trackId: copiedTrackId,
      sceneMarkers: initial.sceneMarkers,
      channelGroups: initial.channelGroups,
      editorNote: initial.editorNote,
    });
    expect(copied.trackId).not.toBe('proxy-fixture');
    expect(backend.track).toMatchObject({
      metadata: { ...originalTrack.metadata, title: 'Edited with project notes' },
      effects: originalTrack.effects,
    });
    expect(backend.track.keyframes.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
      originalTrack.keyframes.toSorted((a, b) => a.id.localeCompare(b.id))
    );
    expect((await new ActiveEditorPage(page).exportTrack()).metadata.title).toBe(
      'Copy keeps project notes'
    );
  }
);

requirement(
  'ED2-027 @browser missing 404 project is known empty and does not block the first save',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true });
    await expect(page.getByRole('alert', { name: 'Project sidecar unavailable' })).toHaveCount(0);
    expect(backend.projectReadAttempts).toEqual([{ itemId: '42', trackId: 'proxy-fixture' }]);
    await page.getByLabel('Track title', { exact: true }).fill('Create project from empty');
    await menu(page, 'File', '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(backend.projects.at(-1)).toEqual({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [],
      channelGroups: [],
    });
  }
);

for (const failure of [
  { name: 'forbidden', status: 403, message: 'Project access denied' },
  { name: 'server error', status: 500, message: 'Project storage unavailable' },
  { name: 'malformed JSON', status: 200, message: '{broken' },
]) {
  requirement(
    `ED2-027 @browser ${failure.name} sidecar reads block overwrite but keep editing and resolve by retry`,
    async ({ page }) => {
      const sidecar = authoredSidecar();
      const backend = await openFixtureEditor(page, {
        sidecar,
        projectReadErrors: [{ status: failure.status, message: failure.message }],
      });
      const warning = page.getByRole('alert', { name: 'Project sidecar unavailable' });
      await expect(warning).toBeVisible();
      if (failure.name === 'forbidden') {
        const retry = warning.getByRole('button', { name: 'Retry project load' });
        await retry.focus();
        await expect(retry).toBeFocused();
        await expect(warning).toHaveScreenshot('editor-sidecar-warning.png');
      }
      await page.getByLabel('Track title', { exact: true }).fill(`Editable during ${failure.name}`);
      expect((await new ActiveEditorPage(page).exportTrack()).metadata.title).toBe(
        `Editable during ${failure.name}`
      );
      await page.getByRole('button', { name: 'File', exact: true }).click();
      const saveItem = page.getByRole('menuitem', { name: /^Save/ });
      await expect(saveItem).toBeDisabled();
      await expect(saveItem).toHaveAttribute('title', /Retry loading the project before saving/);
      await page.getByRole('button', { name: 'File', exact: true }).click();
      const quickSave = page.getByRole('button', { name: 'Save', exact: true });
      await expect(quickSave).toBeDisabled();
      await expect(quickSave).toHaveAttribute('title', /Retry loading the project before saving/);
      await page.keyboard.press('Control+s');
      await expect.poll(() => backend.writeAttempts.length).toBe(0);
      expect(backend.projectReadAttempts[0]).toEqual({ itemId: '42', trackId: 'proxy-fixture' });

      const retry = warning.getByRole('button', { name: 'Retry project load' });
      await retry.focus();
      await retry.press('Enter');
      await expect(warning).toBeHidden();
      await menu(page, 'File', '^Save');
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
      expect(backend.projects.at(-1)).toMatchObject({
        sceneMarkers: sidecar.sceneMarkers,
        channelGroups: sidecar.channelGroups,
        editorNote: sidecar.editorNote,
        itemId: '42',
        trackId: 'proxy-fixture',
      });
    }
  );
}

requirement(
  'ED2-027 @browser retry hydration rebases earlier undo and redo snapshots before the next save',
  async ({ page }) => {
    const sidecar = authoredSidecar();
    const backend = await openFixtureEditor(page, {
      sidecar,
      projectReadErrors: [{ status: 500, message: 'Temporary project read failure' }],
    });
    const warning = page.getByRole('alert', { name: 'Project sidecar unavailable' });
    await expect(warning).toBeVisible();
    const title = page.getByLabel('Track title', { exact: true });
    await title.fill('Before retry one');
    await title.fill('Before retry two');
    expect(backend.writeAttempts).toHaveLength(0);

    const releaseRead = backend.gateProjectRead('proxy-fixture');
    const retry = warning.getByRole('button', { name: 'Retry project load' });
    await retry.focus();
    await retry.press('Enter');
    await expect.poll(() => backend.projectReadAttempts.length).toBe(2);
    await title.fill('While retry is pending');
    const quickSave = page.getByRole('button', { name: 'Save', exact: true });
    await expect(quickSave).toBeDisabled();
    await page.keyboard.press('Control+s');
    expect(backend.writeAttempts).toHaveLength(0);
    releaseRead();
    await expect(warning).toBeHidden();
    await menu(page, 'Edit', '^Undo');
    await expect(title).toHaveValue('Before retry two');
    await menu(page, 'Edit', '^Redo');
    await expect(title).toHaveValue('While retry is pending');
    await menu(page, 'File', '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    const response = await page.evaluate(async () => {
      const result = await fetch('/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42');
      return { status: result.status, body: await result.json() };
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: sidecar.sceneMarkers,
      channelGroups: sidecar.channelGroups,
      editorNote: sidecar.editorNote,
    });
    expect(backend.projects.at(-1)).toEqual(response.body);
  }
);

requirement(
  'ED2-027 @browser delayed prior-track sidecar response cannot replace the selected track project',
  async ({ page }) => {
    const otherTrack = authoredSidecar('other-track');
    const backend = await installBackend(page, {
      additionalTracks: { 'other-track': backendTrack() },
      sidecarsByTrack: { 'proxy-fixture': authoredSidecar(), 'other-track': otherTrack },
    });
    const releasePrior = backend.gateProjectRead('proxy-fixture');
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect.poll(() => backend.projectReadAttempts.length).toBe(1);
    await page.evaluate(() => (location.hash = '#/edit/42/other-track'));
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue('Other track');
    await expect.poll(() => backend.projectReadAttempts.length).toBe(2);
    releasePrior();
    await page.getByLabel('Track title', { exact: true }).fill('Other track edited');
    await menu(page, 'File', '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(backend.projects.at(-1)).toMatchObject({
      itemId: '42',
      trackId: 'other-track',
      sceneMarkers: otherTrack.sceneMarkers,
      channelGroups: otherTrack.channelGroups,
      editorNote: otherTrack.editorNote,
    });
    expect(backend.projectReadAttempts).toEqual([
      { itemId: '42', trackId: 'proxy-fixture' },
      { itemId: '42', trackId: 'other-track' },
    ]);
  }
);

requirement(
  'ED2-027 @browser matching crash recovery restores the complete sidecar with the dirty track',
  async ({ page }) => {
    const sidecar = authoredSidecar();
    await openFixtureEditor(page, { sidecar });
    await page.getByLabel('Track title', { exact: true }).fill('Recovered sidecar companion');
    await expect
      .poll(async () => (await recoveryRows(page)).some((row) => row.dirty === true))
      .toBe(true);
    const record = (await recoveryRows(page)).find((row) => row.dirty === true)!;
    expect(record).toMatchObject({ itemId: '42', trackId: 'proxy-fixture' });
    expect(record.sidecar).toEqual({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: sidecar.sceneMarkers,
      channelGroups: sidecar.channelGroups,
      editorNote: sidecar.editorNote,
    });
    await page.reload();
    await expect(page.getByRole('status', { name: 'Crash recovery' })).toContainText('restored');
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(
      'Recovered sidecar companion'
    );
    await page.getByLabel('Track title', { exact: true }).fill('Persist recovered pair');
    await menu(page, 'File', '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(
      (await recoveryRows(page)).find((row) => row.key === '42:proxy-fixture')?.sidecar
    ).toMatchObject({
      sceneMarkers: sidecar.sceneMarkers,
      channelGroups: sidecar.channelGroups,
      editorNote: sidecar.editorNote,
    });
  }
);

function backendTrack() {
  const { itemId: _itemId, ...track } = newTrackFromMovie('42', 'Other track', 10000);
  return track;
}
