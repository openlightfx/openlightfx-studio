// Effects system — barrel export
export {
  effectRegistry,
  getEffectDefinition,
  getEffectRenderer,
  getAllEffectTypes,
  getEffectSpreadPattern,
} from './registry.js';

export { EFFECT_DEFINITIONS, EFFECT_DEFINITION_MAP } from './definitions.js';

export {
  getSpreadPattern,
  matchChannelTemplate,
} from './spread-patterns.js';

export { clamp, lerp, lerpColor } from './color-utils.js';

// Renderer re-exports
export { lightningRenderer } from './renderers/lightning.js';
export { flameRenderer } from './renderers/flame.js';
export { flashbangRenderer } from './renderers/flashbang.js';
export { explosionRenderer } from './renderers/explosion.js';
export { pulseRenderer } from './renderers/pulse.js';
export { strobeRenderer } from './renderers/strobe.js';
export { sirenRenderer } from './renderers/siren.js';
export { auroraRenderer } from './renderers/aurora.js';
export { candleRenderer } from './renderers/candle.js';
export { gunfireRenderer } from './renderers/gunfire.js';
export { neonRenderer } from './renderers/neon.js';
export { breathingRenderer } from './renderers/breathing.js';
export { sparkRenderer } from './renderers/spark.js';
