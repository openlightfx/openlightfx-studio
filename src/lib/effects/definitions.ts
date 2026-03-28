import type { EffectDefinition, EffectParamDef } from '../types/effects.js';
import type { EffectType, RGBColor } from '../types/track.js';

// ============================================================
// Shared parameter definitions (canonical keys from lightfx.proto)
// ============================================================

const WHITE: RGBColor = { r: 255, g: 255, b: 255 };
const BLACK: RGBColor = { r: 0, g: 0, b: 0 };
const RED: RGBColor = { r: 255, g: 0, b: 0 };
const BLUE: RGBColor = { r: 0, g: 0, b: 255 };
const ORANGE: RGBColor = { r: 255, g: 140, b: 20 };
const WARM_ORANGE: RGBColor = { r: 255, g: 120, b: 20 };
const CANDLE_WARM: RGBColor = { r: 255, g: 160, b: 50 };
const GREEN: RGBColor = { r: 0, g: 200, b: 100 };
const PURPLE: RGBColor = { r: 180, g: 0, b: 255 };
const CYAN: RGBColor = { r: 0, g: 255, b: 255 };
const YELLOW: RGBColor = { r: 255, g: 230, b: 120 };
const NEON_PINK: RGBColor = { r: 255, g: 20, b: 147 };

const FLASH_COUNT_EFFECTS: EffectType[] = [
  'LIGHTNING',
  'FLASHBANG',
  'EXPLOSION',
  'GUNFIRE',
  'SIREN',
  'STROBE',
];
const FLICKER_RATE_EFFECTS: EffectType[] = ['FLAME', 'CANDLE', 'NEON', 'AURORA'];
const PULSE_RATE_EFFECTS: EffectType[] = ['PULSE', 'BREATHING'];
const DECAY_MS_EFFECTS: EffectType[] = ['EXPLOSION', 'LIGHTNING', 'GUNFIRE'];
const RANDOMNESS_EFFECTS: EffectType[] = ['FLAME', 'CANDLE', 'AURORA', 'NEON', 'SPARK'];

function flashCountParam(defaultValue: number): EffectParamDef {
  return {
    key: 'flash_count',
    label: 'Flash Count',
    type: 'integer',
    min: 1,
    max: 20,
    default: defaultValue,
    applicableTo: FLASH_COUNT_EFFECTS,
  };
}

function flickerRateParam(defaultValue: number): EffectParamDef {
  return {
    key: 'flicker_rate_hz',
    label: 'Flicker Rate',
    type: 'float',
    min: 0.5,
    max: 30.0,
    default: defaultValue,
    applicableTo: FLICKER_RATE_EFFECTS,
  };
}

function pulseRateParam(defaultValue: number): EffectParamDef {
  return {
    key: 'pulse_rate_hz',
    label: 'Pulse Rate',
    type: 'float',
    min: 0.1,
    max: 5.0,
    default: defaultValue,
    applicableTo: PULSE_RATE_EFFECTS,
  };
}

function decayMsParam(defaultValue: number): EffectParamDef {
  return {
    key: 'decay_ms',
    label: 'Decay',
    type: 'integer',
    min: 0,
    max: 5000,
    default: defaultValue,
    applicableTo: DECAY_MS_EFFECTS,
  };
}

function randomnessParam(defaultValue: number): EffectParamDef {
  return {
    key: 'randomness',
    label: 'Randomness',
    type: 'float',
    min: 0.0,
    max: 1.0,
    default: defaultValue,
    applicableTo: RANDOMNESS_EFFECTS,
  };
}

