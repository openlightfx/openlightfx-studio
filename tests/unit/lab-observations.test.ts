import { expect, it } from 'vitest';
import { assertObservation, matchesState } from '../../scripts/fullstack/observations.mjs';

const red = { r: 255, g: 0, b: 0, brightness: 100, power: true };
const off = { r: 0, g: 0, b: 0, brightness: 0, power: false };
const samples = [
  { event_id: 1, bulbs: { left: red, right: off } },
  { event_id: 2, bulbs: { left: off, right: red } },
];
it('rejects stale matches and wrong bulbs/colors', () => {
  expect(() => assertObservation(samples, { after: 1, bulbs: { left: red } })).toThrow();
  expect(() =>
    assertObservation(samples, { after: 0, bulbs: { left: { ...red, b: 255 } } })
  ).toThrow();
  expect(() => assertObservation(samples, { after: 0, bulbs: { absent: red } })).toThrow();
});
it('requires simultaneous states, including bulbs that must stay dark', () => {
  expect(assertObservation(samples, { after: 0, bulbs: { left: red, right: off } }).event_id).toBe(
    1
  );
  expect(() =>
    assertObservation(samples, { after: 0, bulbs: { left: red, right: red } })
  ).toThrow();
});
it('checks brightness, power and effective displayed color with tolerance', () => {
  expect(matchesState({ ...red, r: 254 }, red)).toBe(true);
  expect(matchesState({ ...red, power: false }, red)).toBe(false);
  expect(
    matchesState(
      { ...red, display_color: { r: 0, g: 0, b: 0 } },
      { display_color: { r: 255, g: 0, b: 0 } }
    )
  ).toBe(false);
  expect(matchesState({}, red)).toBe(false);
});
