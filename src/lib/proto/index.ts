import protobuf from 'protobufjs';
import protoText from '../../../proto/lightfx.proto?raw';
import type {
	LightFXTrack,
	TrackMetadata,
	Channel,
	Keyframe,
	EffectKeyframe,
	SafetyInfo,
	RGBColor,
	ColorMode,
	InterpolationMode,
	BoundaryBehavior,
	PreshowState,
	CreditsBehavior,
	IntensityRating,
	EffectType,
	MovieReference
} from '$lib/types';

// ============================================================
// Parse proto schema
// ============================================================

const root = protobuf.parse(protoText).root;
const LightFXTrackMessage = root.lookupType('openlightfx.LightFXTrack');

// ============================================================
// Enum mappings (proto numeric <-> TypeScript string)
// ============================================================

const BOUNDARY_BEHAVIOR_TO_PROTO: Record<BoundaryBehavior, number> = {
	LEAVE: 1,
	OFF: 2,
	ON: 3
};
const BOUNDARY_BEHAVIOR_FROM_PROTO: Record<number, BoundaryBehavior> = {
	1: 'LEAVE',
	2: 'OFF',
	3: 'ON'
};

const PRESHOW_STATE_TO_PROTO: Record<PreshowState, number> = {
	PRESHOW_DIM: 1,
	PRESHOW_OFF: 2,
	PRESHOW_WARM: 3
};
const PRESHOW_STATE_FROM_PROTO: Record<number, PreshowState> = {
	1: 'PRESHOW_DIM',
	2: 'PRESHOW_OFF',
	3: 'PRESHOW_WARM'
};

const CREDITS_BEHAVIOR_TO_PROTO: Record<CreditsBehavior, number> = {
	CREDITS_CONTINUE: 1,
	CREDITS_DIM_UP: 2,
	CREDITS_RAISE: 3,
	CREDITS_OFF: 4
};
const CREDITS_BEHAVIOR_FROM_PROTO: Record<number, CreditsBehavior> = {
	1: 'CREDITS_CONTINUE',
	2: 'CREDITS_DIM_UP',
	3: 'CREDITS_RAISE',
	4: 'CREDITS_OFF'
};

const INTENSITY_RATING_TO_PROTO: Record<IntensityRating, number> = {
	SUBTLE: 1,
	MODERATE: 2,
	INTENSE: 3,
	EXTREME: 4
};
const INTENSITY_RATING_FROM_PROTO: Record<number, IntensityRating> = {
	1: 'SUBTLE',
	2: 'MODERATE',
	3: 'INTENSE',
	4: 'EXTREME'
};

const COLOR_MODE_TO_PROTO: Record<ColorMode, number> = {
	RGB: 1,
	COLOR_TEMPERATURE: 2
};
const COLOR_MODE_FROM_PROTO: Record<number, ColorMode> = {
	1: 'RGB',
	2: 'COLOR_TEMPERATURE'
};

const INTERPOLATION_TO_PROTO: Record<InterpolationMode, number> = {
	STEP: 1,
	LINEAR: 2
};
const INTERPOLATION_FROM_PROTO: Record<number, InterpolationMode> = {
	1: 'STEP',
	2: 'LINEAR'
};

const EFFECT_TYPE_TO_PROTO: Record<EffectType, number> = {
	LIGHTNING: 1,
	FLAME: 2,
	FLASHBANG: 3,
	EXPLOSION: 4,
	PULSE: 5,
	STROBE: 6,
	SIREN: 7,
	AURORA: 8,
	CANDLE: 9,
	GUNFIRE: 10,
	NEON: 11,
	BREATHING: 12,
	SPARK: 13
};
const EFFECT_TYPE_FROM_PROTO: Record<number, EffectType> = {
	1: 'LIGHTNING',
	2: 'FLAME',
	3: 'FLASHBANG',
	4: 'EXPLOSION',
	5: 'PULSE',
	6: 'STROBE',
	7: 'SIREN',
	8: 'AURORA',
	9: 'CANDLE',
	10: 'GUNFIRE',
	11: 'NEON',
	12: 'BREATHING',
	13: 'SPARK'
};

// ============================================================
// Conversion helpers: TypeScript → Proto
// ============================================================

function rgbToProto(c: RGBColor): object {
	return { r: c.r, g: c.g, b: c.b };
}

function movieRefToProto(ref: MovieReference): object {
	return {
		imdbId: ref.imdbId,
		title: ref.title,
		year: ref.year,
		runtimeMinutes: ref.runtimeMinutes
	};
}

