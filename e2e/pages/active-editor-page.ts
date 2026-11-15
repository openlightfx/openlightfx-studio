import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import { decodeTrack, type Channel, type Track } from '../../src/lib/domain';

const CHANNEL_LABELS: Record<string, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
  'surround-left': 'Surround Left',
  'surround-right': 'Surround Right',
  ambient: 'Ambient',
};

/** Active routed-editor interactions backed by visible DOM and exported documents. */
export class ActiveEditorPage {
  constructor(readonly page: Page) {}

  lane(channelId: Channel['id']): Locator {
    const label = CHANNEL_LABELS[channelId];
    if (!label) throw new Error(`Unknown track channel: ${channelId}`);
    return this.page.getByRole('button', { name: new RegExp(`^${label} timeline lane,`) });
  }

  async selectKeyframe(channelId: Channel['id'], authoredTimeMs: number): Promise<void> {
    const lane = this.lane(channelId);
    const ruler = this.page.getByRole('slider', { name: 'Timeline ruler' });
    const scroller = this.page.locator('.timeline-scroll');
    await expect(lane).toHaveCount(1);
    const durationMs = Number(await ruler.getAttribute('aria-valuemax'));
    const rulerBounds = await ruler.boundingBox();
    const laneBounds = await lane.boundingBox();
    if (
      !rulerBounds ||
      !laneBounds ||
      !(durationMs > 0) ||
      authoredTimeMs < 0 ||
      authoredTimeMs > durationMs
    )
      throw new Error(`Cannot locate ${channelId} keyframe at ${authoredTimeMs} ms`);

    const pxPerMs = rulerBounds.width / durationMs;
    const viewportWidth = await lane.evaluate((node) => node.clientWidth);
    const scrollMetrics = await scroller.evaluate((node) => ({
      max: node.scrollWidth - node.clientWidth,
      left: node.scrollLeft,
    }));
    const targetScroll = Math.max(
      0,
      Math.min(authoredTimeMs * pxPerMs - viewportWidth / 2, scrollMetrics.max)
    );
    await scroller.evaluate((node, left) => {
      node.scrollLeft = left;
    }, targetScroll);
    await expect
      .poll(() => scroller.evaluate((node) => node.scrollLeft))
      .toBeCloseTo(targetScroll, 0);

    let scrollLeft = await scroller.evaluate((node) => node.scrollLeft);
    await expect
      .poll(() => lane.evaluate((node) => Number.parseFloat(getComputedStyle(node).left)))
      .toBeCloseTo(scrollLeft, 0);
    scrollLeft = await scroller.evaluate((node) => node.scrollLeft);
    const canvasBounds = await lane.boundingBox();
    if (!canvasBounds) throw new Error(`The ${channelId} timeline lane is not visible`);
    const canvasX = authoredTimeMs * pxPerMs - scrollLeft;
    if (canvasX < 0 || canvasX > canvasBounds.width)
      throw new Error(`${channelId} keyframe at ${authoredTimeMs} ms is outside the visible lane`);

    await this.page.mouse.click(canvasBounds.x + canvasX, canvasBounds.y + canvasBounds.height / 2);
    await expect(this.page.getByLabel('Keyframe time', { exact: true })).toHaveValue(
      formatElapsed(authoredTimeMs)
    );
  }

  async exportTrack(): Promise<Track> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByRole('button', { name: 'File', exact: true }).click();
    await this.page.getByRole('menuitem', { name: /^Export/ }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    if (!filePath) throw new Error('Track export did not provide a downloaded file');
    return decodeTrack(fs.readFileSync(filePath));
  }

  async proxyCurrentTime(): Promise<number> {
    return this.page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime);
  }

  async expectProxyTime(seconds: number, precision = 1): Promise<void> {
    await expect.poll(() => this.proxyCurrentTime()).toBeCloseTo(seconds, precision);
  }
}

function formatElapsed(timeMs: number): string {
  const value = Math.max(0, Math.round(timeMs));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  const millis = value % 1000;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
