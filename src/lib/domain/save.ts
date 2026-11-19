import { encodeTrack, MAX_TRACK_BYTES } from './encode';
import type { ProjectSidecar, Track } from './types';
import { validateTrack } from './validate';

export const AUTOSAVE_INTERVAL_MS = 30_000;

export interface CrashRecord {
  key: string;
  itemId: string;
  trackId: string;
  revision: string;
  track: Track;
  sidecar: ProjectSidecar;
  playheadMs: number;
  scrollX: number;
  savedAt: number;
  dirty: boolean;
  storage: 'indexeddb';
}

export function crashKey(itemId: string, trackId: string): string {
  return `${itemId}:${trackId}`;
}

export function makeCrashRecord(input: Omit<CrashRecord, 'storage'>): CrashRecord {
  return { ...input, storage: 'indexeddb' };
}

export function shouldFlushAutosave(elapsedMs: number, dirty: boolean): boolean {
  return dirty && elapsedMs >= AUTOSAVE_INTERVAL_MS;
}

export function flushOnPageHide(dirty: boolean): boolean {
  return dirty;
}

export function chooseLoadSource(
  serverUpdatedAt: number,
  crash: CrashRecord | null,
  identity?: { itemId: string; trackId: string }
): 'server' | 'crash' {
  if (
    !crash ||
    !crash.dirty ||
    !crash.revision ||
    (identity &&
      (crash.itemId !== identity.itemId ||
        crash.trackId !== identity.trackId ||
        crash.key !== crashKey(identity.itemId, identity.trackId) ||
        crash.sidecar?.itemId !== identity.itemId ||
        crash.sidecar?.trackId !== identity.trackId))
  )
    return 'server';
  if (crash.savedAt > serverUpdatedAt) return 'crash';
  return 'server';
}

export function clampRecoveryPosition(input: {
  playheadMs: number;
  scrollX: number;
  durationMs: number;
  pxPerMs: number;
  viewportWidth: number;
}): { playheadMs: number; scrollX: number } {
  const finite = (value: number) => (Number.isFinite(value) ? value : 0);
  const durationMs = Math.max(0, finite(input.durationMs));
  const contentWidth = durationMs * Math.max(0, finite(input.pxPerMs));
  return {
    playheadMs: Math.min(durationMs, Math.max(0, finite(input.playheadMs))),
    scrollX: Math.min(
      Math.max(0, contentWidth - Math.max(0, input.viewportWidth)),
      Math.max(0, finite(input.scrollX))
    ),
  };
}

const reservedSidecarFields = new Set([
  'version',
  'itemid',
  'trackid',
  'scenemarkers',
  'channelgroups',
  'undo',
  'undostack',
  'duration',
  'auth',
  'authstate',
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'credentials',
]);
const groupModes = new Set(['mirror', 'spread', 'alternate']);

export class InvalidProjectSidecarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProjectSidecarError';
  }
}

/** Validate the plugin's v1 contract while retaining its allowed opaque top-level fields. */
export function parseProjectSidecar(
  value: unknown,
  identity: { itemId: string; trackId: string },
  options: { allowItemIdRebind?: boolean } = {}
): ProjectSidecar {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidProjectSidecarError('Project sidecar must be a JSON object');
  const input = value as Record<string, unknown>;
  if (input.version !== 1) throw new InvalidProjectSidecarError('Project sidecar version is not 1');
  if (input.trackId !== identity.trackId)
    throw new InvalidProjectSidecarError('Project sidecar identity does not match this track');
  if (
    input.itemId !== identity.itemId &&
    (!options.allowItemIdRebind || typeof input.itemId !== 'string' || input.itemId.length === 0)
  )
    throw new InvalidProjectSidecarError('Project sidecar identity does not match this track');
  // Scene markers live in the plugin's scene-cut document; any old `sceneMarkers` is ignored
  // here (the plugin migrates it) and stripped by sidecarDocument as a reserved field.
  const channelGroups = input.channelGroups ?? [];
  if (!Array.isArray(channelGroups))
    throw new InvalidProjectSidecarError('Project channel groups must be an array');
  for (const group of channelGroups) {
    if (!group || typeof group !== 'object' || Array.isArray(group))
      throw new InvalidProjectSidecarError('Project channel group is malformed');
    const mode = (group as Record<string, unknown>).mode;
    if (typeof mode !== 'string' || !groupModes.has(mode))
      throw new InvalidProjectSidecarError('Project channel group mode is unsupported');
  }
  return sidecarDocument({
    ...input,
    version: 1,
    itemId: identity.itemId,
    trackId: identity.trackId,
    channelGroups: channelGroups as ProjectSidecar['channelGroups'],
  });
}

export function sidecarDocument(input: ProjectSidecar): ProjectSidecar {
  const output: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input)) {
    const normalizedField = field.toLowerCase().replace(/[_-]/g, '');
    if (!reservedSidecarFields.has(normalizedField)) output[field] = value;
  }
  output.version = 1;
  output.itemId = input.itemId;
  output.trackId = input.trackId;
  output.channelGroups = input.channelGroups;
  return output as ProjectSidecar;
}

export interface SaveCheckpoint {
  itemId: string;
  trackId: string;
  revision: string;
}

export function matchesSaveCheckpoint(
  current: SaveCheckpoint | null,
  saved: SaveCheckpoint | null
): boolean {
  return Boolean(
    current &&
    saved &&
    current.itemId === saved.itemId &&
    current.trackId === saved.trackId &&
    current.revision === saved.revision
  );
}

export interface SavePlan {
  blocked: boolean;
  message: string | null;
  ruleIds: string[];
  requests: { method: 'PUT' | 'POST'; path: string }[];
}

export function planHostedSave(input: {
  track: Track;
  sidecar: ProjectSidecar;
  itemId: string;
  trackId: string;
  durationKnown: boolean;
}): SavePlan {
  if (!input.durationKnown) {
    return {
      blocked: true,
      message: 'The movie duration is unknown',
      ruleIds: [],
      requests: [],
    };
  }
  const errors = validateTrack(input.track);
  if (input.track.channels.length === 0) {
    return {
      blocked: true,
      message: errors.find((error) => error.startsWith('V-011')) ?? 'V-011',
      ruleIds: ['V-011'],
      requests: [],
    };
  }
  if (errors.length > 0) {
    return {
      blocked: true,
      message: errors[0],
      ruleIds: errors.map((error) => error.split(':')[0]),
      requests: [],
    };
  }
  const bytes = encodeTrack(input.track);
  if (bytes.byteLength > MAX_TRACK_BYTES) {
    return { blocked: true, message: 'Track is larger than 32 MiB', ruleIds: [], requests: [] };
  }
  const item = encodeURIComponent(input.itemId);
  return {
    blocked: false,
    message: null,
    ruleIds: [],
    requests: [
      { method: 'PUT', path: `/OpenLightFX/Studio/Tracks/${input.trackId}?itemId=${item}` },
      { method: 'PUT', path: `/OpenLightFX/Studio/Projects/${input.trackId}?itemId=${item}` },
    ],
  };
}

export function durationDisagrees(movieMs: number, trackMs: number): boolean {
  return movieMs > 0 && Math.abs(movieMs - trackMs) / movieMs > 0.02;
}

export function importDurationWarning(
  movieMs: number,
  trackMs: number,
  imported: boolean
): boolean {
  return imported && durationDisagrees(movieMs, trackMs);
}

export const SELECT_TRACK_PATH = 'lightfx/proxy-fixture.lightfx';
