import type { LightFXTrack } from '$lib/model/types';

export interface ValidationIssue {
  code: string;
  message: string;
}

const IMDB = /^tt\d{7,}$/;

/**
 * Same rules as OpenLightFX.Emby.Services.TrackParser.Validate.
 * A file that returns no issues is one the plugin will mark IsValid.
 */
export function validateTrack(track: LightFXTrack): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (track.version === 0 || track.version > 1) {
    errors.push({
      code: 'V-001',
      message: `Unsupported version ${track.version} (supported: 1)`
    });
  }
  if (!track.metadata) {
    errors.push({ code: 'V-002', message: 'Metadata is missing' });
    return errors;
  }
  const imdb = track.metadata.movieReference?.imdbId ?? '';
  if (imdb && !IMDB.test(imdb)) {
    errors.push({ code: 'V-003', message: `Invalid IMDB ID format: ${imdb}` });
  }
  if (track.metadata.durationMs === 0) {
    errors.push({ code: 'V-004', message: 'Duration must be > 0' });
  }
  if (track.channels.length === 0) {
    errors.push({ code: 'V-011', message: 'At least one channel is required' });
  }
  const channelIds = new Set<string>();
  for (const ch of track.channels) {
    if (channelIds.has(ch.id)) {
      errors.push({ code: 'V-005', message: `Duplicate channel ID: ${ch.id}` });
    }
    channelIds.add(ch.id);
  }

  const last = new Map<string, number>();
  for (const kf of track.keyframes) {
    if (!channelIds.has(kf.channelId)) {
      errors.push({
        code: 'V-006',
        message: `Keyframe ${kf.id} references invalid channel: ${kf.channelId}`
      });
    }
    const prev = last.get(kf.channelId);
    if (prev !== undefined && kf.timestampMs < prev) {
      errors.push({
        code: 'V-006',
        message: `Keyframe ${kf.id} in channel ${kf.channelId} is not sorted (timestamp ${kf.timestampMs} < ${prev})`
      });
    }
    last.set(kf.channelId, kf.timestampMs);
    if (kf.brightness > 100) {
      errors.push({
        code: 'V-007',
        message: `Keyframe ${kf.id} brightness ${kf.brightness} out of range [0, 100]`
      });
    }
    if (kf.color.r > 255 || kf.color.g > 255 || kf.color.b > 255) {
      errors.push({
        code: 'V-008',
        message: `Keyframe ${kf.id} has RGB value out of range [0, 255]`
      });
    }
    if (
      kf.colorMode === 'COLOR_TEMPERATURE' &&
      (kf.colorTemperature < 1000 || kf.colorTemperature > 10000)
    ) {
      errors.push({
        code: 'V-009',
        message: `Keyframe ${kf.id} color temperature ${kf.colorTemperature} out of range [1000, 10000]`
      });
    }
    if (track.metadata.durationMs > 0 && kf.timestampMs > track.metadata.durationMs) {
      errors.push({
        code: 'V-010',
        message: `Keyframe ${kf.id} timestamp ${kf.timestampMs} exceeds track duration ${track.metadata.durationMs}`
      });
    }
    if (kf.transitionMs > kf.timestampMs) {
      errors.push({
        code: 'V-012',
        message: `Keyframe ${kf.id} transition would begin before time 0`
      });
    }
  }

  for (const ek of track.effectKeyframes) {
    if (!channelIds.has(ek.channelId)) {
      errors.push({
        code: 'V-006',
        message: `Effect keyframe ${ek.id} references invalid channel: ${ek.channelId}`
      });
    }
    if (ek.durationMs === 0) {
      errors.push({ code: 'V-013', message: `Effect keyframe ${ek.id} duration must be > 0` });
    }
    if (ek.intensity > 100) {
      errors.push({
        code: 'V-014',
        message: `Effect keyframe ${ek.id} intensity ${ek.intensity} out of range [0, 100]`
      });
    }
  }
  return errors;
}

export function contentEndMs(track: LightFXTrack): number {
  let end = 0;
  for (const kf of track.keyframes) end = Math.max(end, kf.timestampMs);
  for (const fx of track.effectKeyframes) end = Math.max(end, fx.timestampMs + fx.durationMs);
  return end;
}