function metadataToProto(m: TrackMetadata): object {
	return {
		title: m.title,
		description: m.description,
		movieReference: movieRefToProto(m.movieReference),
		author: m.author,
		tags: m.tags,
		durationMs: m.durationMs,
		startBehavior: BOUNDARY_BEHAVIOR_TO_PROTO[m.startBehavior] ?? 0,
		endBehavior: BOUNDARY_BEHAVIOR_TO_PROTO[m.endBehavior] ?? 0,
		preshowDurationMs: m.preshowDurationMs,
		preshowState: PRESHOW_STATE_TO_PROTO[m.preshowState] ?? 0,
		creditsStartMs: m.creditsStartMs,
		creditsBehavior: CREDITS_BEHAVIOR_TO_PROTO[m.creditsBehavior] ?? 0,
		trackVersion: m.trackVersion
	};
}

function channelToProto(ch: Channel): object {
	return {
		id: ch.id,
		displayName: ch.displayName,
		description: ch.description,
		defaultColor: rgbToProto(ch.defaultColor),
		defaultBrightness: ch.defaultBrightness,
		spatialHint: ch.spatialHint,
		optional: ch.optional
	};
}

function keyframeToProto(kf: Keyframe): object {
	return {
		id: kf.id,
		channelId: kf.channelId,
		timestampMs: kf.timestampMs,
		colorMode: COLOR_MODE_TO_PROTO[kf.colorMode] ?? 0,
		color: rgbToProto(kf.color),
		colorTemperature: kf.colorTemperature,
		brightness: kf.brightness,
		transitionMs: kf.transitionMs,
		interpolation: INTERPOLATION_TO_PROTO[kf.interpolation] ?? 0,
		powerOn: kf.powerOn
	};
}

function effectKeyframeToProto(ek: EffectKeyframe): object {
	return {
		id: ek.id,
		channelId: ek.channelId,
		timestampMs: ek.timestampMs,
		durationMs: ek.durationMs,
		effectType: EFFECT_TYPE_TO_PROTO[ek.effectType] ?? 0,
		intensity: ek.intensity,
		primaryColor: rgbToProto(ek.primaryColor),
		secondaryColor: rgbToProto(ek.secondaryColor),
		effectParams: Object.keys(ek.effectParams).length > 0 ? { params: ek.effectParams } : null,
		requiredCapability: ek.requiredCapability,
		fallbackColor: rgbToProto(ek.fallbackColor),
		fallbackBrightness: ek.fallbackBrightness
	};
}

function safetyInfoToProto(si: SafetyInfo): object {
	return {
		containsFlashing: si.containsFlashing,
		containsStrobing: si.containsStrobing,
		maxFlashFrequencyHz: si.maxFlashFrequencyHz,
		maxBrightnessDelta: si.maxBrightnessDelta,
		warningText: si.warningText,
		intensityRating: INTENSITY_RATING_TO_PROTO[si.intensityRating] ?? 0
	};
}

function trackToProto(track: LightFXTrack): object {
	return {
		version: track.version,
		metadata: metadataToProto(track.metadata),
		channels: track.channels.map(channelToProto),
		keyframes: track.keyframes.map(keyframeToProto),
		effectKeyframes: track.effectKeyframes.map(effectKeyframeToProto),
		safetyInfo: safetyInfoToProto(track.safetyInfo)
	};
}

// ============================================================
// Conversion helpers: Proto → TypeScript
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function rgbFromProto(obj: any): RGBColor {
	return {
		r: obj?.r ?? 0,
		g: obj?.g ?? 0,
		b: obj?.b ?? 0
	};
}

function movieRefFromProto(obj: any): MovieReference {
	return {
		imdbId: obj?.imdbId ?? '',
		title: obj?.title ?? '',
		year: obj?.year ?? 0,
		runtimeMinutes: obj?.runtimeMinutes ?? 0
	};
}

function metadataFromProto(obj: any): TrackMetadata {
	return {
		title: obj?.title ?? '',
		description: obj?.description ?? '',
		movieReference: movieRefFromProto(obj?.movieReference),
		author: obj?.author ?? '',
		tags: obj?.tags ?? [],
		durationMs: Number(obj?.durationMs ?? 0),
		startBehavior: BOUNDARY_BEHAVIOR_FROM_PROTO[obj?.startBehavior] ?? 'LEAVE',
		endBehavior: BOUNDARY_BEHAVIOR_FROM_PROTO[obj?.endBehavior] ?? 'LEAVE',
		preshowDurationMs: obj?.preshowDurationMs ?? 0,
		preshowState: PRESHOW_STATE_FROM_PROTO[obj?.preshowState] ?? 'PRESHOW_DIM',
		creditsStartMs: Number(obj?.creditsStartMs ?? 0),
		creditsBehavior: CREDITS_BEHAVIOR_FROM_PROTO[obj?.creditsBehavior] ?? 'CREDITS_CONTINUE',
		trackVersion: obj?.trackVersion ?? '1.0'
	};
}

