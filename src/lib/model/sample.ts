import type { EffectKeyframe, Keyframe, LightFXTrack, Marker, RGB } from '$lib/model/types';
import { makeChannel, makeEffect, makeKeyframe, rgb } from '$lib/model/types';

const DURATION = 112 * 60 * 1000;

function k(
  channelId: string,
  timestampMs: number,
  color: RGB,
  brightness: number,
  transitionMs: number,
  interpolation: Keyframe['interpolation'] = 'LINEAR'
): Keyframe {
  return makeKeyframe({
    id: `kf_${channelId}_${timestampMs}`,
    channelId,
    timestampMs,
    color,
    brightness,
    transitionMs,
    interpolation,
    powerOn: brightness > 0
  });
}

function fx(
  channelId: string,
  timestampMs: number,
  effectType: EffectKeyframe['effectType'],
  durationMs: number,
  intensity: number,
  primary: RGB,
  secondary: RGB,
  params: Record<string, number> = {},
  capability = ''
): EffectKeyframe {
  return makeEffect({
    id: `fx_${channelId}_${effectType}_${timestampMs}`,
    channelId,
    timestampMs,
    durationMs,
    effectType,
    intensity,
    primaryColor: primary,
    secondaryColor: secondary,
    effectParams: params,
    requiredCapability: capability,
    fallbackColor: rgb(210, 210, 210),
    fallbackBrightness: Math.round(intensity * 0.4)
  });
}

