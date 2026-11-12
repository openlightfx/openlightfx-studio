import { sampleChannel } from './sample';
import type { Keyframe, Sample } from './types';

export function overlaySample(keyframes: Keyframe[], playheadMs: number): Sample {
  return sampleChannel(keyframes, playheadMs);
}

export function photosensitivityNotice(enabled: boolean): string | null {
  if (!enabled) return null;
  return 'Bulbs may be softer than the on-screen colors';
}

/** Photosensitivity is a playback filter. Saving keeps the authored brightness. */
export function authoredBrightness(keyframes: Keyframe[]): number[] {
  return keyframes.map((kf) => kf.brightness);
}

export const OVERLAY_REGIONS: { hint: string; region: string }[] = [
  { hint: 'SPATIAL_LEFT', region: 'top-left' },
  { hint: 'SPATIAL_CENTER', region: 'top-center' },
  { hint: 'SPATIAL_BEHIND_SCREEN', region: 'top-center' },
  { hint: 'SPATIAL_RIGHT', region: 'top-right' },
  { hint: 'SPATIAL_SURROUND_LEFT', region: 'bottom-left' },
  { hint: 'SPATIAL_SURROUND_RIGHT', region: 'bottom-right' },
  { hint: 'SPATIAL_AMBIENT', region: 'border' },
  { hint: 'SPATIAL_CEILING', region: 'top-edge' },
  { hint: 'SPATIAL_FLOOR', region: 'bottom-edge' },
];

/** One bulb belongs to one channel. A channel may own several bulbs. */
export function assignBulb(
  mapping: Record<string, string[]>,
  bulbId: string,
  channelId: string
): { mapping: Record<string, string[]>; error: string | null } {
  for (const [id, bulbs] of Object.entries(mapping)) {
    if (id !== channelId && bulbs.includes(bulbId)) {
      return { mapping, error: 'A bulb follows one channel' };
    }
  }
  const current = mapping[channelId] ?? [];
  if (current.includes(bulbId)) return { mapping, error: null };
  return { mapping: { ...mapping, [channelId]: [...current, bulbId] }, error: null };
}