function channelFromProto(obj: any): Channel {
	return {
		id: obj?.id ?? '',
		displayName: obj?.displayName ?? '',
		description: obj?.description ?? '',
		defaultColor: rgbFromProto(obj?.defaultColor),
		defaultBrightness: obj?.defaultBrightness ?? 0,
		spatialHint: obj?.spatialHint ?? 'SPATIAL_UNSPECIFIED',
		optional: obj?.optional ?? false
	};
}

function keyframeFromProto(obj: any): Keyframe {
	return {
		id: obj?.id ?? '',
		channelId: obj?.channelId ?? '',
		timestampMs: Number(obj?.timestampMs ?? 0),
		colorMode: COLOR_MODE_FROM_PROTO[obj?.colorMode] ?? 'RGB',
		color: rgbFromProto(obj?.color),
		colorTemperature: obj?.colorTemperature ?? 4000,
		brightness: obj?.brightness ?? 0,
		transitionMs: obj?.transitionMs ?? 0,
		interpolation: INTERPOLATION_FROM_PROTO[obj?.interpolation] ?? 'STEP',
		powerOn: obj?.powerOn ?? false
	};
}

function effectKeyframeFromProto(obj: any): EffectKeyframe {
	const params: Record<string, number> = {};
	if (obj?.effectParams?.params) {
		for (const [key, value] of Object.entries(obj.effectParams.params)) {
			params[key] = Number(value);
		}
	}
	return {
		id: obj?.id ?? '',
		channelId: obj?.channelId ?? '',
		timestampMs: Number(obj?.timestampMs ?? 0),
		durationMs: Number(obj?.durationMs ?? 0),
		effectType: EFFECT_TYPE_FROM_PROTO[obj?.effectType] ?? 'LIGHTNING',
		intensity: obj?.intensity ?? 50,
		primaryColor: rgbFromProto(obj?.primaryColor),
		secondaryColor: rgbFromProto(obj?.secondaryColor),
		effectParams: params,
		requiredCapability: obj?.requiredCapability ?? '',
		fallbackColor: rgbFromProto(obj?.fallbackColor),
		fallbackBrightness: obj?.fallbackBrightness ?? 0
	};
}

