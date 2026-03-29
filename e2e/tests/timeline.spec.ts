import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';

test.describe('Timeline canvas interactions', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('click keyframe selects it', async () => {
    await timeline.clickKeyframe(0, 0);
    const selected = await timeline.getSelectedKeyframeIds();
    expect(selected).toContain('kf-left-0');
  });

  test('ctrl+click adds to selection', async () => {
    await timeline.clickKeyframe(0, 0);
    await timeline.clickKeyframe(5000, 0, { ctrlKey: true });
    const selected = await timeline.getSelectedKeyframeIds();
    expect(selected).toContain('kf-left-0');
    expect(selected).toContain('kf-left-5000');
  });

  test('click empty space deselects all', async () => {
    await timeline.clickKeyframe(0, 0);
    let selected = await timeline.getSelectedKeyframeIds();
    expect(selected.length).toBeGreaterThan(0);

    await timeline.clickEmpty();
    selected = await timeline.getSelectedKeyframeIds();
    expect(selected.length).toBe(0);
  });

  test('double-click creates a new keyframe', async () => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    const countAfter = await timeline.getKeyframeCount();
    expect(countAfter).toBe(countBefore + 1);

    const keyframes = await timeline.getKeyframes();
    const newKf = keyframes.find(
      (kf) => kf.channelId === 'left' && kf.id !== 'kf-left-0' && kf.id !== 'kf-left-5000',
    );
    expect(newKf).toBeTruthy();
    expect(newKf!.timestampMs).toBeGreaterThan(2000);
    expect(newKf!.timestampMs).toBeLessThan(3000);
  });

  test('drag moves keyframe', async () => {
    await timeline.clickKeyframe(5000, 0);
    await timeline.dragKeyframe(5000, 3000, 0);

    const kf = await timeline.getKeyframe('kf-left-5000');
    expect(kf).toBeTruthy();
    expect(kf.timestampMs).toBeGreaterThan(2500);
    expect(kf.timestampMs).toBeLessThan(3500);
  });

  test('right-click shows context menu', async ({ page }) => {
    await timeline.rightClickAt(0, 0);
    await expect(page.getByText('Delete Keyframe')).toBeVisible({ timeout: 2_000 });
  });

  test('selection rectangle selects multiple keyframes', async () => {
    await timeline.selectRect(0, 0, 5000, 1);
    const selected = await timeline.getSelectedKeyframeIds();
    expect(selected.length).toBe(4);
    expect(selected).toContain('kf-left-0');
    expect(selected).toContain('kf-left-5000');
    expect(selected).toContain('kf-right-0');
    expect(selected).toContain('kf-right-5000');
  });
});
