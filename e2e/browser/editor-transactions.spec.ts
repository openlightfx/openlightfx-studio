import { expect } from '@playwright/test';
import { blackKeyframe, newTrackFromMovie } from '../../src/lib/domain';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { lanePoint, menu, openFixtureEditor } from '../harness/browser';
import { requirement } from '../harness/requirement';

requirement(
  'ED2-005 @browser insert delete undo redo preserve decoded values and valid selection',
  async ({ page }) => {
    const track = newTrackFromMovie('42', 'Proxy Fixture', 10_000);
    track.keyframes = [
      {
        ...blackKeyframe('left', 'kf-1'),
        timestampMs: 1000,
        color: { r: 12, g: 34, b: 56 },
        brightness: 25,
      },
    ];
    track.effects = [
      {
        id: 'kf-2',
        channelId: 'left',
        timestampMs: 2500,
        durationMs: 500,
        effectType: 'PULSE',
        intensity: 30,
        primaryColor: null,
        secondaryColor: null,
        params: {},
        requiredCapability: '',
        fallbackColor: null,
        fallbackBrightness: 0,
      },
    ];
    const backend = await openFixtureEditor(page, { track });
    const editor = new ActiveEditorPage(page);

    await lanePoint(page, 'Left', 0.4);
    await expect(page.getByRole('heading', { name: 'Keyframe' })).toBeVisible();
    await page.getByLabel('Brightness value').fill('37');
    const inserted = (await editor.exportTrack()).keyframes.find(
      (keyframe) => keyframe.id !== 'kf-1'
    );
    expect(inserted).toBeDefined();
    expect(inserted!.id).not.toBe('kf-2');
    expect(inserted!.brightness).toBe(37);
    expect(inserted!.channelId).toBe('left');
    expect((await editor.exportTrack()).effects.map((effect) => effect.id)).toEqual(['kf-2']);
    expect(backend.writeAttempts).toHaveLength(0);

    await editor.selectKeyframe('left', inserted!.timestampMs);
    await menu(page, 'Edit', 'Delete');
    let decoded = await editor.exportTrack();
    expect(decoded.keyframes.map((keyframe) => keyframe.id)).toEqual(['kf-1']);

    await menu(page, 'Edit', 'Undo');
    decoded = await editor.exportTrack();
    const restored = decoded.keyframes.find((keyframe) => keyframe.id === inserted!.id);
    expect(restored?.brightness).toBe(37);
    expect(await page.getByLabel('Keyframe time', { exact: true }).inputValue()).toContain(
      `${String(Math.floor(inserted!.timestampMs / 1000)).padStart(2, '0')}.`
    );

    await menu(page, 'Edit', 'Redo');
    decoded = await editor.exportTrack();
    expect(decoded.keyframes.map((keyframe) => keyframe.id)).toEqual(['kf-1']);
    await menu(page, 'Edit', 'Undo');
    decoded = await editor.exportTrack();
    expect(decoded.keyframes.find((keyframe) => keyframe.id === inserted!.id)?.brightness).toBe(37);
    expect(decoded.effects.map((effect) => effect.id)).toEqual(['kf-2']);
  }
);
