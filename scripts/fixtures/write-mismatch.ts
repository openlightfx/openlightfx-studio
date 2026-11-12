import { writeFileSync } from 'node:fs';
import { encodeTrack, emptyMetadata, type Track } from '../../src/lib/domain/index';

const track: Track = {
  version: 1,
  metadata: emptyMetadata('Mismatch', 60000),
  channels: [
    {
      id: 'left',
      displayName: 'Left',
      spatialHint: 'SPATIAL_LEFT',
      defaultColor: { r: 0, g: 0, b: 0 },
      defaultBrightness: 0,
      optional: false,
    },
  ],
  keyframes: [
    {
      id: 'a',
      channelId: 'left',
      timestampMs: 0,
      colorMode: 'RGB',
      color: { r: 0, g: 0, b: 0 },
      colorTemperature: 0,
      brightness: 0,
      transitionMs: 0,
      interpolation: 'STEP',
      powerOn: false,
    },
  ],
  effects: [],
  safety: null,
};

writeFileSync('tests/fixtures/sampling/mismatch.lightfx', encodeTrack(track));