function safetyInfoFromProto(obj: any): SafetyInfo {
	return {
		containsFlashing: obj?.containsFlashing ?? false,
		containsStrobing: obj?.containsStrobing ?? false,
		maxFlashFrequencyHz: obj?.maxFlashFrequencyHz ?? 0,
		maxBrightnessDelta: obj?.maxBrightnessDelta ?? 0,
		warningText: obj?.warningText ?? '',
		intensityRating: INTENSITY_RATING_FROM_PROTO[obj?.intensityRating] ?? 'SUBTLE'
	};
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================
// Public API: encode / decode
// ============================================================

export function encodeTrack(track: LightFXTrack): Uint8Array {
	const protoObj = trackToProto(track);
	const errMsg = LightFXTrackMessage.verify(protoObj);
	if (errMsg) throw new Error(`Proto verification failed: ${errMsg}`);
	const message = LightFXTrackMessage.create(protoObj);
	return LightFXTrackMessage.encode(message).finish();
}

export function decodeTrack(data: Uint8Array): LightFXTrack {
	const message = LightFXTrackMessage.decode(data);
	const obj = LightFXTrackMessage.toObject(message, {
		longs: Number,
		enums: Number,
		defaults: true
	});
	return {
		version: obj.version ?? 1,
		metadata: metadataFromProto(obj.metadata),
		channels: (obj.channels ?? []).map(channelFromProto),
		keyframes: (obj.keyframes ?? []).map(keyframeFromProto),
		effectKeyframes: (obj.effectKeyframes ?? []).map(effectKeyframeFromProto),
		safetyInfo: safetyInfoFromProto(obj.safetyInfo)
	};
}

// ============================================================
// Validation (V-001 through V-021)
// ============================================================

export interface ValidationError {
	rule: string;
	message: string;
	path?: string;
}

const FLASHING_EFFECT_TYPES: Set<EffectType> = new Set([
	'LIGHTNING',
	'FLASHBANG',
	'GUNFIRE',
	'STROBE',
	'SPARK'
]);

export function validateTrack(track: LightFXTrack): ValidationError[] {
	const errors: ValidationError[] = [];

	// V-001: version must be supported (currently: 1)
	if (track.version !== 1) {
		errors.push({
			rule: 'V-001',
			message: `Unsupported track version: ${track.version}. Supported: 1`,
			path: 'version'
		});
	}

	// V-002: metadata must be present
	if (!track.metadata) {
		errors.push({
			rule: 'V-002',
			message: 'Track metadata is required',
			path: 'metadata'
		});
		return errors; // Can't validate further without metadata
	}

	// V-003: imdb_id must match tt\d{7,}
	const imdbId = track.metadata.movieReference?.imdbId;
	if (imdbId && !/^tt\d{7,}$/.test(imdbId)) {
		errors.push({
			rule: 'V-003',
			message: `Invalid IMDB ID format: "${imdbId}". Expected pattern: tt followed by 7+ digits`,
			path: 'metadata.movieReference.imdbId'
		});
	}

	// V-004: duration_ms must be > 0
	if (track.metadata.durationMs <= 0) {
		errors.push({
			rule: 'V-004',
			message: 'Track duration must be greater than 0',
			path: 'metadata.durationMs'
		});
	}

	// V-005: channel IDs must be unique
	const channelIds = new Set<string>();
	for (const ch of track.channels) {
		if (channelIds.has(ch.id)) {
			errors.push({
				rule: 'V-005',
				message: `Duplicate channel ID: "${ch.id}"`,
				path: `channels[${ch.id}]`
			});
		}
		channelIds.add(ch.id);
	}

	// V-006: keyframes must reference valid channels and be sorted per channel
	const keyframesByChannel = new Map<string, Keyframe[]>();
	for (const kf of track.keyframes) {
		if (!channelIds.has(kf.channelId)) {
			errors.push({
				rule: 'V-006',
				message: `Keyframe "${kf.id}" references unknown channel "${kf.channelId}"`,
				path: `keyframes[${kf.id}].channelId`
			});
		}
		if (!keyframesByChannel.has(kf.channelId)) {
			keyframesByChannel.set(kf.channelId, []);
		}
		keyframesByChannel.get(kf.channelId)!.push(kf);
	}
	for (const [chId, kfs] of keyframesByChannel) {
		for (let i = 1; i < kfs.length; i++) {
			if (kfs[i].timestampMs < kfs[i - 1].timestampMs) {
				errors.push({
					rule: 'V-006',
					message: `Keyframes on channel "${chId}" are not sorted by timestamp`,
					path: `keyframes[${kfs[i].id}].timestampMs`
				});
				break;
			}
		}
	}

	// V-007: brightness must be [0, 100]
	for (const kf of track.keyframes) {
		if (kf.brightness < 0 || kf.brightness > 100) {
			errors.push({
				rule: 'V-007',
				message: `Keyframe "${kf.id}" brightness ${kf.brightness} out of range [0, 100]`,
				path: `keyframes[${kf.id}].brightness`
			});
		}
	}

	// V-008: RGB values must be [0, 255]
	for (const kf of track.keyframes) {
		const { r, g, b } = kf.color;
		if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
			errors.push({
				rule: 'V-008',
				message: `Keyframe "${kf.id}" color (${r},${g},${b}) has values out of range [0, 255]`,
				path: `keyframes[${kf.id}].color`
			});
		}
	}

	// V-009: color_temperature must be [1000, 10000]
	for (const kf of track.keyframes) {
		if (kf.colorMode === 'COLOR_TEMPERATURE') {
			if (kf.colorTemperature < 1000 || kf.colorTemperature > 10000) {
				errors.push({
					rule: 'V-009',
					message: `Keyframe "${kf.id}" color temperature ${kf.colorTemperature}K out of range [1000, 10000]`,
					path: `keyframes[${kf.id}].colorTemperature`
				});
			}
		}
	}

	// V-010: timestamp_ms must be <= duration_ms
	for (const kf of track.keyframes) {
		if (kf.timestampMs > track.metadata.durationMs) {
			errors.push({
				rule: 'V-010',
				message: `Keyframe "${kf.id}" timestamp ${kf.timestampMs}ms exceeds track duration ${track.metadata.durationMs}ms`,
				path: `keyframes[${kf.id}].timestampMs`
			});
		}
	}

	// V-011: at least one channel must be present
	if (track.channels.length === 0) {
		errors.push({
			rule: 'V-011',
			message: 'Track must have at least one channel',
			path: 'channels'
		});
	}

	// V-012: transition_ms must not cause transition to begin before time 0
	for (const kf of track.keyframes) {
		if (kf.timestampMs - kf.transitionMs < 0) {
			errors.push({
				rule: 'V-012',
				message: `Keyframe "${kf.id}" transition of ${kf.transitionMs}ms would begin before time 0`,
				path: `keyframes[${kf.id}].transitionMs`
			});
		}
	}

	// V-013: effect keyframe duration_ms must be > 0
	for (const ek of track.effectKeyframes) {
		if (ek.durationMs <= 0) {
			errors.push({
				rule: 'V-013',
				message: `Effect keyframe "${ek.id}" duration must be > 0`,
				path: `effectKeyframes[${ek.id}].durationMs`
			});
		}
	}

	// V-014: effect keyframe intensity must be [0, 100]
	for (const ek of track.effectKeyframes) {
		if (ek.intensity < 0 || ek.intensity > 100) {
			errors.push({
				rule: 'V-014',
				message: `Effect keyframe "${ek.id}" intensity ${ek.intensity} out of range [0, 100]`,
				path: `effectKeyframes[${ek.id}].intensity`
			});
		}
	}

	// V-015: fallback should be present when required_capability is set
	for (const ek of track.effectKeyframes) {
		if (ek.requiredCapability && ek.requiredCapability !== 'CAPABILITY_ANY') {
			const fb = ek.fallbackColor;
			if (fb.r === 0 && fb.g === 0 && fb.b === 0 && ek.fallbackBrightness === 0) {
				errors.push({
					rule: 'V-015',
					message: `Effect keyframe "${ek.id}" has required_capability "${ek.requiredCapability}" but no fallback color/brightness`,
					path: `effectKeyframes[${ek.id}].fallbackColor`
				});
			}
		}
	}

	// V-016: if contains_flashing is true, max_flash_frequency_hz must be > 0
	if (track.safetyInfo.containsFlashing && track.safetyInfo.maxFlashFrequencyHz <= 0) {
		errors.push({
			rule: 'V-016',
			message: 'contains_flashing is true but max_flash_frequency_hz is not > 0',
			path: 'safetyInfo.maxFlashFrequencyHz'
		});
	}

	// V-017: flashing effects require contains_flashing = true
	const hasFlashingEffects = track.effectKeyframes.some((ek) =>
		FLASHING_EFFECT_TYPES.has(ek.effectType)
	);
	if (hasFlashingEffects && !track.safetyInfo.containsFlashing) {
		errors.push({
			rule: 'V-017',
			message:
				'Track contains flashing effects (LIGHTNING/FLASHBANG/GUNFIRE/STROBE/SPARK) but safety_info.contains_flashing is false',
			path: 'safetyInfo.containsFlashing'
		});
	}

	// V-017a: STROBE effects require contains_strobing = true
	const hasStrobeEffects = track.effectKeyframes.some((ek) => ek.effectType === 'STROBE');
	if (hasStrobeEffects && !track.safetyInfo.containsStrobing) {
		errors.push({
			rule: 'V-017a',
			message:
				'Track contains STROBE effects but safety_info.contains_strobing is false',
			path: 'safetyInfo.containsStrobing'
		});
	}

	// V-018: scene markers must be sorted by timestamp — not applicable to LightFXTrack
	// (scene markers are Studio-only, validated at the project level)

	// V-019: removed (channel groups are Studio-only)

	// V-020: start_behavior and end_behavior must use valid BoundaryBehavior values
	const validBoundary: Set<string> = new Set(['LEAVE', 'OFF', 'ON']);
	if (!validBoundary.has(track.metadata.startBehavior)) {
		errors.push({
			rule: 'V-020',
			message: `Invalid start_behavior: "${track.metadata.startBehavior}"`,
			path: 'metadata.startBehavior'
		});
	}
	if (!validBoundary.has(track.metadata.endBehavior)) {
		errors.push({
			rule: 'V-020',
			message: `Invalid end_behavior: "${track.metadata.endBehavior}"`,
			path: 'metadata.endBehavior'
		});
	}

	// V-021: effect params values must be finite numbers
	for (const ek of track.effectKeyframes) {
		for (const [key, value] of Object.entries(ek.effectParams)) {
			if (!Number.isFinite(value)) {
				errors.push({
					rule: 'V-021',
					message: `Effect keyframe "${ek.id}" param "${key}" is not a finite number: ${value}`,
					path: `effectKeyframes[${ek.id}].effectParams.${key}`
				});
			}
		}
	}

	// Also validate effect keyframes reference valid channels
	for (const ek of track.effectKeyframes) {
		if (!channelIds.has(ek.channelId)) {
			errors.push({
				rule: 'V-006',
				message: `Effect keyframe "${ek.id}" references unknown channel "${ek.channelId}"`,
				path: `effectKeyframes[${ek.id}].channelId`
			});
		}
	}

	return errors;
}
