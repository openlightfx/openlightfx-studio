import type { EffectKeyframe, Keyframe, Channel, RGBColor } from '$lib/types';
import { computeEffectState } from './preview';

/**
 * Number of sample points per second when flattening an effect to keyframes.
 * Higher values yield smoother results but more keyframes.
 */
const SAMPLES_PER_SECOND = 20;

let flattenCounter = 0;

function generateId(): string {
	return `flat-${Date.now().toString(36)}-${(flattenCounter++).toString(36)}`;
}

/**
 * Find the channel's prior visual state right before the effect starts.
 * Used for auto-restore after the effect ends (STU-059h1).
 */
function findPriorState(channel: Channel): { color: RGBColor; brightness: number } {
	return {
		color: { ...channel.defaultColor },
		brightness: channel.defaultBrightness,
	};
}

/**
 * Convert an EffectKeyframe into an equivalent series of static Keyframe[].
 *
 * Samples the effect at regular intervals using computeEffectState and
 * produces STEP-interpolated keyframes that reproduce the visual output.
 * An auto-restore keyframe is appended at effect end + 1ms to return the
 * channel to its prior state.
 *
 * @param effect   The effect keyframe to flatten.
 * @param channels All channels in the track (used for auto-restore state).
 * @returns        Array of static keyframes that approximate the effect.
 */
export function flattenEffect(effect: EffectKeyframe, channels: Channel[]): Keyframe[] {
	const keyframes: Keyframe[] = [];
	const durationMs = effect.durationMs;
	if (durationMs <= 0) return keyframes;

	const sampleInterval = 1000 / SAMPLES_PER_SECOND;
	const sampleCount = Math.max(2, Math.ceil(durationMs / sampleInterval) + 1);

	for (let i = 0; i < sampleCount; i++) {
		const elapsed = Math.min(i * sampleInterval, durationMs);
		const currentTimeMs = effect.timestampMs + elapsed;

		const state = computeEffectState(effect, currentTimeMs);
		if (!state) continue;

		keyframes.push({
			id: generateId(),
			channelId: effect.channelId,
			timestampMs: Math.round(currentTimeMs),
			colorMode: 'RGB',
			color: { ...state.color },
			colorTemperature: 4000,
			brightness: Math.round(state.brightness),
			transitionMs: 0,
			interpolation: 'STEP',
			powerOn: state.brightness > 0,
		});
	}

	// Auto-restore: insert a keyframe restoring the channel's prior state
	const channel = channels.find((ch) => ch.id === effect.channelId);
	const prior = channel ? findPriorState(channel) : { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

	keyframes.push({
		id: generateId(),
		channelId: effect.channelId,
		timestampMs: effect.timestampMs + durationMs + 1,
		colorMode: 'RGB',
		color: { ...prior.color },
		colorTemperature: 4000,
		brightness: prior.brightness,
		transitionMs: 0,
		interpolation: 'STEP',
		powerOn: prior.brightness > 0,
	});

	return keyframes;
}
