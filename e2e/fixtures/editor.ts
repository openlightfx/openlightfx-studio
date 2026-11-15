import { blackKeyframe, newTrackFromMovie, type Track } from '../../src/lib/domain';
import type { MediaInfo } from '../../src/lib/api/types';

export const TWO_HOUR_DURATION_MS = 7_200_000;
export const TWO_HOUR_KEYFRAME_COUNT = 10_000;

/** A document-only workload; it is not paired with the short playable proxy below. */
export const TWO_HOUR_10K_DOCUMENT: Track = (() => {
  const track = newTrackFromMovie(
    '42',
    'Two-hour document fixture',
    TWO_HOUR_DURATION_MS,
    'LAYOUT_5_0'
  );
  track.keyframes = Array.from({ length: TWO_HOUR_KEYFRAME_COUNT }, (_, index) => {
    const channel = track.channels[index % track.channels.length];
    return {
      ...blackKeyframe(channel.id),
      id: `document-key-${String(index).padStart(5, '0')}`,
      timestampMs: Math.round((index * TWO_HOUR_DURATION_MS) / (TWO_HOUR_KEYFRAME_COUNT - 1)),
      color: { r: index % 256, g: (index * 3) % 256, b: (index * 7) % 256 },
      brightness: 100,
    };
  });
  return track;
})();

export function twoHourDocumentFixture(): Track {
  return structuredClone(TWO_HOUR_10K_DOCUMENT);
}

/** A document-only metadata fixture with no playable proxy or claimed movie runtime. */
export const DOCUMENT_ONLY_MEDIA: MediaInfo = {
  runtimeMs: 0,
  width: 0,
  height: 0,
  videoCodec: '',
  hdr: false,
  colorTransfer: '',
  audioCodec: '',
  proxy: {
    state: 'failed',
    reason: 'This document-only fixture has no playable proxy',
    encodedThroughMs: 0,
    fps: 24,
    keyframeIntervalMs: 500,
    width: 0,
    height: 0,
  },
};

/** The generated, playable 10-second edit proxy served by Vite for browser tests. */
export const SHORT_PLAYABLE_MEDIA: MediaInfo = {
  runtimeMs: 10_000,
  width: 320,
  height: 180,
  videoCodec: 'h264',
  hdr: false,
  colorTransfer: 'bt709',
  audioCodec: 'aac',
  proxy: {
    state: 'ready',
    encodedThroughMs: 10_000,
    fps: 24,
    keyframeIntervalMs: 500,
    width: 320,
    height: 180,
    editUrl: '/media/clip-a-h264.mp4',
  },
};

export function trackWithNeighboringKeys(layout: string): Track {
  const track = newTrackFromMovie('42', 'Neighbor selection fixture', 10_000, layout);
  track.keyframes = [
    {
      ...blackKeyframe('left'),
      id: 'left-neighbor',
      timestampMs: 7_000,
      color: { r: 12, g: 34, b: 56 },
      brightness: 21,
    },
    {
      ...blackKeyframe('left'),
      id: 'left-target',
      timestampMs: 7_300,
      color: { r: 78, g: 90, b: 123 },
      brightness: 63,
    },
  ];
  return track;
}
