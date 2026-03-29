import type { Keyframe } from '$lib/types/track.js';

export interface ChannelGroupOffset {
  channelId: string;
  hueOffset: number;
  brightnessOffset: number;
  timingOffsetMs: number;
}

export function applyMirror(
  source: Keyframe,
  targetChannelIds: string[],
  generateId: () => string,
): Keyframe[] {
  return targetChannelIds.map((channelId) => ({
    ...source,
    id: generateId(),
    channelId,
    color: { ...source.color },
  }));
}

export function applySpread(
  source: Keyframe,
  offsets: ChannelGroupOffset[],
  generateId: () => string,
): Keyframe[] {
  return offsets.map((offset) => ({
    ...source,
    id: generateId(),
    channelId: offset.channelId,
    timestampMs: Math.max(0, source.timestampMs + offset.timingOffsetMs),
    brightness: Math.max(0, Math.min(255, source.brightness + offset.brightnessOffset)),
    color: { ...source.color },
  }));
}

export function applyAlternate(
  source: Keyframe,
  channelIds: string[],
  roundRobinIndex: number,
  generateId: () => string,
): Keyframe[] {
  const targetIndex = roundRobinIndex % channelIds.length;
  return [{
    ...source,
    id: generateId(),
    channelId: channelIds[targetIndex],
    color: { ...source.color },
  }];
}
