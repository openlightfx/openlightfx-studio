// ============================================================
// HDR Tone Mapping — capture and correct HDR10 video frames
// for accurate color sampling in the eyedropper / color picker.
//
// Pipeline: inverse PQ (ST.2084) → BT.2020→BT.709 → Hable tonemap → sRGB gamma
// ============================================================

import type { RGBColor } from '$lib/types/index.js';

// ---------------------------------------------------------------------------
// PQ constants (SMPTE ST.2084)
// ---------------------------------------------------------------------------

const PQ_N = 2610 / (4096 * 4);
const PQ_M = 2523 / (4096 / 128);
const PQ_C1 = 3424 / 4096;
const PQ_C2 = 2413 / (4096 / 128);
const PQ_C3 = 2392 / (4096 / 128);

// ---------------------------------------------------------------------------
// Hable (Uncharted 2) filmic constants
// ---------------------------------------------------------------------------

const HABLE_A = 0.15;
const HABLE_B = 0.5;
const HABLE_C = 0.1;
const HABLE_D = 0.2;
const HABLE_E = 0.02;
const HABLE_F = 0.3;
const HABLE_W = 11.2;

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

/** Inverse PQ EOTF — converts a PQ-encoded [0,1] signal to scene-linear luminance. */
function pqToLinear(v: number): number {
  const p = Math.pow(v, 1 / PQ_M);
  return Math.pow(Math.max(p - PQ_C1, 0) / (PQ_C2 - PQ_C3 * p), 1 / PQ_N);
}

/** BT.2020 → BT.709 3×3 color matrix transform (scene-linear domain). */
function bt2020ToBt709(r: number, g: number, b: number): [number, number, number] {
  return [
    1.6605 * r - 0.5876 * g - 0.0728 * b,
    -0.1246 * r + 1.1329 * g - 0.0083 * b,
    -0.0182 * r - 0.1006 * g + 1.1187 * b,
  ];
}

/** Hable filmic tone-map operator for a single channel. */
function hableTonemapChannel(x: number): number {
  return (
    (x * (HABLE_A * x + HABLE_C * HABLE_B) + HABLE_D * HABLE_E) /
      (x * (HABLE_A * x + HABLE_B) + HABLE_D * HABLE_F) -
    HABLE_E / HABLE_F
  );
}

const HABLE_WHITE_SCALE = 1 / hableTonemapChannel(HABLE_W);

/** sRGB gamma encode (~2.2). */
function gammaEncode(v: number): number {
  return Math.pow(Math.max(v, 0), 1 / 2.2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tone-map a single pixel from HDR10 (PQ / BT.2020) to SDR sRGB.
 * Input: 8-bit channel values as read from a display-p3 canvas.
 * Returns clamped 0-255 sRGB values.
 */
export function tonemapPixel(r8: number, g8: number, b8: number): RGBColor {
  // Normalize 8-bit → [0,1]
  let r = r8 / 255;
  let g = g8 / 255;
  let b = b8 / 255;

  // 1. Inverse PQ → scene-linear
  r = pqToLinear(r);
  g = pqToLinear(g);
  b = pqToLinear(b);

  // 2. BT.2020 → BT.709 gamut
  [r, g, b] = bt2020ToBt709(r, g, b);

  // 3. Hable filmic tone map (exposure boost ×2)
  r = hableTonemapChannel(r * 2) * HABLE_WHITE_SCALE;
  g = hableTonemapChannel(g * 2) * HABLE_WHITE_SCALE;
  b = hableTonemapChannel(b * 2) * HABLE_WHITE_SCALE;

  // 4. sRGB gamma encode
  return {
    r: Math.round(gammaEncode(r) * 255),
    g: Math.round(gammaEncode(g) * 255),
    b: Math.round(gammaEncode(b) * 255),
  };
}

/**
 * Apply the HDR→SDR tone-map to every pixel of an ImageData **in-place**.
 * This is used to produce a visually-correct thumbnail / magnifier preview.
 */
export function tonemapImageData(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const mapped = tonemapPixel(data[i], data[i + 1], data[i + 2]);
    data[i] = mapped.r;
    data[i + 1] = mapped.g;
    data[i + 2] = mapped.b;
    // alpha channel (data[i+3]) is left unchanged
  }
}

/**
 * Lightweight heuristic to detect whether pixel data looks like PQ-encoded HDR.
 *
 * PQ-encoded content pushed through a display-p3 canvas tends to cluster in
 * the low-mid range with distinctive non-linear distribution — in particular,
 * mid-tones sit abnormally low compared to SDR.  We sample a grid of pixels
 * and check if the overall luminance pattern is consistent with PQ encoding.
 */
export function isHdrSignal(imageData: ImageData): boolean {
  const { data, width, height } = imageData;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 64)));
  let lowCount = 0;
  let totalSamples = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      // PQ-encoded content read as 8-bit tends to have most pixels < 100
      if (lum < 100) lowCount++;
      totalSamples++;
    }
  }

  if (totalSamples === 0) return false;

  // If ≥75% of sampled pixels have luminance < 100, likely PQ-encoded
  return lowCount / totalSamples >= 0.75;
}

/**
 * Capture a video frame using the ImageCapture API with a wide-gamut
 * (display-p3) canvas, returning the raw ImageData.
 *
 * Falls back to the classic drawImage path if ImageCapture is not available
 * (e.g. Firefox). The returned object also indicates whether the capture
 * used the wide-gamut path so callers can decide whether to tonemap.
 */
export async function captureVideoFrame(
  videoEl: HTMLVideoElement
): Promise<{ imageData: ImageData; wideGamut: boolean }> {
  // Try the wide-gamut ImageCapture path
  if (typeof ImageCapture !== 'undefined' && typeof videoEl.captureStream === 'function') {
    try {
      const stream = videoEl.captureStream();
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capture = new ImageCapture(track);
        const bitmap = await capture.grabFrame();

        const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = offscreen.getContext('2d', {
          colorSpace: 'display-p3',
        }) as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height, {
          colorSpace: 'display-p3',
        });

        // Stop the track we created so it doesn't linger
        track.stop();

        return { imageData, wideGamut: true };
      }
    } catch {
      // Fall through to legacy path
    }
  }

  // Legacy fallback: standard sRGB canvas
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(videoEl, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { imageData, wideGamut: false };
}
