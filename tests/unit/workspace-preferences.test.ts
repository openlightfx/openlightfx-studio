import { describe, expect, it } from 'vitest';
import {
  clampWorkspaceValue,
  readWorkspacePreferences,
  WORKSPACE_PREFERENCES_KEY,
  writeWorkspacePreferences,
} from '../../src/lib/studio/workspace-preferences';

describe('ED2-026 workspace preferences', () => {
  it('clamps finite sizes and rejects invalid values', () => {
    expect(clampWorkspaceValue('inspectorWidth', 900, 1200)).toBe(520);
    expect(clampWorkspaceValue('timelineHeight', 100, 800)).toBe(210);
    expect(clampWorkspaceValue('timelineHeight', Number.NaN, 800)).toBe(300);
  });

  it('round-trips only versioned local workspace sizes and falls back on corrupt data', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeWorkspacePreferences(storage, { version: 1, inspectorWidth: 420, timelineHeight: 360 });
    expect(readWorkspacePreferences(storage)).toEqual({
      version: 1,
      inspectorWidth: 420,
      timelineHeight: 360,
    });
    values.set(WORKSPACE_PREFERENCES_KEY, '{bad');
    expect(readWorkspacePreferences(storage)).toEqual({
      version: 1,
      inspectorWidth: 340,
      timelineHeight: 300,
    });
    values.set(WORKSPACE_PREFERENCES_KEY, '{"version":99,"inspectorWidth":500}');
    expect(readWorkspacePreferences(storage).inspectorWidth).toBe(340);
  });
});
