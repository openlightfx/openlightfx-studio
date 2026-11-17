import { defaultEffectContext, renderEffect, sampleEffectAt, type EffectCommand } from './effects';
import { sampleChannel } from './sample';
import type { EffectKeyframe, Keyframe, Sample } from './types';

export function overlaySample(keyframes: Keyframe[], playheadMs: number): Sample {
  return sampleChannel(keyframes, playheadMs);
}

export function effectWindowContains(
  effect: { timestampMs: number; durationMs: number },
  playheadMs: number
): boolean {
  const start = effect.timestampMs;
  const end = start + Math.max(0, effect.durationMs || 0);
  return playheadMs >= start && playheadMs <= end;
}

/** True while any effect window covers the playhead. Preview uses this to sample faster. */
export function effectActiveAt(
  effects: readonly { timestampMs: number; durationMs: number }[],
  playheadMs: number
): boolean {
  return effects.some((effect) => effectWindowContains(effect, playheadMs));
}

/**
 * The effect that owns the channel at this time, matching playback: the earliest
 * window still open wins, and its latest command at or before the playhead is
 * the bulb state. Lightning's tail is aimed at the scene colour when the window ends.
 */
export function activeEffectCommand(
  keyframes: readonly Keyframe[],
  effects: readonly EffectKeyframe[],
  playheadMs: number
): EffectCommand | null {
  const ordered = [...effects].sort(
    (a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id)
  );
  for (const effect of ordered) {
    if (!effectWindowContains(effect, playheadMs)) continue;
    const scene = sampleChannel(
      [...keyframes],
      effect.timestampMs + Math.max(0, effect.durationMs || 0)
    );
    const commands = renderEffect(
      {
        effectType: effect.effectType,
        durationMs: effect.durationMs,
        intensity: effect.intensity,
        primaryColor: effect.primaryColor,
        secondaryColor: effect.secondaryColor,
        params: effect.params,
        requiredCapability: effect.requiredCapability,
        fallbackColor: effect.fallbackColor,
        fallbackBrightness: effect.fallbackBrightness,
      },
      {
        ...defaultEffectContext(),
        sceneColor: { r: scene.r, g: scene.g, b: scene.b },
        sceneBrightness: scene.brightness,
      }
    );
    const command = sampleEffectAt(commands, playheadMs - effect.timestampMs);
    if (command) return command;
  }
  return null;
}

export interface PreviewChannelSample {
  r: number;
  g: number;
  b: number;
  brightness: number;
  kelvin: number;
  transitionMs: number;
}

/** Scene keyframe, unless an effect window is open — then the effect replaces it. */
export function samplePreviewChannel(
  keyframes: readonly Keyframe[],
  effects: readonly EffectKeyframe[],
  playheadMs: number
): PreviewChannelSample {
  const scene = sampleChannel([...keyframes], playheadMs);
  const command = activeEffectCommand(keyframes, effects, playheadMs);
  if (!command) {
    return {
      r: scene.r,
      g: scene.g,
      b: scene.b,
      brightness: scene.brightness,
      kelvin: scene.mode === 'COLOR_TEMPERATURE' ? scene.kelvin : 0,
      transitionMs: 0,
    };
  }
  return {
    r: command.r,
    g: command.g,
    b: command.b,
    brightness: command.brightness,
    kelvin: 0,
    transitionMs: command.transitionMs,
  };
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
