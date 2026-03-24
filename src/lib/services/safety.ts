import type { LightFXTrack, SafetyInfo, EffectType, EffectKeyframe } from '$lib/types';

const FLASHING_EFFECTS: Set<EffectType> = new Set([
	'LIGHTNING',
	'FLASHBANG',
	'GUNFIRE',
	'STROBE',
	'SPARK'
]);

const STROBING_EFFECTS: Set<EffectType> = new Set(['STROBE']);

const MODERATE_EFFECTS: Set<EffectType> = new Set([
	'PULSE',
	'BREATHING',
	'AURORA',
	'FLAME',
	'CANDLE',
	'NEON',
	'SIREN'
]);

const INTENSE_EFFECTS: Set<EffectType> = new Set([
	'LIGHTNING',
	'FLASHBANG',
	'EXPLOSION',
	'GUNFIRE',
	'SPARK'
]);

export function computeSafetyInfo(track: LightFXTrack): SafetyInfo {
	const allEffects = collectEffectKeyframes(track);
	const effectTypes = new Set(allEffects.map((e) => e.effectType));

	const containsFlashing = [...effectTypes].some((t) => FLASHING_EFFECTS.has(t));
	const containsStrobing = [...effectTypes].some((t) => STROBING_EFFECTS.has(t));
	const intensityRating = computeIntensityRating(effectTypes, allEffects);
	const maxFlashFrequencyHz = computeMaxFlashFrequency(allEffects);
	const maxBrightnessDelta = computeMaxBrightnessDelta(track);

	let warningText = '';
	if (containsStrobing) {
		warningText = 'This track contains strobing effects that may cause discomfort or seizures in photosensitive individuals.';
	} else if (containsFlashing) {
		warningText = 'This track contains flashing effects that may cause discomfort in photosensitive individuals.';
	}

	return {
		containsFlashing,
		containsStrobing,
		maxFlashFrequencyHz,
		maxBrightnessDelta,
		warningText,
		intensityRating
	};
}

function collectEffectKeyframes(track: LightFXTrack): EffectKeyframe[] {
	const effects: EffectKeyframe[] = [];
	for (const channel of track.channels ?? []) {
		if (channel.effectKeyframes) {
			effects.push(...channel.effectKeyframes);
		}
	}
	return effects;
}

function computeIntensityRating(
	effectTypes: Set<EffectType>,
	allEffects: EffectKeyframe[]
): 'SUBTLE' | 'MODERATE' | 'INTENSE' | 'EXTREME' {
	const hasStrobe = [...effectTypes].some((t) => STROBING_EFFECTS.has(t));
	const intenseCount = allEffects.filter((e) => INTENSE_EFFECTS.has(e.effectType)).length;

	if (hasStrobe || intenseCount >= 5) return 'EXTREME';

	if ([...effectTypes].some((t) => INTENSE_EFFECTS.has(t))) return 'INTENSE';

	if ([...effectTypes].some((t) => MODERATE_EFFECTS.has(t))) return 'MODERATE';

	return 'SUBTLE';
}

/**
 * max over all flashing effect keyframes of (flash_count / duration_ms) × 1000
 */
function computeMaxFlashFrequency(allEffects: EffectKeyframe[]): number {
	let maxHz = 0;

	for (const effect of allEffects) {
		if (!FLASHING_EFFECTS.has(effect.effectType)) continue;

		const durationMs = effect.durationMs ?? 0;
		if (durationMs <= 0) continue;

		const flashCount = getFlashCount(effect);
		const hz = (flashCount / durationMs) * 1000;
		maxHz = Math.max(maxHz, hz);
	}

	return maxHz;
}

function getFlashCount(effect: EffectKeyframe): number {
	// Check effectParams map for explicit flash_count
	if (effect.effectParams?.['flash_count'] != null) {
		const val = Number(effect.effectParams['flash_count']);
		if (!isNaN(val) && val > 0) return val;
	}

	// Default flash counts per effect type
	const defaults: Partial<Record<EffectType, number>> = {
		LIGHTNING: 2,
		FLASHBANG: 1,
		EXPLOSION: 3,
		GUNFIRE: 4,
		STROBE: 10,
		SPARK: 1
	};

	return defaults[effect.effectType] ?? 1;
}

function computeMaxBrightnessDelta(track: LightFXTrack): number {
	let maxDelta = 0;

	for (const channel of track.channels ?? []) {
		const keyframes = channel.keyframes;
		if (!keyframes || keyframes.length < 2) continue;

		// Sort by timestamp
		const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);

		for (let i = 1; i < sorted.length; i++) {
			const prevBrightness = sorted[i - 1].brightness ?? 100;
			const currBrightness = sorted[i].brightness ?? 100;
			maxDelta = Math.max(maxDelta, Math.abs(currBrightness - prevBrightness));
		}
	}

	return maxDelta;
}