/** A full-length feature with an authored opening, midpoint, and finale. */
export function createSampleTrack(): LightFXTrack {
  const channels = [
    makeChannel('left', 'Left', 'SPATIAL_LEFT', rgb(40, 80, 140)),
    makeChannel('center', 'Center', 'SPATIAL_CENTER', rgb(255, 214, 170)),
    makeChannel('right', 'Right', 'SPATIAL_RIGHT', rgb(40, 80, 140)),
    makeChannel('surround-left', 'Surround Left', 'SPATIAL_SURROUND_LEFT', rgb(90, 40, 160)),
    makeChannel('surround-right', 'Surround Right', 'SPATIAL_SURROUND_RIGHT', rgb(90, 40, 160)),
    makeChannel('ambient', 'Ambient', 'SPATIAL_AMBIENT', rgb(20, 40, 70))
  ];

  const keyframes: Keyframe[] = [
    // Cold open — house lights down, screen glow.
    k('left', 0, rgb(8, 14, 28), 6, 0, 'STEP'),
    k('center', 0, rgb(10, 16, 30), 4, 0, 'STEP'),
    k('right', 0, rgb(8, 14, 28), 6, 0, 'STEP'),
    k('surround-left', 0, rgb(6, 8, 18), 3, 0, 'STEP'),
    k('surround-right', 0, rgb(6, 8, 18), 3, 0, 'STEP'),
    k('ambient', 0, rgb(4, 8, 16), 2, 0, 'STEP'),

    k('ambient', 8000, rgb(16, 40, 70), 22, 6000),
    k('left', 14000, rgb(24, 70, 120), 38, 5000),
    k('right', 14000, rgb(24, 64, 110), 38, 5000),
    k('center', 18000, rgb(180, 200, 220), 28, 4000),
    k('surround-left', 18000, rgb(30, 20, 60), 18, 4000),
    k('surround-right', 18000, rgb(30, 20, 60), 18, 4000),

    // Harbor sodium + cyan practicals.
    k('left', 32000, rgb(40, 150, 170), 62, 3500),
    k('right', 32500, rgb(255, 150, 70), 54, 3500),
    k('center', 34000, rgb(255, 186, 110), 48, 2500),
    k('ambient', 34000, rgb(20, 60, 80), 30, 4000),
    k('surround-left', 36000, rgb(40, 30, 80), 26, 3000),
    k('surround-right', 36000, rgb(80, 30, 40), 26, 3000),

    k('left', 52000, rgb(20, 40, 90), 18, 4000),
    k('right', 52000, rgb(20, 40, 90), 18, 4000),
    k('center', 54000, rgb(40, 50, 80), 12, 3000),
    k('ambient', 54000, rgb(8, 16, 32), 8, 4000),

    // Storm.
    k('left', 68000, rgb(60, 90, 140), 46, 1500),
    k('right', 68000, rgb(50, 70, 130), 42, 1500),
    k('center', 70000, rgb(220, 230, 255), 88, 200, 'STEP'),
    k('center', 72400, rgb(30, 40, 70), 16, 800),
    k('surround-left', 69000, rgb(140, 160, 255), 70, 400, 'STEP'),
    k('surround-right', 69600, rgb(160, 180, 255), 74, 300, 'STEP'),
    k('ambient', 70000, rgb(20, 30, 50), 24, 500),
    k('left', 86000, rgb(16, 28, 60), 14, 3000),
    k('right', 86000, rgb(16, 28, 60), 14, 3000),
    k('surround-left', 88000, rgb(20, 16, 40), 10, 2500),
    k('surround-right', 88000, rgb(20, 16, 40), 10, 2500),

    // Alley siren.
    k('left', 104000, rgb(180, 20, 30), 70, 400, 'STEP'),
    k('right', 104400, rgb(20, 40, 180), 70, 400, 'STEP'),
    k('left', 112000, rgb(20, 40, 160), 50, 600),
    k('right', 112000, rgb(160, 24, 36), 50, 600),
    k('center', 108000, rgb(80, 80, 100), 20, 1500),
    k('ambient', 108000, rgb(30, 10, 20), 16, 1500),
    k('left', 128000, rgb(12, 16, 28), 8, 3000),
    k('right', 128000, rgb(12, 16, 28), 8, 3000),
    k('center', 130000, rgb(16, 14, 18), 6, 2500),

    // Interior candle.
    k('center', 148000, rgb(255, 150, 60), 36, 4000),
    k('ambient', 150000, rgb(120, 50, 16), 22, 5000),
    k('left', 152000, rgb(90, 40, 16), 14, 4000),
    k('right', 152000, rgb(90, 40, 16), 14, 4000),
    k('surround-left', 154000, rgb(40, 16, 8), 8, 4000),
    k('surround-right', 154000, rgb(40, 16, 8), 8, 4000),
    k('center', 190000, rgb(40, 18, 8), 8, 6000),
    k('ambient', 192000, rgb(16, 8, 6), 4, 6000),
    k('left', 192000, rgb(10, 10, 16), 4, 5000),
    k('right', 192000, rgb(10, 10, 16), 4, 5000),

    // Midpoint — 48:00 interrogation room.
    k('center', 2_880_000, rgb(255, 214, 160), 42, 2000),
    k('left', 2_882_000, rgb(60, 80, 40), 18, 2500),
    k('right', 2_882_000, rgb(60, 80, 40), 18, 2500),
    k('ambient', 2_884_000, rgb(30, 24, 16), 12, 3000),
    k('surround-left', 2_900_000, rgb(180, 40, 20), 55, 200, 'STEP'),
    k('surround-right', 2_900_400, rgb(180, 40, 20), 40, 200, 'STEP'),
    k('center', 2_906_000, rgb(20, 16, 12), 6, 2500),
    k('left', 2_908_000, rgb(8, 10, 14), 3, 3000),
    k('right', 2_908_000, rgb(8, 10, 14), 3, 3000),
    k('ambient', 2_910_000, rgb(6, 8, 12), 2, 3000),
    k('surround-left', 2_910_000, rgb(8, 6, 10), 2, 2000),
    k('surround-right', 2_910_000, rgb(8, 6, 10), 2, 2000),

    // Finale — 96:00.
    k('left', 5_760_000, rgb(255, 90, 20), 80, 800),
    k('right', 5_760_200, rgb(255, 140, 40), 76, 800),
    k('center', 5_760_400, rgb(255, 220, 180), 92, 400, 'STEP'),
    k('ambient', 5_761_000, rgb(180, 40, 10), 48, 1200),
    k('surround-left', 5_761_200, rgb(255, 60, 10), 66, 600),
    k('surround-right', 5_761_200, rgb(255, 80, 16), 66, 600),
    k('center', 5_770_000, rgb(80, 20, 10), 14, 4000),
    k('left', 5_772_000, rgb(20, 24, 40), 10, 4000),
    k('right', 5_772_000, rgb(20, 24, 40), 10, 4000),
    k('ambient', 5_774_000, rgb(12, 16, 28), 6, 5000),
    k('surround-left', 5_774_000, rgb(10, 8, 16), 4, 4000),
    k('surround-right', 5_774_000, rgb(10, 8, 16), 4, 4000),

    // Credits hold.
    k('left', 6_300_000, rgb(18, 22, 32), 8, 8000),
    k('right', 6_300_000, rgb(18, 22, 32), 8, 8000),
    k('center', 6_300_000, rgb(28, 30, 36), 10, 8000),
    k('ambient', 6_300_000, rgb(10, 12, 18), 4, 8000),
    k('left', 6_700_000, rgb(0, 0, 0), 0, 4000),
    k('right', 6_700_000, rgb(0, 0, 0), 0, 4000),
    k('center', 6_700_000, rgb(0, 0, 0), 0, 4000),
    k('surround-left', 6_700_000, rgb(0, 0, 0), 0, 4000),
    k('surround-right', 6_700_000, rgb(0, 0, 0), 0, 4000),
    k('ambient', 6_700_000, rgb(0, 0, 0), 0, 4000)
  ];

  const effectKeyframes: EffectKeyframe[] = [
    fx('surround-left', 70_200, 'LIGHTNING', 1600, 100, rgb(235, 240, 255), rgb(80, 100, 160), {
      flash_count: 3,
      decay_ms: 420
    }, 'CAPABILITY_FAST_RGB'),
    fx('surround-right', 70_500, 'LIGHTNING', 1400, 90, rgb(245, 245, 255), rgb(90, 110, 170), {
      flash_count: 2,
      decay_ms: 380
    }, 'CAPABILITY_FAST_RGB'),
    fx('center', 71_000, 'FLASHBANG', 2200, 100, rgb(255, 255, 255), rgb(40, 40, 50), {
      flash_count: 1
    }),
    fx('left', 104_000, 'SIREN', 8000, 80, rgb(220, 16, 24), rgb(16, 40, 220), { flash_count: 8 }, 'CAPABILITY_RGB'),
    fx('right', 104_000, 'SIREN', 8000, 80, rgb(16, 40, 220), rgb(220, 16, 24), { flash_count: 8 }, 'CAPABILITY_RGB'),
    fx('ambient', 150_000, 'CANDLE', 40_000, 40, rgb(255, 150, 50), rgb(140, 40, 8), {
      flicker_rate_hz: 3,
      randomness: 0.45
    }),
    fx('center', 168_000, 'CANDLE', 20_000, 28, rgb(255, 170, 70), rgb(120, 40, 10), {
      flicker_rate_hz: 2.5,
      randomness: 0.35
    }),
    fx('surround-left', 2_899_600, 'GUNFIRE', 900, 90, rgb(255, 220, 160), rgb(80, 16, 8), {
      flash_count: 4,
      decay_ms: 180
    }, 'CAPABILITY_FAST_TRANSITION'),
    fx('left', 5_760_000, 'EXPLOSION', 2800, 100, rgb(255, 120, 20), rgb(120, 16, 4), {
      flash_count: 3,
      decay_ms: 900
    }, 'CAPABILITY_RGB'),
    fx('right', 5_760_200, 'EXPLOSION', 2600, 95, rgb(255, 160, 40), rgb(90, 20, 6), {
      flash_count: 3,
      decay_ms: 800
    }, 'CAPABILITY_RGB'),
    fx('ambient', 5_762_000, 'FLAME', 10_000, 70, rgb(255, 90, 10), rgb(80, 10, 0), {
      flicker_rate_hz: 8,
      randomness: 0.6
    }),
    fx('center', 5_766_000, 'STROBE', 1200, 85, rgb(255, 255, 255), rgb(0, 0, 0), { flash_count: 8 }, 'CAPABILITY_FAST_RGB')
  ];

  return {
    version: 1,
    metadata: {
      title: 'Glass Harbor',
      description: 'Opening storm, alley, and finale for a 112-minute feature. Sample track shipped with Studio.',
      movieReference: {
        imdbId: 'tt8041270',
        title: 'Glass Harbor',
        year: 2024,
        runtimeMinutes: 112
      },
      author: 'OpenLightFX',
      tags: ['sample', 'night', 'storm'],
      durationMs: DURATION,
      startBehavior: 'OFF',
      endBehavior: 'OFF',
      preshowDurationMs: 0,
      preshowState: 'PRESHOW_OFF',
      creditsStartMs: 104 * 60 * 1000,
      creditsBehavior: 'CREDITS_DIM_UP',
      trackVersion: '1.0'
    },
    channels,
    keyframes,
    effectKeyframes,
    safetyInfo: {
      containsFlashing: true,
      containsStrobing: true,
      maxFlashFrequencyHz: 8,
      maxBrightnessDelta: 100,
      warningText: 'Contains lightning, strobe, and siren effects.',
      intensityRating: 'INTENSE'
    }
  };
}

