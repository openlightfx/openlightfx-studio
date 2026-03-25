// ============================================================
// Scene Detection Web Worker
// Receives ImageData frames from the main thread, computes
// color histograms, and detects scene changes via chi-squared
// distance between consecutive histograms.
// ============================================================

// --- Message types: Main thread → Worker ---

export interface StartMessage {
  type: 'start';
  sensitivity: 'low' | 'medium' | 'high';
  totalDurationMs: number;
}

export interface FrameMessage {
  type: 'frame';
  imageData: ImageData;
  timestampMs: number;
}

export interface CancelMessage {
  type: 'cancel';
}

export interface DoneMessage {
  type: 'done';
}

export type InboundMessage = StartMessage | FrameMessage | CancelMessage | DoneMessage;

// --- Message types: Worker → Main thread ---

export interface ProgressMessage {
  type: 'progress';
  percent: number;
  markersFound: number;
}

export interface ResultMessage {
  type: 'result';
  markers: Array<{ timestampMs: number; confidence: number }>;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type OutboundMessage = ProgressMessage | ResultMessage | ErrorMessage;

// --- Constants ---

const BINS_PER_CHANNEL = 8;
const TOTAL_BINS = BINS_PER_CHANNEL * 3; // 24 bins (R + G + B)
const EPSILON = 1e-10;

const SENSITIVITY_THRESHOLDS: Record<string, number> = {
  low: 1.5,
  medium: 0.8,
  high: 0.4,
};

// Minimum time between detected markers to suppress rapid-fire false positives
const MIN_GAP_MS: Record<string, number> = {
  low: 2000,
  medium: 1000,
  high: 500,
};

// --- State ---

let cancelled = false;
let threshold = SENSITIVITY_THRESHOLDS.medium;
let minGapMs = MIN_GAP_MS.medium;
let totalDurationMs = 0;
let previousHistogram: Float64Array | null = null;
let lastMarkerTimestampMs = -Infinity;
let detectedMarkers: Array<{ timestampMs: number; confidence: number }> = [];

// --- Histogram computation ---

function computeHistogram(imageData: ImageData): Float64Array {
  const histogram = new Float64Array(TOTAL_BINS);
  const data = imageData.data;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const rBin = Math.min(Math.floor(data[i] / 32), BINS_PER_CHANNEL - 1);
    const gBin = Math.min(Math.floor(data[i + 1] / 32), BINS_PER_CHANNEL - 1);
    const bBin = Math.min(Math.floor(data[i + 2] / 32), BINS_PER_CHANNEL - 1);

    histogram[rBin] += 1;
    histogram[BINS_PER_CHANNEL + gBin] += 1;
    histogram[2 * BINS_PER_CHANNEL + bBin] += 1;
  }

  // Normalize to proportions
  for (let i = 0; i < TOTAL_BINS; i++) {
    histogram[i] /= pixelCount;
  }

  return histogram;
}

function chiSquaredDistance(observed: Float64Array, expected: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < TOTAL_BINS; i++) {
    const diff = observed[i] - expected[i];
    sum += (diff * diff) / (expected[i] + EPSILON);
  }
  return sum;
}

// --- Message handler ---

function handleStart(msg: StartMessage): void {
  cancelled = false;
  threshold = SENSITIVITY_THRESHOLDS[msg.sensitivity] ?? SENSITIVITY_THRESHOLDS.medium;
  minGapMs = MIN_GAP_MS[msg.sensitivity] ?? MIN_GAP_MS.medium;
  totalDurationMs = msg.totalDurationMs;
  previousHistogram = null;
  lastMarkerTimestampMs = -Infinity;
  detectedMarkers = [];
}

function handleFrame(msg: FrameMessage): void {
  if (cancelled) return;

  const histogram = computeHistogram(msg.imageData);

  if (previousHistogram !== null) {
    const distance = chiSquaredDistance(histogram, previousHistogram);
    if (distance >= threshold && msg.timestampMs - lastMarkerTimestampMs >= minGapMs) {
      detectedMarkers.push({
        timestampMs: msg.timestampMs,
        confidence: Math.min(distance / threshold, 1),
      });
      lastMarkerTimestampMs = msg.timestampMs;
    }
  }

  previousHistogram = histogram;

  const percent = totalDurationMs > 0
    ? Math.min(100, Math.round((msg.timestampMs / totalDurationMs) * 100))
    : 0;

  const progress: ProgressMessage = {
    type: 'progress',
    percent,
    markersFound: detectedMarkers.length,
  };
  self.postMessage(progress);
}

function handleDone(): void {
  if (cancelled) return;

  const result: ResultMessage = {
    type: 'result',
    markers: detectedMarkers,
  };
  self.postMessage(result);
}

function handleCancel(): void {
  cancelled = true;
  previousHistogram = null;
  detectedMarkers = [];
}

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  try {
    const msg = event.data;
    switch (msg.type) {
      case 'start':
        handleStart(msg);
        break;
      case 'frame':
        handleFrame(msg);
        break;
      case 'done':
        handleDone();
        break;
      case 'cancel':
        handleCancel();
        break;
    }
  } catch (err) {
    const error: ErrorMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(error);
  }
};
