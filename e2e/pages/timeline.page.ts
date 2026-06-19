import { type Page, type Locator } from '@playwright/test';

// Must match src/lib/types/timeline.ts
const RULER_HEIGHT = 28;
const CHANNEL_LANE_HEIGHT = 44;

export class TimelinePage {
  constructor(private page: Page) {}

  private get canvas(): Locator {
    return this.page.locator('.timeline-panel canvas').first();
  }

  /** Read pxPerMs and scrollX from the timeline store. */
  private async getViewport(): Promise<{ pxPerMs: number; scrollX: number }> {
    return this.page.evaluate(() => {
      const s = (window as any).__stores.timelineStore;
      return { pxPerMs: s.pxPerMs, scrollX: s.scrollX };
    });
  }

  /** Convert (timestampMs, channelIndex) → canvas-relative pixel coords. */
  async getPosition(timestampMs: number, channelIndex: number): Promise<{ x: number; y: number }> {
    const vp = await this.getViewport();
    const x = (timestampMs - vp.scrollX) * vp.pxPerMs;
    const y = RULER_HEIGHT + channelIndex * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    return { x, y };
  }

  /** Click a keyframe at known (timestampMs, channelIndex). */
  async clickKeyframe(timestampMs: number, channelIndex: number, modifiers?: { ctrlKey?: boolean }): Promise<void> {
    const pos = await this.getPosition(timestampMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    const absX = box.x + pos.x;
    const absY = box.y + pos.y;
    if (modifiers?.ctrlKey) {
      await this.page.keyboard.down('Control');
    }
    await this.page.mouse.click(absX, absY);
    if (modifiers?.ctrlKey) {
      await this.page.keyboard.up('Control');
    }
    await this.page.waitForTimeout(100);
  }

  /** Double-click at (timestampMs, channelIndex) to create a keyframe. */
  async doubleClickAt(timestampMs: number, channelIndex: number): Promise<void> {
    const pos = await this.getPosition(timestampMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.dblclick(box.x + pos.x, box.y + pos.y);
    await this.page.waitForTimeout(100);
  }

  /** Right-click at (timestampMs, channelIndex). */
  async rightClickAt(timestampMs: number, channelIndex: number): Promise<void> {
    const pos = await this.getPosition(timestampMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.click(box.x + pos.x, box.y + pos.y, { button: 'right' });
    await this.page.waitForTimeout(100);
  }

  /** Drag from one timestamp to another on the same channel. */
  async dragKeyframe(fromMs: number, toMs: number, channelIndex: number): Promise<void> {
    const fromPos = await this.getPosition(fromMs, channelIndex);
    const toPos = await this.getPosition(toMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');

    const fromX = box.x + fromPos.x;
    const fromY = box.y + fromPos.y;
    const toX = box.x + toPos.x;
    const toY = box.y + toPos.y;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.page.mouse.move(
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
      );
    }
    await this.page.mouse.up();
    await this.page.waitForTimeout(100);
  }

  /** Draw a selection rectangle from (fromMs, fromCh) to (toMs, toCh). */
  async selectRect(fromMs: number, fromCh: number, toMs: number, toCh: number): Promise<void> {
    const fromPos = await this.getPosition(fromMs, fromCh);
    const toPos = await this.getPosition(toMs, toCh);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');

    const startX = box.x + Math.max(0, fromPos.x - 20);
    const startY = box.y + fromPos.y - CHANNEL_LANE_HEIGHT / 2 + 2;
    const endX = box.x + toPos.x + 20;
    const endY = box.y + toPos.y + CHANNEL_LANE_HEIGHT / 2 - 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.page.mouse.move(
        startX + (endX - startX) * t,
        startY + (endY - startY) * t,
      );
    }
    await this.page.mouse.up();
    await this.page.waitForTimeout(100);
  }

  /** Click empty space on the canvas to deselect everything. */
  async clickEmpty(): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.click(box.x + box.width - 20, box.y + RULER_HEIGHT + 10);
    await this.page.waitForTimeout(100);
  }

  /** Read selected keyframe IDs from timelineStore. */
  async getSelectedKeyframeIds(): Promise<string[]> {
    return this.page.evaluate(() => {
      return (window as any).__stores.timelineStore.selectedKeyframeIds;
    });
  }

  /** Read selected effect IDs from timelineStore. */
  async getSelectedEffectIds(): Promise<string[]> {
    return this.page.evaluate(() => {
      return (window as any).__stores.timelineStore.selectedEffectIds;
    });
  }

  /** Read all keyframes from projectStore. */
  async getKeyframes(): Promise<Array<{ id: string; channelId: string; timestampMs: number }>> {
    return this.page.evaluate(() => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      return kfs.map((kf: any) => ({ id: kf.id, channelId: kf.channelId, timestampMs: kf.timestampMs }));
    });
  }

  /** Read a specific keyframe by ID. */
  async getKeyframe(id: string): Promise<any> {
    return this.page.evaluate((kfId: string) => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      const kf = kfs.find((k: any) => k.id === kfId);
      return kf ? JSON.parse(JSON.stringify(kf)) : null;
    }, id);
  }

  /** Read the number of keyframes. */
  async getKeyframeCount(): Promise<number> {
    return this.page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.keyframes.length ?? 0;
    });
  }

  /** Read pxPerMs (for zoom assertions). */
  async getPxPerMs(): Promise<number> {
    return this.page.evaluate(() => {
      return (window as any).__stores.timelineStore.pxPerMs;
    });
  }
}
