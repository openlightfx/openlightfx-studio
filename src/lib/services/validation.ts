import type { LightFXTrack } from '$lib/types/index.js';

const CHANNEL_ID_REGEX = /^[a-z0-9_-]{1,64}$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTrack(track: LightFXTrack): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const channelIds = new Set<string>();

  for (const ch of track.channels) {
    if (!CHANNEL_ID_REGEX.test(ch.id)) {
      errors.push(`Channel ID "${ch.id}" is invalid — must match [a-z0-9_-]{1,64}`);
    }
    if (channelIds.has(ch.id)) {
      errors.push(`Channel ID "${ch.id}" is duplicate`);
    }
    channelIds.add(ch.id);
  }

  for (const kf of track.keyframes) {
    if (!channelIds.has(kf.channelId)) {
      errors.push(`Keyframe "${kf.id}" references nonexistent channel "${kf.channelId}"`);
    }
    if (track.metadata.durationMs > 0 && kf.timestampMs > track.metadata.durationMs) {
      warnings.push(`Keyframe "${kf.id}" at ${kf.timestampMs}ms exceeds track duration`);
    }
  }

  for (const ef of track.effectKeyframes) {
    if (!channelIds.has(ef.channelId)) {
      errors.push(`Effect "${ef.id}" references nonexistent channel "${ef.channelId}"`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
