import type { Track } from './types';

const IMDB = /^tt\d{7,}$/;
const SUPPORTED_VERSION = 1;

/** TrackParser rule ids. Messages include the id so the UI can show it. */
export function validateTrack(track: Track): string[] {
  const errors: string[] = [];
  if (track.version === 0 || track.version > SUPPORTED_VERSION) {
    errors.push(`V-001: Unsupported version ${track.version} (supported: ${SUPPORTED_VERSION})`);
  }
  if (!track.metadata) {
    errors.push('V-002: Metadata is missing');
    return errors;
  }
  const imdb = track.metadata.imdbId;
  if (imdb && !IMDB.test(imdb)) errors.push(`V-003: Invalid IMDB ID format: ${imdb}`);
  if (track.metadata.durationMs === 0) errors.push('V-004: Duration must be > 0');
  if (track.channels.length === 0) errors.push('V-011: At least one channel is required');

  const channelIds = new Set<string>();
  for (const channel of track.channels) {
    if (channelIds.has(channel.id)) errors.push(`V-005: Duplicate channel ID: ${channel.id}`);
    channelIds.add(channel.id);
  }

  const lastTimestamp = new Map<string, number>();
  for (const kf of track.keyframes) {
    if (!channelIds.has(kf.channelId)) {
      errors.push(`V-006: Keyframe ${kf.id} references invalid channel: ${kf.channelId}`);
    }
    const last = lastTimestamp.get(kf.channelId);
    if (last !== undefined && kf.timestampMs < last) {
      errors.push(
        `V-006: Keyframe ${kf.id} in channel ${kf.channelId} is not sorted (timestamp ${kf.timestampMs} < ${last})`
      );
    }
    lastTimestamp.set(kf.channelId, kf.timestampMs);
    if (kf.brightness > 100) {
      errors.push(`V-007: Keyframe ${kf.id} brightness ${kf.brightness} out of range [0, 100]`);
    }
    if (kf.color.r > 255 || kf.color.g > 255 || kf.color.b > 255) {
      errors.push(`V-008: Keyframe ${kf.id} has RGB value out of range [0, 255]`);
    }
    if (
      kf.colorMode === 'COLOR_TEMPERATURE' &&
      (kf.colorTemperature < 1000 || kf.colorTemperature > 10000)
    ) {
      errors.push(
        `V-009: Keyframe ${kf.id} color temperature ${kf.colorTemperature} out of range [1000, 10000]`
      );
    }
    if (track.metadata.durationMs > 0 && kf.timestampMs > track.metadata.durationMs) {
      errors.push(
        `V-010: Keyframe ${kf.id} timestamp ${kf.timestampMs} exceeds track duration ${track.metadata.durationMs}`
      );
    }
    if (kf.transitionMs > kf.timestampMs) {
      errors.push(`V-012: Keyframe ${kf.id} transition would begin before time 0`);
    }
  }

  for (const effect of track.effects) {
    if (!channelIds.has(effect.channelId)) {
      errors.push(
        `V-006: Effect keyframe ${effect.id} references invalid channel: ${effect.channelId}`
      );
    }
    if (effect.durationMs === 0)
      errors.push(`V-013: Effect keyframe ${effect.id} duration must be > 0`);
    if (effect.intensity > 100) {
      errors.push(
        `V-014: Effect keyframe ${effect.id} intensity ${effect.intensity} out of range [0, 100]`
      );
    }
  }
  return errors;
}

export function ruleIds(errors: string[]): string[] {
  return errors.map((error) => error.split(':')[0]);
}
