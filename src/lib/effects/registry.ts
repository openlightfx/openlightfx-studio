import type { EffectDefinition, IEffectRenderer, SpreadPattern } from '../types/effects.js';
import type { EffectType } from '../types/track.js';
import { EFFECT_DEFINITIONS, EFFECT_DEFINITION_MAP } from './definitions.js';
import { getSpreadPattern } from './spread-patterns.js';

import { lightningRenderer } from './renderers/lightning.js';
import { flameRenderer } from './renderers/flame.js';
import { flashbangRenderer } from './renderers/flashbang.js';
import { explosionRenderer } from './renderers/explosion.js';
import { pulseRenderer } from './renderers/pulse.js';
import { strobeRenderer } from './renderers/strobe.js';
import { sirenRenderer } from './renderers/siren.js';
import { auroraRenderer } from './renderers/aurora.js';
import { candleRenderer } from './renderers/candle.js';
import { gunfireRenderer } from './renderers/gunfire.js';
import { neonRenderer } from './renderers/neon.js';
import { breathingRenderer } from './renderers/breathing.js';
import { sparkRenderer } from './renderers/spark.js';

// ============================================================
// Renderer map
// ============================================================

const rendererMap = new Map<EffectType, IEffectRenderer>([
  ['LIGHTNING', lightningRenderer],
  ['FLAME', flameRenderer],
  ['FLASHBANG', flashbangRenderer],
  ['EXPLOSION', explosionRenderer],
  ['PULSE', pulseRenderer],
  ['STROBE', strobeRenderer],
  ['SIREN', sirenRenderer],
  ['AURORA', auroraRenderer],
  ['CANDLE', candleRenderer],
  ['GUNFIRE', gunfireRenderer],
  ['NEON', neonRenderer],
  ['BREATHING', breathingRenderer],
  ['SPARK', sparkRenderer],
]);

// ============================================================
// Registry — central registry mapping EffectType to definition + renderer
// ============================================================

/** Complete effect registry: EffectType → EffectDefinition */
export const effectRegistry: Map<EffectType, EffectDefinition> = EFFECT_DEFINITION_MAP;

/** Get the definition for an effect type. Throws if not found. */
export function getEffectDefinition(type: EffectType): EffectDefinition {
  const def = EFFECT_DEFINITION_MAP.get(type);
  if (!def) {
    throw new Error(`Unknown effect type: ${type}`);
  }
  return def;
}

/** Get the renderer for an effect type. Throws if not found. */
export function getEffectRenderer(type: EffectType): IEffectRenderer {
  const renderer = rendererMap.get(type);
  if (!renderer) {
    throw new Error(`No renderer for effect type: ${type}`);
  }
  return renderer;
}

/** Ordered list of all effect types for palette display. */
export function getAllEffectTypes(): EffectType[] {
  return EFFECT_DEFINITIONS.map((def) => def.type);
}

/** Get the spread pattern for an effect type and channel template name. */
export function getEffectSpreadPattern(
  type: EffectType,
  templateName: string
): SpreadPattern | null {
  return getSpreadPattern(type, templateName);
}
