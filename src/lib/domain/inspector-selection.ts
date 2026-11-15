import type { Keyframe } from './types';

export type SelectionValue<T> =
  | { kind: 'empty' }
  | { kind: 'mixed' }
  | { kind: 'uniform'; value: T };

export function selectionValue<T>(
  keys: readonly Keyframe[],
  read: (key: Keyframe) => T
): SelectionValue<T> {
  if (!keys.length) return { kind: 'empty' };
  const value = read(keys[0]);
  return keys.every((key) => Object.is(read(key), value))
    ? { kind: 'uniform', value }
    : { kind: 'mixed' };
}

/** Mixed is presentation state, never an authored sentinel or a first-key fallback. */
export function inspectorSelection(keys: readonly Keyframe[], ids: readonly string[]) {
  const selectedIds = new Set(ids);
  const selected = keys.filter((key) => selectedIds.has(key.id));
  const field = <T>(read: (key: Keyframe) => T) => selectionValue(selected, read);
  return {
    count: selected.length,
    startMs: selected.length ? Math.min(...selected.map((key) => key.timestampMs)) : null,
    endMs: selected.length ? Math.max(...selected.map((key) => key.timestampMs)) : null,
    red: field((key) => key.color.r),
    green: field((key) => key.color.g),
    blue: field((key) => key.color.b),
    hex: field((key) =>
      [key.color.r, key.color.g, key.color.b]
        .map((part) => part.toString(16).padStart(2, '0'))
        .join('')
    ),
    mode: field((key) => key.colorMode),
    kelvin: field((key) => key.colorTemperature),
    brightness: field((key) => key.brightness),
    interpolation: field((key) => key.interpolation),
    transitionMs: field((key) => key.transitionMs),
    powerOn: field((key) => key.powerOn),
  };
}
