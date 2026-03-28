import type { EffectType } from '$lib/types/track';

export interface EffectDisplayInfo {
  label: string;
  color: string;
  icon: string;
  description: string;
  defaultDurationMs: number;
}

export const EFFECT_TYPES: EffectType[] = [
  'LIGHTNING',
  'FLAME',
  'FLASHBANG',
  'EXPLOSION',
  'PULSE',
  'STROBE',
  'SIREN',
  'AURORA',
  'CANDLE',
  'GUNFIRE',
  'NEON',
  'BREATHING',
  'SPARK',
];

const DISPLAY_INFO: Record<string, EffectDisplayInfo> = {
  LIGHTNING: {
    label: 'Lightning',
    color: '#fbbf24',
    icon: '⚡',
    description: 'Bright electric flash with rapid decay',
    defaultDurationMs: 800,
  },
  FLAME: {
    label: 'Flame',
    color: '#f97316',
    icon: '🔥',
    description: 'Warm flickering fire effect',
    defaultDurationMs: 3000,
  },
  FLASHBANG: {
    label: 'Flashbang',
    color: '#ffffff',
    icon: '💥',
    description: 'Single blinding white flash',
    defaultDurationMs: 600,
  },
  EXPLOSION: {
    label: 'Explosion',
    color: '#ef4444',
    icon: '💣',
    description: 'Multi-burst explosive flash',
    defaultDurationMs: 1200,
  },
  PULSE: {
    label: 'Pulse',
    color: '#a78bfa',
    icon: '💜',
    description: 'Smooth rhythmic pulsing light',
    defaultDurationMs: 2000,
  },
  STROBE: {
    label: 'Strobe',
    color: '#e2e8f0',
    icon: '🔆',
    description: 'Rapid repeating flashes',
    defaultDurationMs: 2000,
  },
  SIREN: {
    label: 'Siren',
    color: '#3b82f6',
    icon: '🚨',
    description: 'Alternating emergency strobe pattern',
    defaultDurationMs: 3000,
  },
  AURORA: {
    label: 'Aurora',
    color: '#34d399',
    icon: '🌌',
    description: 'Slow undulating northern-lights effect',
    defaultDurationMs: 8000,
  },
  CANDLE: {
    label: 'Candle',
    color: '#fcd34d',
    icon: '🕯️',
    description: 'Gentle candlelight flicker',
    defaultDurationMs: 4000,
  },
  GUNFIRE: {
    label: 'Gunfire',
    color: '#fb923c',
    icon: '🔫',
    description: 'Rapid muzzle-flash bursts',
    defaultDurationMs: 500,
  },
  NEON: {
    label: 'Neon',
    color: '#f472b6',
    icon: '💡',
    description: 'Buzzing neon-tube flicker',
    defaultDurationMs: 3000,
  },
  BREATHING: {
    label: 'Breathing',
    color: '#60a5fa',
    icon: '🌬️',
    description: 'Slow inhale/exhale brightness cycle',
    defaultDurationMs: 4000,
  },
  SPARK: {
    label: 'Spark',
    color: '#fde68a',
    icon: '✨',
    description: 'Random electrical spark bursts',
    defaultDurationMs: 1000,
  },
};

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  LIGHTNING: { flash_count: 2, decay_ms: 500 },
  FLASHBANG: { flash_count: 1, decay_ms: 500 },
  EXPLOSION: { flash_count: 3, decay_ms: 500 },
  GUNFIRE: { flash_count: 4, decay_ms: 500 },
  SIREN: { flash_count: 8 },
  STROBE: { flash_count: 10 },
  FLAME: { flicker_rate_hz: 8.0, randomness: 0.5 },
  CANDLE: { flicker_rate_hz: 3.0, randomness: 0.5 },
  NEON: { flicker_rate_hz: 15.0, randomness: 0.5 },
  AURORA: { flicker_rate_hz: 0.5, randomness: 0.5 },
  PULSE: { pulse_rate_hz: 1.0 },
  BREATHING: { pulse_rate_hz: 1.0 },
  SPARK: { randomness: 0.5 },
};

export function getEffectDisplayInfo(effectType: EffectType): EffectDisplayInfo {
  const info = DISPLAY_INFO[effectType];
  if (!info) {
    return {
      label: 'Unknown',
      color: '#94a3b8',
      icon: '?',
      description: 'Unknown effect type',
      defaultDurationMs: 1000,
    };
  }
  return info;
}

export function getDefaultEffectParams(effectType: EffectType): Record<string, number> {
  return DEFAULT_PARAMS[effectType] ?? {};
}