export function sampleMarkers(): Marker[] {
  return [
    { id: 'mk_open', timestampMs: 0, label: 'Cold open' },
    { id: 'mk_harbor', timestampMs: 32_000, label: 'Harbor' },
    { id: 'mk_storm', timestampMs: 68_000, label: 'Storm' },
    { id: 'mk_alley', timestampMs: 104_000, label: 'Alley' },
    { id: 'mk_candle', timestampMs: 150_000, label: 'Candle' },
    { id: 'mk_mid', timestampMs: 2_880_000, label: 'Interrogation' },
    { id: 'mk_finale', timestampMs: 5_760_000, label: 'Finale' },
    { id: 'mk_credits', timestampMs: 104 * 60 * 1000, label: 'Credits' }
  ];
}

/** Dense synthetic track used to exercise long-movie editing. Not shown by default. */
export function createStressTrack(keyframesPerChannel = 800, channels = 6): LightFXTrack {
  const duration = 2 * 60 * 60 * 1000;
  const defs = [
    ['left', 'Left', 'SPATIAL_LEFT'],
    ['center', 'Center', 'SPATIAL_CENTER'],
    ['right', 'Right', 'SPATIAL_RIGHT'],
    ['surround-left', 'Surround Left', 'SPATIAL_SURROUND_LEFT'],
    ['surround-right', 'Surround Right', 'SPATIAL_SURROUND_RIGHT'],
    ['ambient', 'Ambient', 'SPATIAL_AMBIENT']
  ].slice(0, channels);
  const chs = defs.map((d, i) =>
    makeChannel(d[0], d[1], d[2], rgb(40 + i * 30, 80, 160 - i * 10))
  );
  const keyframes: Keyframe[] = [];
  const step = Math.floor(duration / keyframesPerChannel);
  for (const ch of chs) {
    for (let i = 0; i < keyframesPerChannel; i++) {
      const t = i * step;
      keyframes.push(
        k(
          ch.id,
          t,
          rgb((i * 37) % 256, (i * 17) % 256, (i * 53) % 256),
          i % 5 === 0 ? 80 : 20,
          i === 0 ? 0 : Math.min(400, t),
          i % 7 === 0 ? 'STEP' : 'LINEAR'
        )
      );
    }
  }
  return {
    version: 1,
    metadata: {
      title: 'Stress',
      description: '',
      movieReference: { imdbId: 'tt1234567', title: 'Stress', year: 2024, runtimeMinutes: 120 },
      author: '',
      tags: [],
      durationMs: duration,
      startBehavior: 'OFF',
      endBehavior: 'OFF',
      preshowDurationMs: 0,
      preshowState: 'PRESHOW_UNSPECIFIED',
      creditsStartMs: 0,
      creditsBehavior: 'CREDITS_CONTINUE',
      trackVersion: '1.0'
    },
    channels: chs,
    keyframes,
    effectKeyframes: [],
    safetyInfo: {
      containsFlashing: false,
      containsStrobing: false,
      maxFlashFrequencyHz: 0,
      maxBrightnessDelta: 60,
      warningText: '',
      intensityRating: 'MODERATE'
    }
  };
}
