/**
 * Scene change detection via frame-to-frame color histogram comparison.
 * Uses chi-squared distance on color histograms sampled at 500ms intervals.
 */

export type SceneMarkerType = 'MARKER_USER' | 'MARKER_CHAPTER' | 'MARKER_AUTO_DETECTED';

export interface SceneMarker {
	id: string;
	timestampMs: number;
	label: string;
	type: SceneMarkerType;
}

type Sensitivity = 'low' | 'medium' | 'high';

const SENSITIVITY_THRESHOLDS: Record<Sensitivity, number> = {
	low: 0.8,
	medium: 0.4,
	high: 0.2
};

const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const SAMPLE_INTERVAL_MS = 500;
const HISTOGRAM_BINS = 16;
const CHANNELS = 3; // R, G, B

/**
 * Detect scene changes in a video by comparing color histograms of successive frames.
 * Non-blocking: yields to the browser via requestAnimationFrame + setTimeout.
 */
export async function detectScenes(
	video: HTMLVideoElement,
	sensitivity: Sensitivity,
	onProgress: (pct: number) => void
): Promise<SceneMarker[]> {
	const threshold = SENSITIVITY_THRESHOLDS[sensitivity];
	const durationMs = (video.duration || 0) * 1000;
	if (durationMs <= 0) return [];

	const canvas = new OffscreenCanvas(SAMPLE_WIDTH, SAMPLE_HEIGHT);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not create offscreen canvas context');

	const totalSamples = Math.floor(durationMs / SAMPLE_INTERVAL_MS);
	if (totalSamples <= 1) return [];

	const markers: SceneMarker[] = [];
	let prevHistogram: Float64Array | null = null;
	let sceneCount = 0;

	// Save original video state
	const originalTime = video.currentTime;
	const wasPaused = video.paused;
	if (!wasPaused) video.pause();

	for (let i = 0; i <= totalSamples; i++) {
		const timeMs = i * SAMPLE_INTERVAL_MS;
		const timeSec = timeMs / 1000;

		// Seek and wait for frame
		await seekAndCapture(video, timeSec);

		// Capture frame
		ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
		const imageData = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
		const histogram = computeHistogram(imageData.data);

		if (prevHistogram) {
			const distance = chiSquaredDistance(prevHistogram, histogram);
			if (distance > threshold) {
				sceneCount++;
				markers.push({
					id: `scene-auto-${sceneCount}-${timeMs}`,
					timestampMs: timeMs,
					label: `Scene ${sceneCount}`,
					type: 'MARKER_AUTO_DETECTED'
				});
			}
		}

		prevHistogram = histogram;

		// Report progress
		onProgress(Math.round(((i + 1) / (totalSamples + 1)) * 100));

		// Yield to browser
		await yieldToMain();
	}

	// Restore video state
	video.currentTime = originalTime;
	if (!wasPaused) video.play();

	return markers;
}

/**
 * Compute a color histogram with HISTOGRAM_BINS per channel (R, G, B).
 * Returns a Float64Array of length CHANNELS * HISTOGRAM_BINS, normalized to sum to 1 per channel.
 */
function computeHistogram(pixels: Uint8ClampedArray): Float64Array {
	const totalBins = CHANNELS * HISTOGRAM_BINS;
	const hist = new Float64Array(totalBins);
	const pixelCount = pixels.length / 4;
	const binScale = HISTOGRAM_BINS / 256;

	for (let i = 0; i < pixels.length; i += 4) {
		const rBin = Math.min(Math.floor(pixels[i] * binScale), HISTOGRAM_BINS - 1);
		const gBin = Math.min(Math.floor(pixels[i + 1] * binScale), HISTOGRAM_BINS - 1);
		const bBin = Math.min(Math.floor(pixels[i + 2] * binScale), HISTOGRAM_BINS - 1);

		hist[rBin]++;
		hist[HISTOGRAM_BINS + gBin]++;
		hist[2 * HISTOGRAM_BINS + bBin]++;
	}

	// Normalize each channel
	for (let c = 0; c < CHANNELS; c++) {
		const offset = c * HISTOGRAM_BINS;
		for (let b = 0; b < HISTOGRAM_BINS; b++) {
			hist[offset + b] /= pixelCount;
		}
	}

	return hist;
}

/**
 * Chi-squared distance between two histograms.
 * Returns a value >= 0; higher means more different.
 */
function chiSquaredDistance(h1: Float64Array, h2: Float64Array): number {
	let sum = 0;
	for (let i = 0; i < h1.length; i++) {
		const a = h1[i];
		const b = h2[i];
		const denom = a + b;
		if (denom > 0) {
			sum += ((a - b) * (a - b)) / denom;
		}
	}
	// Average across channels
	return sum / CHANNELS;
}

/**
 * Seek the video to a specific time and wait for the frame to be available.
 */
function seekAndCapture(video: HTMLVideoElement, timeSec: number): Promise<void> {
	return new Promise((resolve) => {
		if (Math.abs(video.currentTime - timeSec) < 0.01) {
			resolve();
			return;
		}

		const onSeeked = () => {
			video.removeEventListener('seeked', onSeeked);
			resolve();
		};

		video.addEventListener('seeked', onSeeked);
		video.currentTime = timeSec;

		// Timeout fallback
		setTimeout(() => {
			video.removeEventListener('seeked', onSeeked);
			resolve();
		}, 2000);
	});
}

/**
 * Yield control back to the main thread for non-blocking processing.
 */
function yieldToMain(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			setTimeout(resolve, 0);
		});
	});
}
