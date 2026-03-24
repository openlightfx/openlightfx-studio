import type { SpreadPattern } from '../types/effects.js';
import type { EffectType } from '../types/track.js';
import { CHANNEL_TEMPLATES } from '../types/channels.js';

// ============================================================
// Spread patterns for all 13 effects × 6 channel templates
// ============================================================

type PatternBuilder = (templateName: string, channelIds: string[]) => SpreadPattern;

// Helper to create a single-stage pattern (all channels fire together)
function allAtOnce(templateName: string, channelIds: string[]): SpreadPattern {
  return {
    templateName,
    stages: [{ channelIds: [...channelIds], delayMs: 0 }],
    defaultOffsetMs: 0,
  };
}

// Helper to create a front-to-back sweep pattern
function frontToBack(templateName: string, channelIds: string[], offsetMs = 150): SpreadPattern {
  const stages: SpreadPattern['stages'] = [];

  const front = channelIds.filter((id) => ['left', 'center', 'right'].includes(id));
  const surrounds = channelIds.filter((id) =>
    ['surround-left', 'surround-right'].includes(id)
  );
  const backs = channelIds.filter((id) => ['back-left', 'back-right'].includes(id));
  const ambient = channelIds.filter((id) => ['ambient', 'main'].includes(id));

  if (front.length > 0) stages.push({ channelIds: front, delayMs: 0 });
  if (surrounds.length > 0) stages.push({ channelIds: surrounds, delayMs: offsetMs });
  if (backs.length > 0) stages.push({ channelIds: backs, delayMs: offsetMs });
  if (ambient.length > 0) stages.push({ channelIds: ambient, delayMs: offsetMs });

  if (stages.length === 0) stages.push({ channelIds: [...channelIds], delayMs: 0 });

  return { templateName, stages, defaultOffsetMs: offsetMs };
}

// Left-to-right sweep pattern
function leftToRight(templateName: string, channelIds: string[], offsetMs = 150): SpreadPattern {
  const stages: SpreadPattern['stages'] = [];

  const left = channelIds.filter((id) => ['left', 'surround-left', 'back-left'].includes(id));
  const center = channelIds.filter((id) => ['center', 'main'].includes(id));
  const right = channelIds.filter((id) => ['right', 'surround-right', 'back-right'].includes(id));
  const ambient = channelIds.filter((id) => id === 'ambient');

  if (left.length > 0) stages.push({ channelIds: left, delayMs: 0 });
  if (center.length > 0) stages.push({ channelIds: center, delayMs: offsetMs });
  if (right.length > 0) stages.push({ channelIds: right, delayMs: offsetMs });
  if (ambient.length > 0) stages.push({ channelIds: ambient, delayMs: offsetMs });

  if (stages.length === 0) stages.push({ channelIds: [...channelIds], delayMs: 0 });

  return { templateName, stages, defaultOffsetMs: offsetMs };
}

// Center outward pattern
function centerOutward(templateName: string, channelIds: string[], offsetMs = 150): SpreadPattern {
  const stages: SpreadPattern['stages'] = [];

  const center = channelIds.filter((id) => ['center', 'main'].includes(id));
  const frontLR = channelIds.filter((id) => ['left', 'right'].includes(id));
  const surrounds = channelIds.filter((id) =>
    ['surround-left', 'surround-right'].includes(id)
  );
  const backs = channelIds.filter((id) => ['back-left', 'back-right'].includes(id));
  const ambient = channelIds.filter((id) => id === 'ambient');

  if (center.length > 0) stages.push({ channelIds: center, delayMs: 0 });
  if (frontLR.length > 0) stages.push({ channelIds: frontLR, delayMs: offsetMs });
  if (surrounds.length > 0) stages.push({ channelIds: surrounds, delayMs: offsetMs });
  if (backs.length > 0) stages.push({ channelIds: backs, delayMs: offsetMs });
  if (ambient.length > 0) stages.push({ channelIds: ambient, delayMs: offsetMs });

  if (stages.length === 0) stages.push({ channelIds: [...channelIds], delayMs: 0 });

  return { templateName, stages, defaultOffsetMs: offsetMs };
}

