import { expect } from '@playwright/test';
import { blackKeyframe, newTrackFromMovie } from '../../src/lib/domain';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { openFixtureEditor } from '../harness/browser';
import { requirement } from '../harness/requirement';

requirement(
  'ED2-007 @browser off-grid transport advances adjacent proxy frames and typed key time exports exactly',
  async ({ page }) => {
    const track = newTrackFromMovie('42', 'Proxy Fixture', 10_000);
    track.keyframes = [blackKeyframe('left', 'typed-time')];
    await openFixtureEditor(page, { track, fps: 24 });
    const video = page.locator('video');

    // The typed Inspector field is an exact elapsed-keyframe-time editor, not a frame snapper.
    await new ActiveEditorPage(page).selectKeyframe('left', 0);
    const timeField = page.getByLabel('Keyframe time', { exact: true });
    await timeField.fill('00:01.234');
    await timeField.press('Tab');
    expect((await new ActiveEditorPage(page).exportTrack()).keyframes[0].timestampMs).toBe(1234);

    // There is no typed playhead command in this editor version; position off-grid via its ruler.
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const bounds = await ruler.boundingBox();
    if (!bounds) throw new Error('Timeline ruler is not visible');
    const durationMs = Number(await ruler.getAttribute('aria-valuemax'));
    await page.mouse.click(
      bounds.x + (1234 / durationMs) * bounds.width,
      bounds.y + bounds.height / 2
    );
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(29 / 24);
    expect(await video.evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeLessThan(
      30 / 24
    );

    await page.getByRole('button', { name: 'Next frame' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(1.25, 2);
    await page.getByRole('button', { name: 'Previous frame' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(29 / 24, 2);
    expect((await new ActiveEditorPage(page).exportTrack()).keyframes[0].timestampMs).toBe(1234);
  }
);
