import { encodeTrack, MAX_TRACK_BYTES } from './encode';
import type { ProjectSidecar, Track } from './types';
import { validateTrack } from './validate';

export const AUTOSAVE_INTERVAL_MS = 30_000;

export interface CrashRecord {
  key: string;
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
  crash: CrashRecord | null
): 'server' | 'crash' {
  if (!crash || !crash.dirty) return 'server';
  if (crash.savedAt > serverUpdatedAt) return 'crash';
  return 'server';
}

export function sidecarDocument(input: ProjectSidecar): ProjectSidecar {
  return {
    version: 1,
    itemId: input.itemId,
    trackId: input.trackId,
    sceneMarkers: input.sceneMarkers,
    channelGroups: input.channelGroups,
  };
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
      { method: 'POST', path: '/OpenLightFX/Tracks/Select' },
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
