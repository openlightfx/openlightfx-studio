import { expect, type Page } from '@playwright/test';
import { chooseLoadSource, type CrashRecord } from '../../src/lib/domain';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { installBackend, menu, openFixtureEditor } from '../harness/browser';
import { requirement } from '../harness/requirement';

async function installStorageFault(page: Page, fault: 'open' | 'read' | 'write') {
  await page.addInitScript((selectedFault) => {
    const injectionMarker = '__olfxRecoveryFaultInstalled';
    if (sessionStorage.getItem(injectionMarker)) return;
    sessionStorage.setItem(injectionMarker, 'true');
    const storage = window as Window & {
      __olfxRecoveryFault?: { remaining: number };
    };
    storage.__olfxRecoveryFault = { remaining: 1 };
    const failOnce = () => {
      const state = storage.__olfxRecoveryFault;
      if (!state || state.remaining < 1) return false;
      state.remaining -= 1;
      return true;
    };
    if (selectedFault === 'open') {
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        if (failOnce()) throw new DOMException('Storage denied', 'SecurityError');
        return open.apply(this, args);
      };
    } else {
      const method = selectedFault === 'read' ? 'get' : 'put';
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args: never[]) {
        if (failOnce()) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        return original.apply(this, args);
      };
    }
  }, fault);
}

async function recoveryRows(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open('openlightfx-studio');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('crash')) {
            db.close();
            resolve([]);
            return;
          }
          const transaction = db.transaction('crash', 'readonly');
          const rows = transaction.objectStore('crash').getAll();
          rows.onsuccess = () => resolve(rows.result as Record<string, unknown>[]);
          rows.onerror = () => reject(rows.error);
          transaction.oncomplete = () => db.close();
        };
      })
  );
}

for (const schema of ['missing-v1', 'missing-v7', 'existing-v7'] as const) {
  for (const newTrack of [false, true]) {
    requirement(
      `ED2-033 @browser ${schema} database permits ${newTrack ? 'creating' : 'opening'} a track without deleting existing data`,
      async ({ page }) => {
        const backend = await installBackend(page, { newTrack });
        await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/library');
        await expect(page.getByRole('heading', { name: 'Movie library' })).toBeVisible();
        await page.evaluate(
          (schema) =>
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.open('openlightfx-studio', schema === 'missing-v1' ? 1 : 7);
              request.onupgradeneeded = () => {
                request.result.createObjectStore('legacy').put('keep legacy data', 'sentinel');
                if (schema === 'existing-v7') {
                  request.result.createObjectStore('crash').put('keep recovery data', 'sentinel');
                }
              };
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                request.result.close();
                resolve();
              };
            }),
          schema
        );

        // Change the query too, so this starts a fresh document rather than
        // racing a hash navigation against the Library's initial route setup.
        await page.goto(
          `/emby/OpenLightFX/studio/?api_key=browser-test&schema-seeded=1#/edit/42/${newTrack ? 'new' : 'proxy-fixture'}`
        );
        await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
        await expect(page.getByRole('alert', { name: 'Local recovery unavailable' })).toHaveCount(
          0
        );
        const title = `Recovered ${schema} ${newTrack ? 'new' : 'opened'}`;
        await page.getByLabel('Track title', { exact: true }).fill(title);
        await expect
          .poll(async () =>
            (await recoveryRows(page)).some(
              (row) =>
                row.dirty === true &&
                (row.track as { metadata: { title: string } }).metadata.title === title
            )
          )
          .toBe(true);
        expect((await new ActiveEditorPage(page).exportTrack()).metadata.title).toBe(title);
        const schemaAfter = await page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open('openlightfx-studio');
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(['legacy', 'crash']);
                const legacy = tx.objectStore('legacy').get('sentinel');
                const crash = tx.objectStore('crash').get('sentinel');
                tx.oncomplete = () => {
                  resolve({ version: db.version, legacy: legacy.result, crash: crash.result });
                  db.close();
                };
                tx.onabort = () => reject(tx.error);
              };
            })
        );
        expect(schemaAfter).toEqual({
          version: schema === 'missing-v1' ? 2 : schema === 'missing-v7' ? 8 : 7,
          legacy: 'keep legacy data',
          crash: schema === 'existing-v7' ? 'keep recovery data' : undefined,
        });
        if (newTrack) {
          await menu(page, 'File', '^Save');
          await expect(page.getByText('Saved', { exact: true })).toBeVisible();
          expect(backend.track.metadata.title).toBe(title);
          await expect
            .poll(async () => (await recoveryRows(page)).some((row) => row.dirty === true))
            .toBe(false);
        } else {
          await page.reload();
          await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(title);
          await expect(page.getByRole('status', { name: 'Crash recovery' })).toContainText(
            'restored'
          );
        }
      }
    );
  }
}

