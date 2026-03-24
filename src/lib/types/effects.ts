// ============================================================
// Effect system types — registry, renderers, spread patterns
// ============================================================

import type { EffectType, RGBColor, RequiredCapability } from './track.js';

/** Canonical effect parameter definition */
export interface EffectParamDef {
  key: string;
  label: string;
  type: 'integer' | 'float';
  min: number;
  max: number;
  default: number;
  /** Which effect types this param applies to */
  applicableTo: EffectType[];
}

/** Metadata about an effect type (for palette display and rendering) */
export interface EffectDefinition {
  type: EffectType;
  name: string;
  description: string;
  icon: string;
  /** CSS gradient or color for palette preview */
  previewColors: RGBColor[];
  /** Parameters applicable to this effect */
  params: EffectParamDef[];
  /** Default duration in ms */
  defaultDurationMs: number;
  /** Default intensity 0-100 */
  defaultIntensity: number;
  /** Default primary color */
  defaultPrimaryColor: RGBColor;
  /** Default secondary color */
  defaultSecondaryColor: RGBColor;
  /** Required capability */
  requiredCapability: RequiredCapability;
  /** Default fallback color for bulbs that can't render */
  defaultFallbackColor: RGBColor;
  defaultFallbackBrightness: number;
}

/** A stage in the channel spread pattern for an effect */
export interface SpreadStage {
  /** Channel IDs in this stage (all fire simultaneously) */
  channelIds: string[];
  /** Delay from the previous stage in ms */
  delayMs: number;
}

/** Effect spread pattern for a specific channel layout */
export interface SpreadPattern {
  /** The channel template name this pattern applies to */
  templateName: string;
  /** Ordered stages of the spread */
  stages: SpreadStage[];
  /** Default timing offset between stages in ms */
  defaultOffsetMs: number;
}

/** Color sample at a point in time for effect preview rendering */
export interface EffectSample {
  color: RGBColor;
  brightness: number; // 0-100
}

/** Interface for effect renderers that produce color samples over time */
export interface IEffectRenderer {
  /** Compute the color/brightness at a given time offset within the effect */
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample;
}
