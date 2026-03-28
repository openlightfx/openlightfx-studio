// ============================================================
// Validation Service — implements all rules from Track Format Spec §7
// ============================================================

import type { LightFXTrack, EffectKeyframe } from '$lib/types/index.js';

export interface ValidationIssue {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  context?: { channelId?: string; keyframeId?: string; effectId?: string };
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate a LightFXTrack against all rules from Track Format Specification §7.
 * Returns a result with all issues found. `valid` is true only if there are no errors.
 */
export function validateTrack(track: LightFXTrack): ValidationResult {
  const issues: ValidationIssue[] = [];

  validateV001(track, issues);
  validateV002(track, issues);
  validateV003(track, issues);
  validateV004(track, issues);
  validateV005(track, issues);
  validateV006(track, issues);
  validateV007(track, issues);
  validateV008(track, issues);
  validateV009(track, issues);
  validateV010(track, issues);
  validateV011(track, issues);
  validateV012(track, issues);
  validateV013(track, issues);
  validateV014(track, issues);
  validateV015(track, issues);
  validateV016(track, issues);
  validateV017(track, issues);
  validateV017a(track, issues);
  validateV020(track, issues);
  validateV021(track, issues);

  return {
    valid: issues.every((i) => i.severity !== 'error'),
    issues,
  };
}

// V-001: version must be a supported version (currently: 1)
function validateV001(track: LightFXTrack, issues: ValidationIssue[]): void {
  if (track.version !== 1) {
    issues.push({
      ruleId: 'V-001',
      severity: 'error',
      message: `Unsupported track version: ${track.version}. Expected 1.`,
    });
  }
}

// V-002: metadata must be present
function validateV002(track: LightFXTrack, issues: ValidationIssue[]): void {
  if (!track.metadata) {
    issues.push({
      ruleId: 'V-002',
      severity: 'error',
      message: 'Track metadata is required.',
    });
  }
}

// V-003: metadata.movie_reference.imdb_id must match pattern tt\d{7,}
function validateV003(track: LightFXTrack, issues: ValidationIssue[]): void {
  const imdbId = track.metadata?.movieReference?.imdbId;
  if (imdbId && !/^tt\d{7,}$/.test(imdbId)) {
    issues.push({
      ruleId: 'V-003',
      severity: 'error',
      message: `Invalid IMDB ID format: "${imdbId}". Must match pattern tt followed by 7+ digits.`,
    });
  }
}

// V-004: metadata.duration_ms must be > 0
function validateV004(track: LightFXTrack, issues: ValidationIssue[]): void {
  if (!track.metadata) return;
  if (!track.metadata.durationMs || track.metadata.durationMs <= 0) {
    issues.push({
      ruleId: 'V-004',
      severity: 'error',
      message: 'Track duration must be greater than 0.',
    });
  }
}

// V-005: Each channel id must be unique within the track
function validateV005(track: LightFXTrack, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  for (const channel of track.channels ?? []) {
    if (seen.has(channel.id)) {
      issues.push({
        ruleId: 'V-005',
        severity: 'error',
        message: `Duplicate channel ID: "${channel.id}".`,
        context: { channelId: channel.id },
      });
    }
    seen.add(channel.id);
  }
}

// V-006: Keyframes must reference valid channels; within each channel sorted ascending by timestamp_ms
function validateV006(track: LightFXTrack, issues: ValidationIssue[]): void {
  const channelIds = new Set((track.channels ?? []).map((c) => c.id));
  const byChannel = new Map<string, number[]>();

  for (const kf of track.keyframes ?? []) {
    if (!channelIds.has(kf.channelId)) {
      issues.push({
        ruleId: 'V-006',
        severity: 'error',
        message: `Keyframe "${kf.id}" references unknown channel "${kf.channelId}".`,
        context: { channelId: kf.channelId, keyframeId: kf.id },
      });
    }

    let list = byChannel.get(kf.channelId);
    if (!list) {
      list = [];
      byChannel.set(kf.channelId, list);
    }
    list.push(kf.timestampMs);
  }

  for (const [channelId, timestamps] of byChannel) {
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) {
        issues.push({
          ruleId: 'V-006',
          severity: 'error',
          message: `Keyframes on channel "${channelId}" are not sorted by timestamp (${timestamps[i - 1]}ms > ${timestamps[i]}ms).`,
          context: { channelId },
        });
        break;
      }
    }
  }
}

