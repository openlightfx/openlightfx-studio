import { describe, expect, it } from 'vitest';
import { framePosition } from '../../src/lib/studio/frame-position';

function media(currentTime = 0, seeking = false, readyState = 2) {
  return Object.assign(new EventTarget(), {
    currentTime,
    seeking,
    readyState,
  }) as unknown as HTMLVideoElement;
}

describe('PROP-004 settled movie frame position', () => {
  it('uses the paused native position, not a queued future Studio target', async () => {
    expect(await framePosition(media(0), 7000, new AbortController().signal)).toBe(0);
  });
  it('does not round forward across a scene cut', async () => {
    expect(await framePosition(media(1.9995), 2000, new AbortController().signal)).toBe(1999);
    expect(await framePosition(media(2.999999), 3000, new AbortController().signal)).toBe(3000);
  });
  it('accepts completed seeks adjusted by more than one frame', async () => {
    const video = media(3, true);
    let finished = false;
    const result = framePosition(video, 3500, new AbortController().signal).then((time) => {
      finished = true;
      return time;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    Object.assign(video, { currentTime: 3.4, seeking: false });
    video.dispatchEvent(new Event('seeked'));
    expect(await result).toBe(3400);
  });
  it('ignores an older seeked event while another native seek is still active', async () => {
    const video = media(3, true);
    const result = framePosition(video, 3500, new AbortController().signal);
    video.dispatchEvent(new Event('seeked'));
    Object.assign(video, { currentTime: 3.5, seeking: false });
    video.dispatchEvent(new Event('seeked'));
    expect(await result).toBe(3500);
  });
  it('cancels a frame capture waiting for native seeking', async () => {
    const controller = new AbortController();
    const result = framePosition(media(3, true), 3500, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects a replaced video resource rather than sampling its old position', async () => {
    const video = media(3, true);
    const result = framePosition(video, 3500, new AbortController().signal);
    video.dispatchEvent(new Event('emptied'));
    await expect(result).rejects.toThrow('position could not be read');
  });
  it('allows original PNG extraction before any proxy frame is available', async () => {
    expect(await framePosition(media(0, false, 1), 3500, new AbortController().signal)).toBe(3500);
  });
});