requirement(
  'ED2-033 @browser a legacy tab blocking schema repair leaves authoring available and Retry recovers after it closes',
  async ({ page }) => {
    await installBackend(page);
    const legacyTab = await page.context().newPage();
    await legacyTab.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/library');
    await legacyTab.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('openlightfx-studio', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('legacy');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            // Simulate an older Studio tab which does not close on versionchange.
            (window as Window & { legacyConnection?: IDBDatabase }).legacyConnection =
              request.result;
            resolve();
          };
        })
    );
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/proxy-fixture');
    const unavailable = page.getByRole('alert', { name: 'Local recovery unavailable' });
    await expect(unavailable).toBeVisible();
    await page.getByLabel('Track title', { exact: true }).fill('Edited while upgrade blocked');
    expect((await new ActiveEditorPage(page).exportTrack()).metadata.title).toBe(
      'Edited while upgrade blocked'
    );
    await legacyTab.close();
    await unavailable.getByRole('button', { name: 'Retry' }).click();
    await expect(unavailable).toBeHidden();
    await expect
      .poll(async () =>
        (await recoveryRows(page)).some(
          (row) =>
            row.dirty === true &&
            (row.track as { metadata: { title: string } }).metadata.title ===
              'Edited while upgrade blocked'
        )
      )
      .toBe(true);
    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(
      'Edited while upgrade blocked'
    );
  }
);

for (const fault of ['open', 'read', 'write'] as const) {
  requirement(
    `ED2-033 @browser ${fault} failure keeps authoring and export available and retry recovers the committed document`,
    async ({ page }) => {
      await installStorageFault(page, fault);
      const backend = await openFixtureEditor(page, { admin: false });
      const unavailable = page.getByRole('alert', { name: 'Local recovery unavailable' });
      if (fault !== 'write') await expect(unavailable).toBeVisible();

      await page.getByLabel('Track title', { exact: true }).fill(`Recovered after ${fault}`);
      if (fault === 'write') await expect(unavailable).toBeVisible();
      await expect(page.getByLabel('Track title')).toHaveValue(`Recovered after ${fault}`);
      expect((await new ActiveEditorPage(page).exportTrack()).metadata.title).toBe(
        `Recovered after ${fault}`
      );

      await unavailable.getByRole('button', { name: 'Retry' }).click();
      await expect(unavailable).toBeHidden();
      await expect
        .poll(async () => (await recoveryRows(page)).some((row) => row.dirty === true))
        .toBe(true);
      const record = (await recoveryRows(page)).find((row) => row.dirty === true)!;
      expect(record).toMatchObject({
        key: '42:proxy-fixture',
        itemId: '42',
        trackId: 'proxy-fixture',
        dirty: true,
        storage: 'indexeddb',
        sidecar: {
          itemId: '42',
          trackId: 'proxy-fixture',
          sceneMarkers: [],
          channelGroups: [],
        },
      });
      expect(typeof record.revision).toBe('string');
      expect(record.track).toMatchObject({ metadata: { title: `Recovered after ${fault}` } });
      expect(record.savedAt).toBeGreaterThan(Date.parse(backend.updatedAt));
      expect(
        chooseLoadSource(Date.parse(backend.updatedAt), record as unknown as CrashRecord, {
          itemId: '42',
          trackId: 'proxy-fixture',
        })
      ).toBe('crash');
      expect(JSON.stringify(record)).not.toContain('browser-test');

      await page.reload();
      await expect(page.getByRole('status', { name: 'Crash recovery' })).toContainText('restored');
      await expect(page.getByLabel('Track title')).toHaveValue(`Recovered after ${fault}`);
      const restored = await new ActiveEditorPage(page).exportTrack();
      expect(restored.metadata.title).toBe(`Recovered after ${fault}`);
      expect(restored.keyframes.find((frame) => frame.id === 'left-red')).toMatchObject({
        channelId: 'left',
        timestampMs: 1000,
        color: { r: 255, g: 0, b: 0 },
      });
      expect(restored.keyframes.find((frame) => frame.id === 'right-blue')).toMatchObject({
        channelId: 'right',
        timestampMs: 2000,
        color: { r: 0, g: 0, b: 255 },
      });
    }
  );
}