// ============================================================
// Effect Definitions — all 13 types
// ============================================================

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    type: 'LIGHTNING',
    name: 'Lightning',
    description: 'Rapid bright white flash(es) with afterglow decay',
    icon: '⚡',
    previewColors: [WHITE, { r: 200, g: 200, b: 255 }, { r: 100, g: 100, b: 180 }],
    params: [flashCountParam(2), decayMsParam(500)],
    defaultDurationMs: 2000,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: { r: 180, g: 180, b: 255 },
    requiredCapability: 'CAPABILITY_FAST_TRANSITION',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 100,
  },
  {
    type: 'FLAME',
    name: 'Flame',
    description: 'Flickering warm colors simulating fire',
    icon: '🔥',
    previewColors: [WARM_ORANGE, RED, { r: 255, g: 200, b: 50 }],
    params: [flickerRateParam(8.0), randomnessParam(0.5)],
    defaultDurationMs: 3000,
    defaultIntensity: 100,
    defaultPrimaryColor: WARM_ORANGE,
    defaultSecondaryColor: RED,
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: WARM_ORANGE,
    defaultFallbackBrightness: 70,
  },
  {
    type: 'FLASHBANG',
    name: 'Flashbang',
    description: 'Intense white flash followed by slow fade',
    icon: '💥',
    previewColors: [WHITE, { r: 255, g: 255, b: 200 }, BLACK],
    params: [flashCountParam(1)],
    defaultDurationMs: 2000,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: { r: 255, g: 255, b: 200 },
    requiredCapability: 'CAPABILITY_FAST_TRANSITION',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 100,
  },
  {
    type: 'EXPLOSION',
    name: 'Explosion',
    description: 'Rapid orange/red burst with slow decay',
    icon: '💣',
    previewColors: [ORANGE, RED, { r: 255, g: 80, b: 0 }],
    params: [flashCountParam(3), decayMsParam(500)],
    defaultDurationMs: 2000,
    defaultIntensity: 100,
    defaultPrimaryColor: { r: 255, g: 200, b: 80 },
    defaultSecondaryColor: RED,
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: ORANGE,
    defaultFallbackBrightness: 90,
  },
  {
    type: 'PULSE',
    name: 'Pulse',
    description: 'Rhythmic brightness oscillation',
    icon: '💓',
    previewColors: [WHITE, { r: 128, g: 128, b: 128 }, BLACK],
    params: [pulseRateParam(1.0)],
    defaultDurationMs: 3000,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: BLACK,
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 50,
  },
  {
    type: 'STROBE',
    name: 'Strobe',
    description: 'Rapid on/off flashing',
    icon: '🔦',
    previewColors: [WHITE, BLACK, WHITE],
    params: [flashCountParam(10)],
    defaultDurationMs: 2000,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: BLACK,
    requiredCapability: 'CAPABILITY_FAST_TRANSITION',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 80,
  },
  {
    type: 'SIREN',
    name: 'Siren',
    description: 'Alternating red/blue (or primary/secondary) colors',
    icon: '🚨',
    previewColors: [RED, BLUE, RED],
    params: [flashCountParam(8)],
    defaultDurationMs: 3000,
    defaultIntensity: 100,
    defaultPrimaryColor: RED,
    defaultSecondaryColor: BLUE,
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: RED,
    defaultFallbackBrightness: 80,
  },
  {
    type: 'AURORA',
    name: 'Aurora',
    description: 'Slow-shifting multi-color ambient wash',
    icon: '🌌',
    previewColors: [GREEN, CYAN, PURPLE],
    params: [flickerRateParam(0.5), randomnessParam(0.5)],
    defaultDurationMs: 5000,
    defaultIntensity: 100,
    defaultPrimaryColor: GREEN,
    defaultSecondaryColor: PURPLE,
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: GREEN,
    defaultFallbackBrightness: 50,
  },
  {
    type: 'CANDLE',
    name: 'Candle',
    description: 'Subtle warm flicker, gentler than flame',
    icon: '🕯️',
    previewColors: [CANDLE_WARM, { r: 200, g: 100, b: 20 }, CANDLE_WARM],
    params: [flickerRateParam(3.0), randomnessParam(0.5)],
    defaultDurationMs: 5000,
    defaultIntensity: 100,
    defaultPrimaryColor: CANDLE_WARM,
    defaultSecondaryColor: { r: 200, g: 100, b: 20 },
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: CANDLE_WARM,
    defaultFallbackBrightness: 60,
  },
  {
    type: 'GUNFIRE',
    name: 'Gunfire',
    description: 'Brief sharp white/yellow flashes',
    icon: '🔫',
    previewColors: [YELLOW, WHITE, BLACK],
    params: [flashCountParam(4), decayMsParam(500)],
    defaultDurationMs: 2000,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: YELLOW,
    requiredCapability: 'CAPABILITY_FAST_TRANSITION',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 90,
  },
  {
    type: 'NEON',
    name: 'Neon',
    description: 'Rapid color-saturated flicker (neon sign)',
    icon: '💡',
    previewColors: [NEON_PINK, { r: 255, g: 100, b: 200 }, NEON_PINK],
    params: [flickerRateParam(15.0), randomnessParam(0.5)],
    defaultDurationMs: 3000,
    defaultIntensity: 100,
    defaultPrimaryColor: NEON_PINK,
    defaultSecondaryColor: { r: 100, g: 0, b: 255 },
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: NEON_PINK,
    defaultFallbackBrightness: 80,
  },
  {
    type: 'BREATHING',
    name: 'Breathing',
    description: 'Slow sinusoidal brightness oscillation',
    icon: '🫁',
    previewColors: [WHITE, { r: 128, g: 128, b: 128 }, BLACK],
    params: [pulseRateParam(1.0)],
    defaultDurationMs: 5000,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: BLACK,
    requiredCapability: 'CAPABILITY_ANY',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 50,
  },
  {
    type: 'SPARK',
    name: 'Spark',
    description: 'Very brief single flash',
    icon: '✨',
    previewColors: [BLACK, WHITE, BLACK],
    params: [randomnessParam(0.5)],
    defaultDurationMs: 500,
    defaultIntensity: 100,
    defaultPrimaryColor: WHITE,
    defaultSecondaryColor: BLACK,
    requiredCapability: 'CAPABILITY_FAST_TRANSITION',
    defaultFallbackColor: WHITE,
    defaultFallbackBrightness: 80,
  },
];

/** Map from EffectType to its definition for fast lookup */
export const EFFECT_DEFINITION_MAP: Map<EffectType, EffectDefinition> = new Map(
  EFFECT_DEFINITIONS.map((def) => [def.type, def])
);
