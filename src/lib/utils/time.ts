/** Format milliseconds as "H:MM:SS.mmm" */
export function formatTimestamp(ms: number): string {
	const totalMs = Math.max(0, Math.round(ms));
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const seconds = Math.floor((totalMs % 60_000) / 1_000);
	const millis = totalMs % 1_000;

	return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Format milliseconds as "M:SS" for compact display */
export function formatTimestampShort(ms: number): string {
	const totalMs = Math.max(0, Math.round(ms));
	const totalSeconds = Math.floor(totalMs / 1_000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Parse "H:MM:SS.mmm" to milliseconds. Also accepts "MM:SS.mmm" and "SS.mmm". */
export function parseTimestamp(str: string): number {
	const trimmed = str.trim();
	const parts = trimmed.split(':');

	let hours = 0;
	let minutes = 0;
	let secondsAndMs: string;

	if (parts.length === 3) {
		hours = parseInt(parts[0], 10);
		minutes = parseInt(parts[1], 10);
		secondsAndMs = parts[2];
	} else if (parts.length === 2) {
		minutes = parseInt(parts[0], 10);
		secondsAndMs = parts[1];
	} else if (parts.length === 1) {
		secondsAndMs = parts[0];
	} else {
		throw new Error(`Invalid timestamp format: ${str}`);
	}

	const secParts = secondsAndMs.split('.');
	const seconds = parseInt(secParts[0], 10);
	const millis = secParts.length > 1 ? parseInt(secParts[1].padEnd(3, '0').slice(0, 3), 10) : 0;

	if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(millis)) {
		throw new Error(`Invalid timestamp format: ${str}`);
	}

	return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + millis;
}

export function msToFrames(ms: number, fps: number): number {
	return (ms / 1_000) * fps;
}

export function framesToMs(frames: number, fps: number): number {
	return (frames / fps) * 1_000;
}

/** Round to nearest frame boundary */
export function snapToFrame(ms: number, fps: number): number {
	const frameDuration = 1_000 / fps;
	return Math.round(ms / frameDuration) * frameDuration;
}

/** Snap to the nearest multiple of an interval */
export function snapToInterval(ms: number, intervalMs: number): number {
	return Math.round(ms / intervalMs) * intervalMs;
}

interface RulerIntervals {
	majorMs: number;
	minorMs: number;
	labelFn: (ms: number) => string;
}

/**
 * Returns appropriate ruler tick intervals based on the current zoom level.
 * Higher pixelsPerMs = more zoomed in = finer intervals.
 */
export function getRulerIntervals(pixelsPerMs: number): RulerIntervals {
	// Desired minimum pixel spacing between major ticks
	const minMajorSpacing = 80;
	const targetMajorMs = minMajorSpacing / pixelsPerMs;

	// Candidate intervals from finest to coarsest
	const candidates = [
		// Frame-level (assuming ~24fps ≈ 42ms)
		{ majorMs: 40, minorMs: 10 },
		{ majorMs: 100, minorMs: 20 },
		{ majorMs: 200, minorMs: 50 },
		{ majorMs: 500, minorMs: 100 },
		// Seconds
		{ majorMs: 1_000, minorMs: 200 },
		{ majorMs: 2_000, minorMs: 500 },
		{ majorMs: 5_000, minorMs: 1_000 },
		{ majorMs: 10_000, minorMs: 2_000 },
		{ majorMs: 15_000, minorMs: 5_000 },
		{ majorMs: 30_000, minorMs: 5_000 },
		// Minutes
		{ majorMs: 60_000, minorMs: 10_000 },
		{ majorMs: 120_000, minorMs: 30_000 },
		{ majorMs: 300_000, minorMs: 60_000 },
		{ majorMs: 600_000, minorMs: 60_000 },
		{ majorMs: 900_000, minorMs: 300_000 },
		// Hours
		{ majorMs: 3_600_000, minorMs: 600_000 }
	];

	const chosen =
		candidates.find((c) => c.majorMs >= targetMajorMs) ?? candidates[candidates.length - 1];

	const labelFn = (ms: number): string => {
		if (chosen.majorMs < 1_000) {
			// Sub-second: show "S.mmm"
			const sec = Math.floor(ms / 1_000);
			const millis = ms % 1_000;
			return millis === 0 ? `${sec}s` : `${sec}.${String(millis).padStart(3, '0')}`;
		} else if (chosen.majorMs < 60_000) {
			// Seconds level: show "M:SS"
			return formatTimestampShort(ms);
		} else {
			// Minutes/hours level: show "H:MM:SS"
			const totalSeconds = Math.floor(ms / 1_000);
			const h = Math.floor(totalSeconds / 3_600);
			const m = Math.floor((totalSeconds % 3_600) / 60);
			const s = totalSeconds % 60;
			if (h > 0) {
				return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
			}
			return `${m}:${String(s).padStart(2, '0')}`;
		}
	};

	return { majorMs: chosen.majorMs, minorMs: chosen.minorMs, labelFn };
}