requirement(
  'ED2-033 @browser rapid edits and pagehide flush the latest committed recovery snapshot',
  async ({ page }) => {
    await openFixtureEditor(page, { admin: false });
    const title = page.getByLabel('Track title', { exact: true });
    await title.fill('First revision');
    await title.fill('Intermediate revision');
    await title.fill('Latest committed revision');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect
      .poll(async () =>
        (await recoveryRows(page)).some(
          (row) =>
            row.dirty === true &&
            (row.track as { metadata: { title: string } }).metadata.title ===
              'Latest committed revision'
        )
      )
      .toBe(true);
    const record = (await recoveryRows(page)).find((row) => row.dirty === true)!;
    expect((record.track as { metadata: { title: string } }).metadata.title).toBe(
      'Latest committed revision'
    );
    await page.reload();
    await expect(title).toHaveValue('Latest committed revision');
  }
);

requirement(
  'ED2-033 @browser discard writes a clean checkpoint and does not resurrect dirty recovery',
  async ({ page }) => {
    await openFixtureEditor(page, { admin: false });
    await page.getByLabel('Track title', { exact: true }).fill('Discard me');
    await expect
      .poll(async () => (await recoveryRows(page)).some((row) => row.dirty === true))
      .toBe(true);
    await page.getByRole('link', { name: 'Set up a room', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Save changes');
    await page.getByRole('button', { name: "Don't save", exact: true }).click();
    await expect(page).toHaveURL(/#\/rooms$/);
    await expect.poll(async () => (await recoveryRows(page)).every((row) => !row.dirty)).toBe(true);
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByLabel('Track title')).toHaveValue('Proxy Fixture');
    await expect(page.getByRole('status', { name: 'Crash recovery' })).toHaveCount(0);
  }
);

requirement(
  'ED2-033 @browser Save as new retires recovery from the prior track identity',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    await page.getByLabel('Track title', { exact: true }).fill('Migrated recovery');
    backend.updatedAt = new Date(Date.now() + 60_000).toISOString();
    await menu(page, 'File', '^Save');
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    const oldTrackId = 'proxy-fixture';
    const attemptCount = backend.writeAttempts.length;
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const newTrackId = backend.writeAttempts
      .slice(attemptCount)
      .find((attempt) => attempt.resource === 'track')?.trackId;
    expect(newTrackId).toBeTruthy();
    expect(newTrackId).not.toBe(oldTrackId);
    expect(backend.writeAttempts.slice(attemptCount).map((attempt) => attempt.resource)).toEqual([
      'track',
      'project',
    ]);
    const rows = await recoveryRows(page);
    expect(rows.filter((row) => row.dirty === true)).toEqual([]);
    expect(rows.map((row) => row.key).sort()).toEqual(
      [`42:${oldTrackId}`, `42:${newTrackId}`].sort()
    );
    await page.goto(
      `/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/${encodeURIComponent(newTrackId!)}`
    );
    await expect(page.getByLabel('Track title')).toHaveValue('Migrated recovery');
    expect((await recoveryRows(page)).filter((row) => row.dirty === true)).toEqual([]);
  }
);

requirement(
  'ED2-033 @browser undo checkpoints clean state and redo recovers the committed revision',
  async ({ page }) => {
    await openFixtureEditor(page, { empty: true });
    await page.getByLabel('Track title', { exact: true }).fill('First committed');
    await menu(page, 'Edit', '^Undo');
    await menu(page, 'Edit', '^Redo');
    await expect(page.getByLabel('Track title')).toHaveValue('First committed');
    await expect
      .poll(async () => (await recoveryRows(page)).some((row) => row.dirty === true))
      .toBe(true);
    const record = (await recoveryRows(page)).find((row) => row.dirty === true)!;
    expect((record.track as { metadata: { title: string } }).metadata.title).toBe(
      'First committed'
    );
    await page.reload();
    await expect(page.getByLabel('Track title')).toHaveValue('First committed');
  }
);
