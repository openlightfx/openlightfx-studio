import { describe, expect, it, vi } from 'vitest';
import { createEdgeAutoscrollController } from '../../src/lib/studio/edge-autoscroll';

describe('ED2-010 @unit edge autoscroll controller', () => {
  it('uses one bounded time-based loop and clamps to both viewport ends', () => {
    let now = 0;
    let nextId = 0;
    let scroll = 50;
    const callbacks = new Map<number, (time: number) => void>();
    const controller = createEdgeAutoscrollController({
      getViewport: () => ({ left: 0, width: 100 }),
      getScroll: () => scroll,
      setScroll: (value) => {
        scroll = value;
      },
      getMaxScroll: () => 100,
      maxSpeed: 200,
      edgeSize: 20,
      requestFrame: (cb) => {
        const id = ++nextId;
        callbacks.set(id, cb);
        return id;
      },
      cancelFrame: (id) => callbacks.delete(id),
    });
    const step = (time: number) => {
      const entry = [...callbacks.entries()][0];
      if (!entry) return;
      callbacks.delete(entry[0]);
      entry[1](time);
    };
    controller.update(100);
    expect(callbacks.size).toBe(1);
    step(now);
    now += 100;
    step(now);
    expect(scroll).toBe(60);
    expect(callbacks.size).toBe(1);
    controller.update(100);
    expect(callbacks.size).toBe(1);
    for (let i = 0; i < 10; i++) {
      now += 100;
      step(now);
    }
    expect(scroll).toBe(100);
    expect(callbacks.size).toBe(0);
    controller.update(0);
    now += 100;
    step(now);
    now += 100;
    step(now);
    expect(scroll).toBe(90);
    controller.cancel();
    expect(callbacks.size).toBe(0);
    controller.update(0);
    controller.cleanup();
    controller.update(100);
    expect(callbacks.size).toBe(0);
  });

  it('cancels the scheduled callback on teardown', () => {
    const callbacks = new Map<number, Function>();
    const cancel = vi.fn((id: number) => callbacks.delete(id));
    const controller = createEdgeAutoscrollController({
      getViewport: () => ({ left: 0, width: 100 }),
      getScroll: () => 0,
      setScroll: () => {},
      getMaxScroll: () => 100,
      requestFrame: (cb) => {
        callbacks.set(1, cb);
        return 1;
      },
      cancelFrame: cancel,
    });
    controller.update(99);
    controller.cleanup();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(callbacks.size).toBe(0);
  });
});