// Alternating left/right stages (for siren)
function alternatingLR(templateName: string, channelIds: string[], offsetMs = 150): SpreadPattern {
  const stages: SpreadPattern['stages'] = [];

  const leftSide = channelIds.filter((id) =>
    ['left', 'surround-left', 'back-left'].includes(id)
  );
  const rightSide = channelIds.filter((id) =>
    ['right', 'surround-right', 'back-right'].includes(id)
  );
  const other = channelIds.filter(
    (id) => !leftSide.includes(id) && !rightSide.includes(id)
  );

  if (leftSide.length > 0) stages.push({ channelIds: leftSide, delayMs: 0 });
  if (rightSide.length > 0) stages.push({ channelIds: rightSide, delayMs: offsetMs });
  if (other.length > 0) stages.push({ channelIds: other, delayMs: offsetMs });

  if (stages.length === 0) stages.push({ channelIds: [...channelIds], delayMs: 0 });

  return { templateName, stages, defaultOffsetMs: offsetMs };
}

// ============================================================
// Per-effect pattern builder selection
// ============================================================

const EFFECT_PATTERN_BUILDERS: Record<EffectType, PatternBuilder> = {
  EFFECT_UNSPECIFIED: allAtOnce,
  // Directional sweep effects
  LIGHTNING: (name, ids) => leftToRight(name, ids, 150),
  GUNFIRE: (name, ids) => centerOutward(name, ids, 80),
  EXPLOSION: (name, ids) => centerOutward(name, ids, 100),
  FLASHBANG: (name, ids) => allAtOnce(name, ids),
  SPARK: (name, ids) => centerOutward(name, ids, 50),
  // Alternating effects
  SIREN: (name, ids) => alternatingLR(name, ids, 150),
  // Uniform effects (all channels together)
  STROBE: allAtOnce,
  PULSE: allAtOnce,
  BREATHING: allAtOnce,
  // Ambient/atmospheric effects — front to back wash
  FLAME: (name, ids) => frontToBack(name, ids, 100),
  CANDLE: (name, ids) => frontToBack(name, ids, 80),
  AURORA: allAtOnce,
  NEON: allAtOnce,
};

// ============================================================
// Pre-computed pattern cache: effectType → templateName → SpreadPattern
// ============================================================

const patternCache = new Map<EffectType, Map<string, SpreadPattern>>();

function ensurePatternCache(): void {
  if (patternCache.size > 0) return;

  const effectTypes = Object.keys(EFFECT_PATTERN_BUILDERS) as EffectType[];
  for (const effectType of effectTypes) {
    const templateMap = new Map<string, SpreadPattern>();
    const builder = EFFECT_PATTERN_BUILDERS[effectType];

    for (const template of CHANNEL_TEMPLATES) {
      const channelIds = template.channels.map((ch) => ch.id);
      templateMap.set(template.name, builder(template.name, channelIds));
    }

    patternCache.set(effectType, templateMap);
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Get the spread pattern for an effect type and channel template.
 * Returns null if the template is not recognized.
 */
export function getSpreadPattern(
  effectType: EffectType,
  templateName: string
): SpreadPattern | null {
  ensurePatternCache();
  return patternCache.get(effectType)?.get(templateName) ?? null;
}

/**
 * Detect which channel template matches the given channel IDs.
 * Returns the template name, or null if no template matches exactly.
 */
export function matchChannelTemplate(channelIds: string[]): string | null {
  const sorted = [...channelIds].sort();
  for (const template of CHANNEL_TEMPLATES) {
    const templateIds = template.channels.map((ch) => ch.id).sort();
    if (
      sorted.length === templateIds.length &&
      sorted.every((id, i) => id === templateIds[i])
    ) {
      return template.name;
    }
  }
  return null;
}
