import type { Keyframe, RGBColor } from '$lib/types';
import { interpolateColor } from '$lib/utils/color';
import { kelvinToRgb } from '$lib/utils/color';

interface InterpolatedState {
	color: RGBColor;
	brightness: number;
	powerOn: boolean;
	colorTemperature: number;
	colorMode: 'RGB' | 'COLOR_TEMPERATURE';
}

/**
 * Get the interpolated state at a given time for a sorted array of keyframes on a single channel.
 * Keyframes must be pre-sorted by timestampMs ascending.
 */
export function interpolateAtTime(
	keyframes: Keyframe[],
	timeMs: number,
	defaultColor: RGBColor,
	defaultBrightness: number
): InterpolatedState {
	if (keyframes.length === 0) {
		return {
			color: defaultColor,
			brightness: defaultBrightness,
			powerOn: true,
			colorTemperature: 6500,
			colorMode: 'RGB'
		};
	}

	const { prev, next } = findSurroundingKeyframes(keyframes, timeMs);

	// Before first keyframe: use channel defaults
	if (!prev && next) {
		const transitionStart = next.timestampMs - (next.transitionMs ?? 0);

		if (timeMs < transitionStart) {
			return {
				color: defaultColor,
				brightness: defaultBrightness,
				powerOn: true,
				colorTemperature: 6500,
				colorMode: 'RGB'
			};
		}

		// In transition to first keyframe from defaults
		const t = getTransitionProgress(null, next, timeMs);
		const nextColor = resolveKeyframeColor(next);

		return {
			color: interpolateColor(defaultColor, nextColor, t),
			brightness: lerp(defaultBrightness, next.brightness ?? defaultBrightness, t),
			powerOn: t >= 1 ? (next.powerOn ?? true) : true,
			colorTemperature: next.colorMode === 'COLOR_TEMPERATURE'
				? lerp(6500, next.colorTemperature ?? 6500, t)
				: 6500,
			colorMode: t >= 1 ? (next.colorMode ?? 'RGB') : 'RGB'
		};
	}

	// At or after last keyframe
	if (prev && !next) {
		return keyframeToState(prev, defaultBrightness);
	}

	// Between two keyframes
	if (prev && next) {
		const transitionStart = next.timestampMs - (next.transitionMs ?? 0);

		// Before transition to next starts: hold prev state
		if (timeMs < transitionStart) {
			return keyframeToState(prev, defaultBrightness);
		}

		const t = getTransitionProgress(prev, next, timeMs);
		return blendKeyframes(prev, next, t, defaultBrightness);
	}

	// Fallback (shouldn't reach here)
	return {
		color: defaultColor,
		brightness: defaultBrightness,
		powerOn: true,
		colorTemperature: 6500,
		colorMode: 'RGB'
	};
}

/**
 * Binary search for the keyframe pair surrounding a timestamp.
 * Returns prev (at or before timeMs) and next (after timeMs).
 */
export function findSurroundingKeyframes(
	keyframes: Keyframe[],
	timeMs: number
): { prev: Keyframe | null; next: Keyframe | null } {
	if (keyframes.length === 0) {
		return { prev: null, next: null };
	}

	let lo = 0;
	let hi = keyframes.length - 1;

	// Before first keyframe
	if (timeMs < keyframes[0].timestampMs) {
		return { prev: null, next: keyframes[0] };
	}

	// At or after last keyframe
	if (timeMs >= keyframes[hi].timestampMs) {
		return { prev: keyframes[hi], next: null };
	}

	// Binary search for the last keyframe with timestampMs <= timeMs
	while (lo < hi) {
		const mid = lo + Math.ceil((hi - lo) / 2);
		if (keyframes[mid].timestampMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}

	return {
		prev: keyframes[lo],
		next: lo + 1 < keyframes.length ? keyframes[lo + 1] : null
	};
}

/**
 * Compute transition progress (0–1) considering transition_ms.
 * The transition ENDS at next.timestampMs and BEGINS at next.timestampMs - next.transitionMs.
 */
export function getTransitionProgress(
	prevKeyframe: Keyframe | null,
	nextKeyframe: Keyframe,
	timeMs: number
): number {
	const transitionMs = nextKeyframe.transitionMs ?? 0;
	const interpolation = nextKeyframe.interpolation ?? 'STEP';

	// Instant snap
	if (transitionMs === 0) {
		return timeMs >= nextKeyframe.timestampMs ? 1 : 0;
	}

	const transitionStart = nextKeyframe.timestampMs - transitionMs;
	const transitionEnd = nextKeyframe.timestampMs;

	if (timeMs <= transitionStart) return 0;
	if (timeMs >= transitionEnd) return 1;

	const rawT = (timeMs - transitionStart) / transitionMs;

	switch (interpolation) {
		case 'STEP':
			// STEP: instant snap at start of transition
			return rawT > 0 ? 1 : 0;
		case 'LINEAR':
			return rawT;
		case 'EASE_IN':
			return rawT * rawT;
		case 'EASE_OUT':
			return 1 - (1 - rawT) * (1 - rawT);
		case 'EASE_IN_OUT':
			return rawT < 0.5
				? 2 * rawT * rawT
				: 1 - 2 * (1 - rawT) * (1 - rawT);
		default:
			return rawT;
	}
}

function resolveKeyframeColor(kf: Keyframe): RGBColor {
	if (kf.colorMode === 'COLOR_TEMPERATURE' && kf.colorTemperature != null) {
		return kelvinToRgb(kf.colorTemperature);
	}
	return kf.color ?? { r: 255, g: 255, b: 255 };
}

function keyframeToState(kf: Keyframe, defaultBrightness: number): InterpolatedState {
	return {
		color: resolveKeyframeColor(kf),
		brightness: kf.brightness ?? defaultBrightness,
		powerOn: kf.powerOn ?? true,
		colorTemperature: kf.colorTemperature ?? 6500,
		colorMode: kf.colorMode ?? 'RGB'
	};
}

function blendKeyframes(
	prev: Keyframe,
	next: Keyframe,
	t: number,
	defaultBrightness: number
): InterpolatedState {
	const prevColor = resolveKeyframeColor(prev);
	const nextColor = resolveKeyframeColor(next);

	return {
		color: interpolateColor(prevColor, nextColor, t),
		brightness: lerp(
			prev.brightness ?? defaultBrightness,
			next.brightness ?? defaultBrightness,
			t
		),
		powerOn: t >= 1 ? (next.powerOn ?? true) : (prev.powerOn ?? true),
		colorTemperature: lerp(
			prev.colorTemperature ?? 6500,
			next.colorTemperature ?? 6500,
			t
		),
		colorMode: t >= 1 ? (next.colorMode ?? 'RGB') : (prev.colorMode ?? 'RGB')
	};
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}
