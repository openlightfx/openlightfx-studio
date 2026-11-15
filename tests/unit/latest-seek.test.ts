import { describe, expect, it } from 'vitest';
import { LatestSeekScheduler } from '$lib/studio/latest-seek';

describe('ED2-011 @unit LatestSeekScheduler', () => {
  it('coalesces a frame of ruler targets and retains the newest target while native seek is active', () => {
    const callbacks: FrameRequestCallback[] = [];
    const dispatched: number[] = [];
    const scheduler = new LatestSeekScheduler(
      (target) => {
        dispatched.push(target);
        return true;
      },
      (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      () => undefined
    );

    scheduler.request(100);
    scheduler.request(200);
    scheduler.request(300);
    expect(dispatched).toEqual([]);
    callbacks.shift()?.(0);
    expect(dispatched).toEqual([300]);

    scheduler.request(400);
    scheduler.request(500);
    expect(dispatched).toEqual([300]);
    scheduler.complete();
    callbacks.shift()?.(16);
    expect(dispatched).toEqual([300, 500]);
    scheduler.complete();
    expect(scheduler.pendingTarget).toBeNull();
  });

  it('keeps an unreachable growing-proxy target until a later retry can dispatch it', () => {
    const callbacks: FrameRequestCallback[] = [];
    let reachable = false;
    const dispatched: number[] = [];
    const scheduler = new LatestSeekScheduler(
      (target) => {
        if (!reachable) return false;
        dispatched.push(target);
        return true;
      },
      (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      () => undefined
    );

    scheduler.request(8_000);
    callbacks.shift()?.(0);
    expect(dispatched).toEqual([]);
    expect(scheduler.pendingTarget).toBe(8_000);
    reachable = true;
    scheduler.retry();
    callbacks.shift()?.(16);
    expect(dispatched).toEqual([8_000]);
  });
});
