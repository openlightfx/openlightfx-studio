import type { EffectInput, EffectType } from '../../../src/lib/domain';

export const FIXTURE_EFFECT_TYPES: EffectType[] = [
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

export function effectCases(): { name: string; input: EffectInput }[] {
  const cases: { name: string; input: EffectInput }[] = [];
  for (const effectType of FIXTURE_EFFECT_TYPES) {
    cases.push({
      name: `${effectType}-default`,
      input: {
        effectType,
        durationMs: 0,
        intensity: 0,
        primaryColor: null,
        secondaryColor: null,
        params: {},
      },
    });
    const params: Record<string, number> =
      effectType === 'STROBE' || effectType === 'FLAME'
        ? { flicker_rate_hz: 4 }
        : effectType === 'PULSE' || effectType === 'SIREN' || effectType === 'BREATHING'
          ? { pulse_rate_hz: 0.5 }
          : effectType === 'LIGHTNING' || effectType === 'GUNFIRE'
            ? { flash_count: 3 }
            : {};
    cases.push({
      name: `${effectType}-custom`,
      input: {
        effectType,
        durationMs: 1000,
        intensity: 80,
        primaryColor: effectType === 'NEON' || effectType === 'AURORA' ? { r: 0, g: 255, b: 180 } : null,
        secondaryColor: null,
        params,
      },
    });
  }
  return cases;
}