// V-007: keyframe.brightness must be in range [0, 100]
function validateV007(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const kf of track.keyframes ?? []) {
    if (kf.brightness < 0 || kf.brightness > 100) {
      issues.push({
        ruleId: 'V-007',
        severity: 'error',
        message: `Keyframe "${kf.id}" brightness ${kf.brightness} is out of range [0, 100].`,
        context: { keyframeId: kf.id, channelId: kf.channelId },
      });
    }
  }
}

// V-008: keyframe.color RGB values must be in range [0, 255]
function validateV008(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const kf of track.keyframes ?? []) {
    if (!kf.color) continue;
    const { r, g, b } = kf.color;
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      issues.push({
        ruleId: 'V-008',
        severity: 'error',
        message: `Keyframe "${kf.id}" color (${r}, ${g}, ${b}) has values out of range [0, 255].`,
        context: { keyframeId: kf.id, channelId: kf.channelId },
      });
    }
  }
}

// V-009: keyframe.color_temperature must be in range [1000, 10000]
function validateV009(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const kf of track.keyframes ?? []) {
    if (kf.colorMode !== 'COLOR_TEMPERATURE') continue;
    if (kf.colorTemperature < 1000 || kf.colorTemperature > 10000) {
      issues.push({
        ruleId: 'V-009',
        severity: 'error',
        message: `Keyframe "${kf.id}" color temperature ${kf.colorTemperature}K is out of range [1000, 10000].`,
        context: { keyframeId: kf.id, channelId: kf.channelId },
      });
    }
  }
}

// V-010: keyframe.timestamp_ms must be ≤ metadata.duration_ms
function validateV010(track: LightFXTrack, issues: ValidationIssue[]): void {
  const durationMs = track.metadata?.durationMs ?? 0;
  if (durationMs <= 0) return;

  for (const kf of track.keyframes ?? []) {
    if (kf.timestampMs > durationMs) {
      issues.push({
        ruleId: 'V-010',
        severity: 'error',
        message: `Keyframe "${kf.id}" timestamp ${kf.timestampMs}ms exceeds track duration ${durationMs}ms.`,
        context: { keyframeId: kf.id, channelId: kf.channelId },
      });
    }
  }

  for (const ek of track.effectKeyframes ?? []) {
    if (ek.timestampMs > durationMs) {
      issues.push({
        ruleId: 'V-010',
        severity: 'error',
        message: `Effect keyframe "${ek.id}" timestamp ${ek.timestampMs}ms exceeds track duration ${durationMs}ms.`,
        context: { effectId: ek.id, channelId: ek.channelId },
      });
    }
  }
}

// V-011: At least one channel must be present
function validateV011(track: LightFXTrack, issues: ValidationIssue[]): void {
  if (!track.channels || track.channels.length === 0) {
    issues.push({
      ruleId: 'V-011',
      severity: 'error',
      message: 'Track must contain at least one channel.',
    });
  }
}

// V-012: keyframe.transition_ms must not cause a transition to begin before time 0
function validateV012(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const kf of track.keyframes ?? []) {
    if (kf.transitionMs > kf.timestampMs) {
      issues.push({
        ruleId: 'V-012',
        severity: 'error',
        message: `Keyframe "${kf.id}" transition (${kf.transitionMs}ms) would start before time 0 (timestamp: ${kf.timestampMs}ms).`,
        context: { keyframeId: kf.id, channelId: kf.channelId },
      });
    }
  }
}

// V-013: Effect keyframes: duration_ms must be > 0
function validateV013(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const ek of track.effectKeyframes ?? []) {
    if (!ek.durationMs || ek.durationMs <= 0) {
      issues.push({
        ruleId: 'V-013',
        severity: 'error',
        message: `Effect keyframe "${ek.id}" duration must be > 0.`,
        context: { effectId: ek.id, channelId: ek.channelId },
      });
    }
  }
}

// V-014: Effect keyframes: intensity must be in range [0, 100]
function validateV014(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const ek of track.effectKeyframes ?? []) {
    if (ek.intensity < 0 || ek.intensity > 100) {
      issues.push({
        ruleId: 'V-014',
        severity: 'error',
        message: `Effect keyframe "${ek.id}" intensity ${ek.intensity} is out of range [0, 100].`,
        context: { effectId: ek.id, channelId: ek.channelId },
      });
    }
  }
}

