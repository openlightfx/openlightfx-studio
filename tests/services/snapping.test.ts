import { describe, it, expect } from 'vitest';
import { findSnapPoint, computeSnapTargets, type SnapTarget } from '$lib/services/snapping.js';

describe('computeSnapTargets', () => {
  it('generates targets from keyframe timestamps', () => {
    const targets = computeSnapTargets(
      [{ timestampMs: 1000 }, { timestampMs: 2000 }] as any[],
      [],
      [],
      10000,
      24,
    );
    expect(targets.some((t) => t.timestampMs === 1000)).toBe(true);
    expect(targets.some((t) => t.timestampMs === 2000)).toBe(true);
  });

  it('generates second marks', () => {
    const targets = computeSnapTargets([], [], [], 3000, 24);
    expect(targets.some((t) => t.timestampMs === 0 && t.type === 'second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 1000 && t.type === 'second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 2000 && t.type === 'second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 3000 && t.type === 'second')).toBe(true);
  });

  it('generates 500ms marks', () => {
    const targets = computeSnapTargets([], [], [], 2000, 24);
    expect(targets.some((t) => t.timestampMs === 500 && t.type === 'half-second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 1500 && t.type === 'half-second')).toBe(true);
  });

  it('generates frame boundary marks', () => {
    const targets = computeSnapTargets([], [], [], 200, 24);
    // At 24fps, frames at ~41.67ms intervals
    expect(targets.some((t) => t.type === 'frame' && Math.abs(t.timestampMs - 41.667) < 1)).toBe(true);
  });

  it('includes scene markers', () => {
    const targets = computeSnapTargets(
      [],
      [],
      [{ id: 'sm-1', timestampMs: 5000, label: 'Scene 1', type: 'MARKER_MANUAL' }],
      10000,
      24,
    );
    expect(targets.some((t) => t.timestampMs === 5000 && t.type === 'scene-marker')).toBe(true);
  });
});

describe('findSnapPoint', () => {
  it('returns snap target within threshold', () => {
    const targets: SnapTarget[] = [{ timestampMs: 1000, type: 'keyframe' }];
    const result = findSnapPoint(1005, targets, 8, 0.1); // 8px threshold at 0.1 px/ms = 80ms
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(1000);
  });

  it('returns null when no target within threshold', () => {
    const targets: SnapTarget[] = [{ timestampMs: 1000, type: 'keyframe' }];
    const result = findSnapPoint(2000, targets, 8, 0.1);
    expect(result).toBeNull();
  });

  it('returns closest target', () => {
    const targets: SnapTarget[] = [
      { timestampMs: 1000, type: 'keyframe' },
      { timestampMs: 1010, type: 'second' },
    ];
    const result = findSnapPoint(1008, targets, 8, 0.1);
    expect(result!.timestampMs).toBe(1010);
  });
});
