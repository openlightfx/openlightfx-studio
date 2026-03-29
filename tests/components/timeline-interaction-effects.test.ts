import { describe, it, expect } from 'vitest';
import { hitTest } from '$lib/components/timeline/interaction.js';
import type { Channel, Keyframe, EffectKeyframe } from '$lib/types/track.js';
import type { RenderViewport } from '$lib/components/timeline/render.js';
import { CHANNEL_LANE_HEIGHT, RULER_HEIGHT } from '$lib/types/timeline.js';

function makeViewport(): RenderViewport {
  return { pxPerMs: 0.1, scrollX: 0, width: 1000, height: 400 };
}

function makeChannels(): Channel[] {
  return [
    { id: 'ch1', displayName: 'Ch1', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_AMBIENT', optional: false },
  ];
}

function makeEffect(overrides: Partial<EffectKeyframe> = {}): EffectKeyframe {
  return {
    id: 'ef-1', channelId: 'ch1', timestampMs: 1000, durationMs: 500,
    effectType: 'LIGHTNING', intensity: 80,
    primaryColor: { r: 255, g: 255, b: 255 }, secondaryColor: { r: 0, g: 0, b: 0 },
    effectParams: { params: {} }, requiredCapability: 'CAPABILITY_ANY',
    fallbackColor: { r: 0, g: 0, b: 0 }, fallbackBrightness: 0,
    ...overrides,
  };
}

describe('hitTest with effects', () => {
  it('returns effect hit when clicking inside an effect block', () => {
    const vp = makeViewport();
    const channels = makeChannels();
    // Effect at 1000ms, 500ms duration → at 0.1 px/ms: x=100px to x=150px
    const effects = [makeEffect()];
    // Effect Y: RULER_HEIGHT + 0 * CHANNEL_LANE_HEIGHT + (44-24)/2 + 4 = 28 + 14 = 42
    // Effect Y range: 42 to 42+24 = 66
    const result = hitTest(120, 50, vp, channels, [], effects);
    expect(result.type).toBe('effect');
    expect(result.effectKeyframeId).toBe('ef-1');
  });

  it('returns keyframe hit when keyframe and effect overlap (keyframe wins)', () => {
    const vp = makeViewport();
    const channels = makeChannels();
    const effects = [makeEffect()];
    const keyframes: Keyframe[] = [{
      id: 'kf-1', channelId: 'ch1', timestampMs: 1000, colorMode: 'RGB',
      color: { r: 0, g: 0, b: 0 }, colorTemperature: 6500, brightness: 1,
      transitionMs: 0, interpolation: 'STEP', powerOn: true,
    }];
    // Keyframe at x=100, lane center Y = RULER_HEIGHT + CHANNEL_LANE_HEIGHT/2 = 28 + 22 = 50
    const result = hitTest(100, 50, vp, channels, keyframes, effects);
    expect(result.type).toBe('keyframe');
  });

  it('returns empty when clicking outside effect bounds', () => {
    const vp = makeViewport();
    const channels = makeChannels();
    const effects = [makeEffect()];
    // Click at x=50 (500ms), effect starts at 1000ms (x=100)
    const laneCenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(50, laneCenterY, vp, channels, [], effects);
    expect(result.type).toBe('empty');
  });
});
