import { expect } from '@playwright/test';
import { decodeTrack } from '../../src/lib/domain';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { menu, openFixtureEditor } from '../harness/browser';
import { requirement } from '../harness/requirement';

async function save(page: import('@playwright/test').Page) {
  await menu(page, 'File', '^Save');
}

async function editTitle(page: import('@playwright/test').Page, title: string) {
  await page.getByLabel('Track title', { exact: true }).fill(title);
}

async function decodedServerTrack(
  page: import('@playwright/test').Page,
  trackId = 'proxy-fixture'
) {
  const bytes = await page.evaluate(async (id) => {
    const response = await fetch(`/OpenLightFX/Studio/Tracks/${id}?itemId=42`);
    if (!response.ok) throw new Error(`Track GET failed: ${response.status}`);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, trackId);
  return decodeTrack(Buffer.from(bytes));
}

requirement(
  'ED2-032 @browser track and sidecar writes snapshot one revision while edits undo redo and exports stay live',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true });
    const submittedBytes: Buffer[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        new URL(request.url()).pathname === '/OpenLightFX/Studio/Tracks/proxy-fixture'
      )
        submittedBytes.push(request.postDataBuffer()!);
    });

    await editTitle(page, 'Track snapshot');
    const releaseTrack = backend.gateNextWrite('track');
    const releaseProject = backend.gateNextWrite('project');
    await save(page);
    await expect.poll(() => backend.writeAttempts.at(-1)?.outcome).toBe('gated');
    await editTitle(page, 'Track during request');
    await menu(page, 'Edit', '^Undo');
    await expect(page.getByLabel('Track title')).toHaveValue('Track snapshot');
    await menu(page, 'Edit', '^Redo');
    await expect(page.getByLabel('Track title')).toHaveValue('Track during request');
    await page.keyboard.press('Control+s');
    await expect.poll(() => backend.writeAttempts.length).toBe(1);

    releaseTrack();
    await expect.poll(() => backend.writeAttempts.at(-1)?.resource).toBe('project');
    await expect.poll(() => backend.writeAttempts.at(-1)?.outcome).toBe('gated');
    await editTitle(page, 'Sidecar-time edit');
    await menu(page, 'Edit', '^Undo');
    await expect(page.getByLabel('Track title')).toHaveValue('Track during request');
    await menu(page, 'Edit', '^Redo');
    await expect(page.getByLabel('Track title')).toHaveValue('Sidecar-time edit');
    const exportedDuringSave = await new ActiveEditorPage(page).exportTrack();
    expect(exportedDuringSave.metadata.title).toBe('Sidecar-time edit');

    releaseProject();
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    expect(backend.writeAttempts.map((attempt) => attempt.resource)).toEqual(['track', 'project']);
    expect(backend.writeAttempts[0]).toMatchObject({
      snapshot: { metadata: { title: 'Track snapshot' } },
      outcome: 'written',
    });
    expect(backend.writeAttempts[1]).toMatchObject({
      snapshot: {
        itemId: '42',
        trackId: 'proxy-fixture',
        sceneMarkers: [],
        channelGroups: [],
      },
      outcome: 'written',
    });
    expect(decodeTrack(submittedBytes[0]).metadata.title).toBe('Track snapshot');
    expect(await decodedServerTrack(page)).toMatchObject({ metadata: { title: 'Track snapshot' } });
    expect(backend.projects).toHaveLength(1);
    expect(backend.projects[0]).toMatchObject({ trackId: 'proxy-fixture', itemId: '42' });
    expect(await new ActiveEditorPage(page).exportTrack()).toMatchObject({
      metadata: { title: 'Sidecar-time edit' },
    });

    await menu(page, 'Edit', '^Undo');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await menu(page, 'Edit', '^Undo');
    await expect(page.getByLabel('Track title')).toHaveValue('Track snapshot');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await menu(page, 'Edit', '^Redo');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }
);

