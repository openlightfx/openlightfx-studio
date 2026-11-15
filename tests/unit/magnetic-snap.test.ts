import { expect, it } from 'vitest';
import { magneticSnap, type SnapTarget } from '../../src/lib/domain/magnetic-snap';

it('ED2-017 @unit uses an inclusive eight CSS pixel radius at every scale', () => {
  for (const scale of [0.001, 0.01, 0.1, 1]) {
    const target: SnapTarget = { timeMs: 20000, kind: 'tick', label: 'Tick' };
    expect(magneticSnap(20000 + 8 / scale, scale, [target])).toEqual(target);
    expect(magneticSnap(20000 + 8.1 / scale, scale, [target])).toBeNull();
  }
});
it('ED2-017 @unit resolves ties by priority then earlier time independently of enumeration', () => {
  const targets: SnapTarget[] = [
    { timeMs: 1040, kind: 'tick', label: 'Tick' },
    { timeMs: 960, kind: 'keyframe', label: 'Key' },
    { timeMs: 1040, kind: 'playhead', label: 'Playhead' },
  ];
  expect(magneticSnap(1000, 0.1, targets)?.kind).toBe('playhead');
  expect(magneticSnap(1000, 0.1, targets.toReversed())?.kind).toBe('playhead');
  const ticks = targets.slice(0, 2).map((target) => ({ ...target, kind: 'tick' as const }));
  expect(magneticSnap(1000, 0.1, ticks)?.timeMs).toBe(960);
});
it('ED2-017 @unit skips invalid group deltas instead of advertising a clamped snap', () => {
  const targets: SnapTarget[] = [
    { timeMs: 1040, kind: 'playhead', label: 'Invalid group delta' },
    { timeMs: 1060, kind: 'keyframe', label: 'Valid group delta' },
  ];
  expect(magneticSnap(1000, 0.1, targets, (time) => time === 1060)?.timeMs).toBe(1060);
  expect(magneticSnap(1000, 0.1, targets, () => false)).toBeNull();
});