// V-015: Effects with required_capability SHOULD have fallback_color/fallback_brightness
function validateV015(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const ek of track.effectKeyframes ?? []) {
    if (ek.requiredCapability && ek.requiredCapability !== 'CAPABILITY_ANY') {
      if (!hasFallback(ek)) {
        issues.push({
          ruleId: 'V-015',
          severity: 'warning',
          message: `Effect keyframe "${ek.id}" requires "${ek.requiredCapability}" but has no fallback color/brightness.`,
          context: { effectId: ek.id, channelId: ek.channelId },
        });
      }
    }
  }
}

function hasFallback(ek: EffectKeyframe): boolean {
  const hasFallbackColor =
    ek.fallbackColor &&
    (ek.fallbackColor.r > 0 || ek.fallbackColor.g > 0 || ek.fallbackColor.b > 0);
  return !!(hasFallbackColor || ek.fallbackBrightness > 0);
}

// V-016: If safety_info.contains_flashing is true, max_flash_frequency_hz must be > 0
function validateV016(track: LightFXTrack, issues: ValidationIssue[]): void {
  if (!track.safetyInfo) return;
  if (track.safetyInfo.containsFlashing && track.safetyInfo.maxFlashFrequencyHz <= 0) {
    issues.push({
      ruleId: 'V-016',
      severity: 'error',
      message:
        'Safety info indicates flashing but max_flash_frequency_hz is 0. It must be > 0 when flashing is present.',
    });
  }
}

// V-017: If any flashing effect is present, safety_info.contains_flashing MUST be true
function validateV017(track: LightFXTrack, issues: ValidationIssue[]): void {
  const flashingTypes = new Set(['LIGHTNING', 'FLASHBANG', 'GUNFIRE', 'STROBE', 'SPARK']);
  const hasFlashing = (track.effectKeyframes ?? []).some((e) => flashingTypes.has(e.effectType));

  if (hasFlashing && !track.safetyInfo?.containsFlashing) {
    issues.push({
      ruleId: 'V-017',
      severity: 'error',
      message:
        'Track contains flashing effects but safety_info.contains_flashing is not set to true.',
    });
  }
}

// V-017a: If any STROBE effect is present, safety_info.contains_strobing MUST be true
function validateV017a(track: LightFXTrack, issues: ValidationIssue[]): void {
  const hasStrobe = (track.effectKeyframes ?? []).some((e) => e.effectType === 'STROBE');

  if (hasStrobe && !track.safetyInfo?.containsStrobing) {
    issues.push({
      ruleId: 'V-017a',
      severity: 'error',
      message:
        'Track contains STROBE effects but safety_info.contains_strobing is not set to true.',
    });
  }
}

// V-018: Scene markers must be sorted ascending by timestamp_ms
// Note: Scene markers are Studio-only and not in exported .lightfx files (V-019 removed).
// This validator still checks if scene markers are included in the track structure.
// Since LightFXTrack doesn't have scene markers, this is a no-op for exported files.

// V-020: metadata.start_behavior and end_behavior use BoundaryBehavior enum values
function validateV020(track: LightFXTrack, issues: ValidationIssue[]): void {
  if (!track.metadata) return;
  const validBehaviors = new Set(['BOUNDARY_UNSPECIFIED', 'LEAVE', 'OFF', 'ON']);

  if (!validBehaviors.has(track.metadata.startBehavior)) {
    issues.push({
      ruleId: 'V-020',
      severity: 'error',
      message: `Invalid start_behavior: "${track.metadata.startBehavior}".`,
    });
  }

  if (!validBehaviors.has(track.metadata.endBehavior)) {
    issues.push({
      ruleId: 'V-020',
      severity: 'error',
      message: `Invalid end_behavior: "${track.metadata.endBehavior}".`,
    });
  }
}

// V-021: EffectKeyframe.params values must be finite numbers
function validateV021(track: LightFXTrack, issues: ValidationIssue[]): void {
  for (const ek of track.effectKeyframes ?? []) {
    if (!ek.effectParams?.params) continue;
    for (const [key, value] of Object.entries(ek.effectParams.params)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({
          ruleId: 'V-021',
          severity: 'error',
          message: `Effect keyframe "${ek.id}" param "${key}" has non-finite value: ${value}.`,
          context: { effectId: ek.id, channelId: ek.channelId },
        });
      }
    }
  }
}
