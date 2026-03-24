import { encodeTrack, validateTrack, type ValidationError } from '$lib/proto/index';
import type {
	LightFXTrack,
	ChannelGroup,
	Keyframe,
	EffectKeyframe
} from '$lib/types';

// ============================================================
// Export options
// ============================================================

export interface ExportOptions {
	channelGroups?: ChannelGroup[];
	videoDurationMs?: number;
}

export interface ExportResult {
	data: Uint8Array;
	warnings: string[];
}

// ============================================================
// Channel group expansion
// ============================================================

/**
 * Expand channel groups into per-channel keyframes by applying group
 * offsets (timing, hue, brightness) to the source channel's keyframes.
 */
function expandChannelGroups(
	track: LightFXTrack,
	groups: ChannelGroup[]
): LightFXTrack {
	if (groups.length === 0) return track;

	const expandedKeyframes: Keyframe[] = [...track.keyframes];
	const expandedEffectKeyframes: EffectKeyframe[] = [...track.effectKeyframes];

	for (const group of groups) {
		if (group.channelIds.length < 2) continue;

		const sourceChannelId = group.channelIds[0];

		const sourceKeyframes = track.keyframes.filter(
			(kf) => kf.channelId === sourceChannelId
		);
		const sourceEffectKeyframes = track.effectKeyframes.filter(
			(ek) => ek.channelId === sourceChannelId
		);

		for (let i = 1; i < group.channelIds.length; i++) {
			const targetChannelId = group.channelIds[i];
			const offset = group.offsets.find((o) => o.channelId === targetChannelId);
			const timingOffset = offset?.timingOffsetMs ?? group.defaultTimingOffsetMs;

			// Only expand if the target channel has no keyframes of its own
			const targetHasOwn = track.keyframes.some(
				(kf) => kf.channelId === targetChannelId
			);
			if (targetHasOwn) continue;

			for (const kf of sourceKeyframes) {
				expandedKeyframes.push({
					...kf,
					id: `${kf.id}_grp_${targetChannelId}`,
					channelId: targetChannelId,
					timestampMs: Math.max(0, kf.timestampMs + timingOffset),
					brightness: clamp(kf.brightness + (offset?.brightnessOffset ?? 0), 0, 100)
				});
			}

			for (const ek of sourceEffectKeyframes) {
				expandedEffectKeyframes.push({
					...ek,
					id: `${ek.id}_grp_${targetChannelId}`,
					channelId: targetChannelId,
					timestampMs: Math.max(0, ek.timestampMs + timingOffset)
				});
			}
		}
	}

	return {
		...track,
		keyframes: expandedKeyframes,
		effectKeyframes: expandedEffectKeyframes
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

// ============================================================
// Duration warning
// ============================================================

function checkDurationMismatch(
	track: LightFXTrack,
	videoDurationMs?: number
): string | null {
	if (videoDurationMs == null || videoDurationMs <= 0) return null;

	const diff = Math.abs(track.metadata.durationMs - videoDurationMs);
	if (diff > 5000) {
		const trackSec = (track.metadata.durationMs / 1000).toFixed(1);
		const videoSec = (videoDurationMs / 1000).toFixed(1);
		return `Track duration (${trackSec}s) differs from video duration (${videoSec}s) by more than 5 seconds`;
	}
	return null;
}

// ============================================================
// Marketplace-specific validation
// ============================================================

function validateMarketplaceFields(track: LightFXTrack): string[] {
	const errors: string[] = [];

	if (!track.metadata.title || track.metadata.title === 'Untitled Track') {
		errors.push('Track title is required for marketplace publishing');
	}
	if (!track.metadata.description) {
		errors.push('Track description is required for marketplace publishing');
	}
	if (!track.metadata.author) {
		errors.push('Author name is required for marketplace publishing');
	}
	if (!track.metadata.movieReference?.imdbId) {
		errors.push('IMDB ID is required for marketplace publishing');
	}
	if (!track.metadata.movieReference?.title) {
		errors.push('Movie title is required for marketplace publishing');
	}
	if (!track.metadata.movieReference?.year || track.metadata.movieReference.year <= 0) {
		errors.push('Movie year is required for marketplace publishing');
	}
	if (track.channels.length === 0) {
		errors.push('Track must have at least one channel');
	}
	if (track.metadata.durationMs <= 0) {
		errors.push('Track duration must be set');
	}
	if (track.metadata.tags.length === 0) {
		errors.push('At least one tag is recommended for marketplace publishing');
	}

	return errors;
}

// ============================================================
// Public API
// ============================================================

/**
 * Export a track to .lightfx protobuf binary.
 * Expands channel groups and validates before encoding.
 */
export function exportTrack(
	track: LightFXTrack,
	options: ExportOptions = {}
): ExportResult {
	const warnings: string[] = [];

	// Expand channel groups to per-channel keyframes
	const expanded = expandChannelGroups(track, options.channelGroups ?? []);

	// Validate
	const validationErrors = validateTrack(expanded);
	const errors = validationErrors.filter((e) => !isWarningRule(e.rule));
	if (errors.length > 0) {
		throw new ExportValidationError(
			'Track validation failed',
			validationErrors
		);
	}

	// Collect warnings from non-blocking validation issues
	for (const err of validationErrors) {
		if (isWarningRule(err.rule)) {
			warnings.push(`[${err.rule}] ${err.message}`);
		}
	}

	// Duration mismatch warning
	const durationWarning = checkDurationMismatch(expanded, options.videoDurationMs);
	if (durationWarning) {
		warnings.push(durationWarning);
	}

	const data = encodeTrack(expanded);
	return { data, warnings };
}

/**
 * Export a track for marketplace publishing with extra validation.
 */
export function exportForMarketplace(
	track: LightFXTrack,
	options: ExportOptions = {}
): ExportResult {
	// Marketplace-specific field checks
	const marketplaceErrors = validateMarketplaceFields(track);
	if (marketplaceErrors.length > 0) {
		throw new ExportValidationError(
			'Marketplace validation failed',
			marketplaceErrors.map((msg) => ({ rule: 'MARKETPLACE', message: msg }))
		);
	}

	return exportTrack(track, options);
}

/**
 * Get the duration mismatch warning string if applicable.
 */
export function getDurationWarning(
	track: LightFXTrack,
	videoDurationMs?: number
): string | null {
	return checkDurationMismatch(track, videoDurationMs);
}

// ============================================================
// Helpers
// ============================================================

/** Rules that produce warnings instead of hard errors */
function isWarningRule(rule: string): boolean {
	return rule === 'V-015';
}

export class ExportValidationError extends Error {
	constructor(
		message: string,
		public readonly validationErrors: ValidationError[] | { rule: string; message: string }[]
	) {
		super(message);
		this.name = 'ExportValidationError';
	}
}
