// ============================================================
// Project I/O Service — save/load project files, export/import .lightfx
// ============================================================

import type { LightFXTrack, ChannelGroup, Keyframe, EffectKeyframe } from '$lib/types/index.js';
import type { ProjectFile } from '$lib/types/project.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import { encodeLightFXTrack, decodeLightFXTrack } from './protobuf.js';
import { validateTrack } from './validation.js';
import { computeSafetyInfo } from './safety.js';

// ---- Project file (.lightfx-project) ----

/**
 * Save a project file by triggering a download of JSON .lightfx-project.
 * Uses the File System Access API (showSaveFilePicker) when available,
 * falls back to the <a download> trick.
 */
export async function saveProjectFile(project: ProjectFile): Promise<void> {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const fileName =
    sanitizeFileName(project.track?.metadata?.title || 'untitled') + '.lightfx-project';

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'OpenLightFX Project',
            accept: { 'application/json': ['.lightfx-project'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: unknown) {
      // User cancelled or API unavailable — fall through to download fallback
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  // Fallback: <a download> trick
  triggerDownload(blob, fileName);
}

/**
 * Load a project file from a File object. Returns parsed ProjectFile.
 */
export async function loadProjectFile(file: File): Promise<ProjectFile> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectFile;

  if (!parsed.formatVersion || !parsed.track) {
    throw new Error('Invalid project file: missing formatVersion or track data.');
  }

  return parsed;
}

// ---- .lightfx export/import ----

/**
 * Export a LightFXTrack to binary .lightfx protobuf format.
 * Expands channel groups into per-channel keyframes, recomputes safety info,
 * validates the track, and encodes to protobuf.
 *
 * Throws on validation errors.
 */
export function exportLightFXTrack(
  track: LightFXTrack,
  channelGroups: ChannelGroup[],
  sceneMarkers: SceneMarker[]
): Uint8Array {
  // Expand channel groups into per-channel keyframes
  const expandedTrack = expandChannelGroups(track, channelGroups);

  // If track duration is unset, derive it from the latest keyframe/effect timestamp
  if (!expandedTrack.metadata.durationMs || expandedTrack.metadata.durationMs <= 0) {
    const kfMax = expandedTrack.keyframes.reduce((max, kf) => Math.max(max, kf.timestampMs), 0);
    const efMax = expandedTrack.effectKeyframes.reduce(
      (max, ef) => Math.max(max, ef.timestampMs + ef.durationMs),
      0
    );
    const derived = Math.max(kfMax, efMax);
    if (derived > 0) {
      expandedTrack.metadata = { ...expandedTrack.metadata, durationMs: derived };
    }
  }

  // Recompute safety info
  expandedTrack.safetyInfo = computeSafetyInfo(expandedTrack);

  // Sort keyframes by channel then timestamp
  expandedTrack.keyframes.sort((a, b) =>
    a.channelId === b.channelId
      ? a.timestampMs - b.timestampMs
      : a.channelId.localeCompare(b.channelId)
  );

  // Sort effect keyframes similarly
  expandedTrack.effectKeyframes.sort((a, b) =>
    a.channelId === b.channelId
      ? a.timestampMs - b.timestampMs
      : a.channelId.localeCompare(b.channelId)
  );

  // Validate
  const result = validateTrack(expandedTrack);
  if (!result.valid) {
    const errorMessages = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `[${i.ruleId}] ${i.message}`)
      .join('\n');
    throw new Error(`Track validation failed:\n${errorMessages}`);
  }

  return encodeLightFXTrack(expandedTrack);
}

/**
 * Import a .lightfx binary file and decode it to a LightFXTrack.
 */
export async function importLightFXFile(file: File): Promise<LightFXTrack> {
  const buffer = await file.arrayBuffer();
  return decodeLightFXTrack(new Uint8Array(buffer));
}

// ---- Channel group expansion ----

/**
 * Expand channel groups into explicit per-channel keyframes.
 * For each group, the primary channel's keyframes are replicated to member channels
 * with offsets applied based on the group mode.
 */
function expandChannelGroups(track: LightFXTrack, channelGroups: ChannelGroup[]): LightFXTrack {
  if (!channelGroups || channelGroups.length === 0) {
    return deepCloneTrack(track);
  }

  const result = deepCloneTrack(track);

  for (const group of channelGroups) {
    if (group.channelIds.length < 2) continue;

    const primaryChannelId = group.channelIds[0];
    const primaryKeyframes = result.keyframes.filter((kf) => kf.channelId === primaryChannelId);
    const primaryEffects = result.effectKeyframes.filter((ek) => ek.channelId === primaryChannelId);

    for (let i = 1; i < group.channelIds.length; i++) {
      const targetChannelId = group.channelIds[i];
      const offset = group.offsets.find((o) => o.channelId === targetChannelId);
      const timingOffset = offset?.timingOffsetMs ?? 0;

      // Skip channels that already have explicit keyframes
      const existingKfs = result.keyframes.filter((kf) => kf.channelId === targetChannelId);
      if (existingKfs.length > 0) continue;

      // Replicate keyframes
      for (const kf of primaryKeyframes) {
        result.keyframes.push({
          ...kf,
          id: `${kf.id}_group_${targetChannelId}`,
          channelId: targetChannelId,
          timestampMs: Math.max(0, kf.timestampMs + timingOffset),
        });
      }

      // Replicate effects
      const existingEffects = result.effectKeyframes.filter(
        (ek) => ek.channelId === targetChannelId
      );
      if (existingEffects.length > 0) continue;

      for (const ek of primaryEffects) {
        result.effectKeyframes.push({
          ...ek,
          id: `${ek.id}_group_${targetChannelId}`,
          channelId: targetChannelId,
          timestampMs: Math.max(0, ek.timestampMs + timingOffset),
        });
      }
    }
  }

  return result;
}

// ---- Helpers ----

function deepCloneTrack(track: LightFXTrack): LightFXTrack {
  return {
    version: track.version,
    metadata: {
      ...track.metadata,
      movieReference: { ...track.metadata.movieReference },
      tags: [...track.metadata.tags],
    },
    channels: track.channels.map((ch) => ({ ...ch, defaultColor: { ...ch.defaultColor } })),
    keyframes: track.keyframes.map((kf) => ({ ...kf, color: { ...kf.color } })),
    effectKeyframes: track.effectKeyframes.map((ek) => ({
      ...ek,
      primaryColor: { ...ek.primaryColor },
      secondaryColor: { ...ek.secondaryColor },
      fallbackColor: { ...ek.fallbackColor },
      effectParams: { params: { ...(ek.effectParams?.params ?? {}) } },
    })),
    safetyInfo: { ...track.safetyInfo },
  };
}

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9 _\-()]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'untitled'
  );
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