requirement(
  'ED2-032 @browser failed second write retries with refreshed token and failed track remains wholly unsaved',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true });
    const matches: (string | undefined)[] = [];
    const initialToken = backend.updatedAt;
    page.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        new URL(request.url()).pathname === '/OpenLightFX/Studio/Tracks/proxy-fixture'
      )
        matches.push(request.headers()['if-match']);
    });
    await editTitle(page, 'Retry snapshot');
    backend.failNextWrite('project', { status: 500, message: 'Sidecar disk full' });
    await save(page);
    await expect(page.getByRole('status', { name: 'Editor feedback' })).toHaveText(
      'Partially saved'
    );
    await expect(page.getByRole('alert')).toContainText('Sidecar disk full');
    expect(backend.writeAttempts.map((attempt) => attempt.resource)).toEqual(['track', 'project']);
    expect(backend.writeAttempts[0]).toMatchObject({ outcome: 'written', ifMatch: initialToken });
    expect(backend.writeAttempts[1]).toMatchObject({ outcome: 'failed', status: 500 });
    const firstToken = backend.updatedAt;

    await save(page);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(matches).toEqual([initialToken, firstToken]);
    expect(backend.writeAttempts.at(-1)).toMatchObject({ resource: 'project', outcome: 'written' });
    expect(await decodedServerTrack(page)).toMatchObject({ metadata: { title: 'Retry snapshot' } });

    const attemptsBeforeNoop = backend.writeAttempts.length;
    await save(page);
    expect(backend.writeAttempts).toHaveLength(attemptsBeforeNoop);

    await editTitle(page, 'Failed track snapshot');
    const projectsBeforeFailure = backend.projects.length;
    backend.failNextWrite('track', { status: 500, message: 'Track disk full' });
    await save(page);
    await expect(page.getByRole('status', { name: 'Editor feedback' })).toHaveText('Save failed');
    expect(backend.writeAttempts.at(-1)).toMatchObject({ resource: 'track', outcome: 'failed' });
    expect(backend.projects).toHaveLength(projectsBeforeFailure);
    await expect(page.locator('.save-state')).toHaveText('Unsaved changes');
    expect(await new ActiveEditorPage(page).exportTrack()).toMatchObject({
      metadata: { title: 'Failed track snapshot' },
    });
  }
);

requirement('ED2-032 @browser no-op Undo and Redo leave recovery untouched', async ({ page }) => {
  await openFixtureEditor(page, { empty: true });
  const recoveryKeys = () =>
    page.evaluate(
      () =>
        new Promise<IDBValidKey[]>((resolve, reject) => {
          const open = indexedDB.open('openlightfx-studio');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const request = open.result
              .transaction('crash', 'readonly')
              .objectStore('crash')
              .getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          };
        })
    );
  expect(await recoveryKeys()).toEqual([]);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  expect(await recoveryKeys()).toEqual([]);
});

requirement(
  'ED2-032 @browser branched edits cannot reuse a saved checkpoint and Save as new preserves the original identity',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true });
    await editTitle(page, 'Checkpoint');
    await save(page);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await editTitle(page, 'Branch candidate');
    await menu(page, 'Edit', '^Undo');
    await expect(page.getByLabel('Track title')).toHaveValue('Checkpoint');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    // Re-authoring the same bytes from the checkpoint is a distinct branch revision.
    await editTitle(page, 'Branch candidate');
    await menu(page, 'Edit', '^Undo');
    await editTitle(page, 'Checkpoint');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    const original = await decodedServerTrack(page);

    backend.updatedAt = new Date(Date.parse(backend.updatedAt) + 10_000).toISOString();
    await editTitle(page, 'Conflict revision');
    await save(page);
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    const attemptsBeforeCopy = backend.writeAttempts.length;
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(
      (url) => url.hash.startsWith('#/edit/42/') && url.hash !== '#/edit/42/proxy-fixture'
    );
    const copyTrack = backend.writeAttempts
      .slice(attemptsBeforeCopy)
      .find((attempt) => attempt.resource === 'track');
    const copyProject = backend.writeAttempts
      .slice(attemptsBeforeCopy)
      .find((attempt) => attempt.resource === 'project');
    expect(copyTrack?.snapshot).toMatchObject({ metadata: { title: 'Conflict revision' } });
    expect(copyProject?.snapshot).toMatchObject({ itemId: '42' });
    const copiedId = page.url().split('/').at(-1);
    expect(copiedId).not.toBe('proxy-fixture');
    expect(backend.track).toEqual(original);
    expect(await decodedServerTrack(page, 'proxy-fixture')).toEqual(original);
    expect(await decodedServerTrack(page, copiedId)).toMatchObject({
      metadata: { title: 'Conflict revision' },
    });
    expect(
      backend.writeAttempts.slice(attemptsBeforeCopy).map((attempt) => attempt.resource)
    ).toEqual(['track', 'project']);
  }
);
