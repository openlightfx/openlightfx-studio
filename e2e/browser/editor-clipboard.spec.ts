import { expect, test, type Page } from '@playwright/test';
import { blackKeyframe, newTrackFromMovie } from '../../src/lib/domain';
import { openFixtureEditor } from '../harness/browser';
import { ActiveEditorPage } from '../pages/active-editor-page';

async function goTo(page: Page, time: string) {
  const field = page.getByLabel('Go to time', { exact: true });
  await field.fill(`00:${time}`);
  await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
    'aria-valuenow',
    String(Number(time.slice(3, 5)) * 1000)
  );
  await page.locator('.lane-canvas').first().focus();
}
async function clipboardAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${name} keyframes`) }).click();
}

test('ED2-020 @browser multi-lane copy paste cut duplicate are atomic and preserve authored values', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  const before = await editor.exportTrack();
  await editor.selectKeyframe('left', 1000);
  await page.keyboard.down('Control');
  await editor.selectKeyframe('right', 2000);
  await page.keyboard.up('Control');
  await page.locator('.lane-canvas').first().focus();
  await page.keyboard.press('Control+c');
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  expect(await editor.exportTrack()).toEqual(before);
  await goTo(page, '00:04.000');
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
  const pasted = await editor.exportTrack();
  const newFrames = pasted.keyframes.filter(
    (frame) => !before.keyframes.some((old) => old.id === frame.id)
  );
  expect(newFrames).toHaveLength(2);
  const { id: _left, ...left } = before.keyframes.find((frame) => frame.id === 'left-red')!;
  const { id: _right, ...right } = before.keyframes.find((frame) => frame.id === 'right-blue')!;
  expect(newFrames.map(({ id: _id, ...value }) => value)).toEqual([
    { ...left, timestampMs: 4000 },
    { ...right, timestampMs: 5000 },
  ]);
  expect(new Set(pasted.keyframes.map((frame) => frame.id)).size).toBe(6);
  expect(pasted.effects).toEqual(before.effects);
  expect(pasted.metadata).toEqual(before.metadata);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await editor.exportTrack()).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await editor.exportTrack()).keyframes).toEqual(pasted.keyframes);

  await clipboardAction(page, 'Cut');
  expect(await editor.exportTrack()).toEqual(before);
  await goTo(page, '00:04.000');
  await clipboardAction(page, 'Paste');
  const recut = await editor.exportTrack();
  expect(
    recut.keyframes.filter((frame) => newFrames.some((old) => old.id === frame.id))
  ).toHaveLength(0);
  expect(
    recut.keyframes
      .filter((frame) => !before.keyframes.some((old) => old.id === frame.id))
      .map(({ id: _id, ...value }) => value)
  ).toEqual(newFrames.map(({ id: _id, ...value }) => value));
  await goTo(page, '00:07.000');
  await clipboardAction(page, 'Duplicate');
  const duplicated = await editor.exportTrack();
  // Right's 8000 ms destination is occupied: the whole passage is rejected.
  expect(duplicated).toEqual(recut);
  await expect(page.getByRole('status', { name: 'Editor feedback' })).toContainText(
    'Nothing was pasted'
  );
  expect(backend.writeAttempts).toHaveLength(0);
  await expect(page.getByRole('switch', { name: 'Lights' })).not.toBeChecked();
});

test('ED2-020 @browser one-lane duplicate targets the active lane and native text clipboard stays native', async ({
  page,
}) => {
  await openFixtureEditor(page, { admin: false });
  const editor = new ActiveEditorPage(page);
  await editor.selectKeyframe('left', 1000);
  const initial = await editor.exportTrack();
  await clipboardAction(page, 'Copy');
  const title = page.getByLabel('Track title', { exact: true });
  await title.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(title).toHaveValue('Proxy Fixture');
  expect(await editor.exportTrack()).toEqual(initial);
  await page.getByRole('button', { name: 'Right', exact: true }).click();
  await goTo(page, '00:04.000');
  await page.keyboard.press('Control+v');
  const pasted = await editor.exportTrack();
  const added = pasted.keyframes.find(
    (frame) => !initial.keyframes.some((old) => old.id === frame.id)
  )!;
  expect(added).toMatchObject({
    channelId: 'right',
    timestampMs: 4000,
    color: { r: 255, g: 0, b: 0 },
    brightness: 100,
  });
  await goTo(page, '00:05.000');
  await page.keyboard.press('Shift+D');
  expect((await editor.exportTrack()).keyframes).toHaveLength(6);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  await page.evaluate(() => {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'd')
        document.documentElement.dataset.bookmarkPrevented = String(event.defaultPrevented);
    });
  });
  await page.locator('.lane-canvas').first().focus();
  await page.keyboard.press('Control+d');
  await expect(page.locator('html')).toHaveAttribute('data-bookmark-prevented', 'false');
});

test('ED2-020 @browser tab clipboard survives track changes and rejects missing positions without history', async ({
  page,
}) => {
  const source = newTrackFromMovie('42', 'Surround source', 10000, 'LAYOUT_5_0');
  source.keyframes = [
    { ...blackKeyframe('left', 'source-left'), timestampMs: 1000, color: { r: 19, g: 37, b: 53 } },
    { ...blackKeyframe('surround-left', 'source-surround'), timestampMs: 2000, brightness: 33 },
  ];
  const target = newTrackFromMovie('42', 'Stereo destination', 10000, 'LAYOUT_2_0');
  await openFixtureEditor(page, { track: source, additionalTracks: { stereo: target } });
  const editor = new ActiveEditorPage(page);
  await page.locator('.lane-canvas').first().focus();
  await page.keyboard.press('Control+a');
  await clipboardAction(page, 'Copy');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
  await expect(page).toHaveURL(/#\/movie\/42$/);
  await page
    .locator('.track-row')
    .filter({ hasText: 'Stereo destination' })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await expect(page.getByLabel('Track title', { exact: true })).toHaveValue('Stereo destination');
  await goTo(page, '00:04.000');
  await clipboardAction(page, 'Paste');
  await expect(page.getByRole('status', { name: 'Editor feedback' })).toContainText(
    'does not have every copied lighting position'
  );
  expect((await editor.exportTrack()).keyframes).toEqual([]);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
});
