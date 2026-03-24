import type { EffectType } from '$lib/types';

export interface SpreadEntry {
	channelId: string;
	delayMs: number;
}

/**
 * Default timing offset between successive channels in a spread pattern (ms).
 * Configurable 0–2000 in 10ms steps.
 */
export const DEFAULT_SPREAD_OFFSET_MS = 150;

/**
 * Spatial propagation ordering per effect type.
 * Each entry lists spatial hints in the order the effect should fire.
 * Channels not matching any hint fire last at the maximum accumulated delay.
 */
const SPATIAL_ORDERS: Record<EffectType, readonly string[]> = {
	LIGHTNING: [
		'SPATIAL_LEFT',
		'SPATIAL_CENTER',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	FLASHBANG: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	EXPLOSION: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	GUNFIRE: [
		'SPATIAL_LEFT',
		'SPATIAL_CENTER',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	FLAME: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_AMBIENT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
	],
	CANDLE: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_AMBIENT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
	],
	PULSE: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	BREATHING: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	STROBE: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	SIREN: [
		'SPATIAL_LEFT',
		'SPATIAL_CENTER',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
	AURORA: [
		'SPATIAL_LEFT',
		'SPATIAL_CENTER',
		'SPATIAL_RIGHT',
		'SPATIAL_AMBIENT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
	],
	NEON: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_AMBIENT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
	],
	SPARK: [
		'SPATIAL_CENTER',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT',
	],
};

/**
 * Hardcoded channel-id → spatial-hint mapping for the 6 predefined channel
 * templates (Mono through 8-Channel). Custom channels fall back to
 * positional ordering.
 */
const KNOWN_CHANNEL_HINTS: Record<string, string> = {
	main: 'SPATIAL_CENTER',
	left: 'SPATIAL_LEFT',
	right: 'SPATIAL_RIGHT',
	center: 'SPATIAL_CENTER',
	'surround-left': 'SPATIAL_SURROUND_LEFT',
	'surround-right': 'SPATIAL_SURROUND_RIGHT',
	'back-left': 'SPATIAL_SURROUND_LEFT',
	'back-right': 'SPATIAL_SURROUND_RIGHT',
	ambient: 'SPATIAL_AMBIENT',
};

/**
 * Clamp an offset value to the 0–2000 range and snap to 10ms steps.
 */
export function clampOffset(offsetMs: number): number {
	return Math.round(Math.max(0, Math.min(2000, offsetMs)) / 10) * 10;
}

/**
 * Compute a spread pattern for the given effect type and channel ids.
 *
 * @param effectType  The effect being spread.
 * @param channelIds  Channel ids from the current layout.
 * @param offsetMs    Per-stage timing offset (default 150ms, 0–2000 in 10ms steps).
 * @returns           Array of { channelId, delayMs } sorted by ascending delay.
 */
export function getSpreadPattern(
	effectType: EffectType,
	channelIds: string[],
	offsetMs: number = DEFAULT_SPREAD_OFFSET_MS,
): SpreadEntry[] {
	const step = clampOffset(offsetMs);
	const order = SPATIAL_ORDERS[effectType];

	// Build a map from spatial hint → stage index
	const stageIndex = new Map<string, number>();
	order.forEach((hint, idx) => {
		if (!stageIndex.has(hint)) stageIndex.set(hint, idx);
	});

	const entries: SpreadEntry[] = channelIds.map((id) => {
		const hint = KNOWN_CHANNEL_HINTS[id];
		const idx = hint !== undefined ? (stageIndex.get(hint) ?? order.length) : order.length;
		return { channelId: id, delayMs: idx * step };
	});

	entries.sort((a, b) => a.delayMs - b.delayMs);
	return entries;
}
