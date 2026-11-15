export const WORKSPACE_DEFAULTS = { inspectorWidth: 340, timelineHeight: 300 } as const;
export const WORKSPACE_BOUNDS = {
  inspectorWidth: { min: 280, max: 520 },
  timelineHeight: { min: 210, max: 520 },
} as const;
export const WORKSPACE_PREFERENCES_KEY = 'openlightfx.editor.workspace.v1';

export type WorkspacePreferences = {
  version: 1;
  inspectorWidth: number;
  timelineHeight: number;
};

export function clampWorkspaceValue(
  key: 'inspectorWidth' | 'timelineHeight',
  value: unknown,
  available: number
): number {
  const bounds = WORKSPACE_BOUNDS[key];
  const max = Math.min(bounds.max, Math.max(bounds.min, available));
  if (typeof value !== 'number' || !Number.isFinite(value)) return WORKSPACE_DEFAULTS[key];
  return Math.round(Math.max(bounds.min, Math.min(max, value)));
}

export function readWorkspacePreferences(storage: Pick<Storage, 'getItem'>): WorkspacePreferences {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WORKSPACE_PREFERENCES_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1)
      return { version: 1, ...WORKSPACE_DEFAULTS };
    const values = parsed as Record<string, unknown>;
    return {
      version: 1,
      inspectorWidth: clampWorkspaceValue('inspectorWidth', values.inspectorWidth, 1200),
      timelineHeight: clampWorkspaceValue('timelineHeight', values.timelineHeight, 1000),
    };
  } catch {
    return { version: 1, ...WORKSPACE_DEFAULTS };
  }
}

export function writeWorkspacePreferences(
  storage: Pick<Storage, 'setItem'>,
  preferences: WorkspacePreferences
): void {
  try {
    storage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Workspace preferences are optional; storage denial never blocks editing.
  }
}
