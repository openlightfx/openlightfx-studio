import { describe, expect, it } from 'vitest';
import {
  OVERLAY_PREFERENCE_KEY,
  readOverlayPreference,
  writeOverlayPreference,
} from '../../src/lib/studio/overlay-preference';

describe('ED2-025 @unit independent overlay preference', () => {
  it('accepts only explicit boolean values and defaults malformed or missing data to visible', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readOverlayPreference(storage)).toBe(true);
    values.set(OVERLAY_PREFERENCE_KEY, 'false');
    expect(readOverlayPreference(storage)).toBe(false);
    values.set(OVERLAY_PREFERENCE_KEY, 'unexpected');
    expect(readOverlayPreference(storage)).toBe(true);
  });

  it('writes only the view preference and degrades safely when storage is denied', () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => values.set(key, value) };
    expect(writeOverlayPreference(storage, false)).toBe(true);
    expect([...values.entries()]).toEqual([[OVERLAY_PREFERENCE_KEY, 'false']]);
    expect(
      writeOverlayPreference(
        {
          setItem: () => {
            throw new Error('denied');
          },
        },
        true
      )
    ).toBe(false);
  });
});
