import { decodeTrack, validateTrack } from '$lib/proto/index';
import type { LightFXTrack } from '$lib/types';

// ============================================================
// Import errors
// ============================================================

export class ImportError extends Error {
	constructor(
		message: string,
		public readonly details?: string[]
	) {
		super(message);
		this.name = 'ImportError';
	}
}

// ============================================================
// Public API
// ============================================================

/**
 * Import a .lightfx protobuf binary and convert to editor state.
 * Generates unique IDs for keyframes/effects since proto doesn't guarantee them.
 */
export function importTrack(data: Uint8Array): LightFXTrack {
	if (!data || data.length === 0) {
		throw new ImportError('File is empty');
	}

	let track: LightFXTrack;
	try {
		track = decodeTrack(data);
	} catch (err) {
		throw new ImportError(
			'Failed to parse .lightfx file',
			[err instanceof Error ? err.message : String(err)]
		);
	}

	// Validate imported data
	const errors = validateTrack(track);
	if (errors.length > 0) {
		const errorMessages = errors.map((e) => `[${e.rule}] ${e.message}`);
		throw new ImportError(
			`Imported track has ${errors.length} validation error(s)`,
			errorMessages
		);
	}

	// Generate unique IDs for keyframes since proto IDs may be empty or duplicated
	track = assignEditorIds(track);

	return track;
}

// ============================================================
// ID generation
// ============================================================

function generateId(): string {
	return crypto.randomUUID();
}

/**
 * Ensure every keyframe and effect keyframe has a unique editor ID.
 * Proto files may have empty or duplicated IDs.
 */
function assignEditorIds(track: LightFXTrack): LightFXTrack {
	const seenIds = new Set<string>();

	const keyframes = track.keyframes.map((kf) => {
		if (!kf.id || seenIds.has(kf.id)) {
			return { ...kf, id: generateId() };
		}
		seenIds.add(kf.id);
		return kf;
	});

	const effectKeyframes = track.effectKeyframes.map((ek) => {
		if (!ek.id || seenIds.has(ek.id)) {
			return { ...ek, id: generateId() };
		}
		seenIds.add(ek.id);
		return ek;
	});

	const channels = track.channels.map((ch) => {
		if (!ch.id || seenIds.has(ch.id)) {
			return { ...ch, id: generateId() };
		}
		seenIds.add(ch.id);
		return ch;
	});

	return {
		...track,
		channels,
		keyframes,
		effectKeyframes
	};
}
