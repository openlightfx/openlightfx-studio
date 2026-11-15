import { expect, it } from 'vitest';
import {
  AuditionLoop,
  emptyAuditionRange,
  restoreAuditionRange,
  rangeReason,
} from '../../src/lib/domain/audition-range';

it('ED2-029 @unit rejects invalid or corrupt local ranges without enabling loops', () => {
  expect(restoreAuditionRange('{', 10000)).toEqual(emptyAuditionRange());
  for (const range of [
    { startMs: 2000, endMs: 1000, loop: true },
    { startMs: -1, endMs: 1000, loop: true },
    { startMs: 0, endMs: 10001, loop: true },
  ]) {
    const restored = restoreAuditionRange(JSON.stringify(range), 10000);
    expect(restored.loop).toBe(false);
    expect(rangeReason(restored, 10000)).not.toBe('');
  }
});
it('ED2-029 @unit permits only one pending wrap and rearms only after native start acknowledgment', () => {
  const loop = new AuditionLoop();
  const range = { startMs: 1000, endMs: 2000, loop: true };
  expect(loop.sample(1999, true, range, 10000)).toBeNull();
  expect(loop.sample(2000, true, range, 10000)).toBe(1000);
  for (let event = 0; event < 100; event++)
    expect(loop.sample(2100, true, range, 10000)).toBeNull();
  expect(loop.sample(1000, true, range, 10000)).toBeNull();
  expect(loop.sample(2000, true, range, 10000)).toBe(1000);
  expect(loop.sample(2000, false, range, 10000)).toBeNull();
  expect(loop.sample(2000, true, { ...range, loop: false }, 10000)).toBeNull();
});
