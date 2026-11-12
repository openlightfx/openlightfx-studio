import { emptyMetadata, type Track } from '../../../src/lib/domain';

/** Version-1 track with both color modes, a transition, and one effect. */
export function roundTripTrack(): Track {
  return {
    version: 1,
    metadata: {
      ...emptyMetadata('Round Trip', 10000),
      description: 'fixture',
      author: 'studio',
      tags: ['fixture'],
      imdbId: 'tt1234567',
    },
    channels: [
      {
        id: 'left',
        displayName: 'Left',
        spatialHint: 'SPATIAL_LEFT',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 0,
        optional: false,
      },
      {
        id: 'right',
        displayName: 'Right',
        spatialHint: 'SPATIAL_RIGHT',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 0,
        optional: true,
      },
    ],
    keyframes: [
      {
        id: 'rgb',
        channelId: 'left',
        timestampMs: 0,
        colorMode: 'RGB',
        color: { r: 10, g: 20, b: 30 },
        colorTemperature: 0,
        brightness: 40,
        transitionMs: 0,
        interpolation: 'STEP',
        powerOn: false,
      },
      {
        id: 'temp',
        channelId: 'right',
        timestampMs: 1000,
        colorMode: 'COLOR_TEMPERATURE',
        color: { r: 0, g: 0, b: 0 },
        colorTemperature: 2700,
        brightness: 80,
        transitionMs: 400,
        interpolation: 'LINEAR',
        powerOn: true,
      },
    ],
    effects: [
      {
        id: 'pulse',
        channelId: 'left',
        timestampMs: 2000,
        durationMs: 1000,
        effectType: 'PULSE',
        intensity: 80,
        primaryColor: { r: 0, g: 0, b: 255 },
        secondaryColor: null,
        params: { flicker_rate_hz: 4 },
        requiredCapability: 'CAPABILITY_RGB',
        fallbackColor: { r: 1, g: 2, b: 3 },
        fallbackBrightness: 25,
      },
    ],
    safety: null,
  };
}
