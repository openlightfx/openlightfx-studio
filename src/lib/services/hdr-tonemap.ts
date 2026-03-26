// ============================================================
// HDR Tone Mapping — convert raw HDR10 video frames to SDR sRGB
// for accurate color sampling in the eyedropper.
//
// ffmpeg.wasm handles the full conversion pipeline:
//   zscale (PQ→linear, BT.2020) → float intermediate →
//   zscale (BT.2020→BT.709 primaries) → tonemap (Hable) →
//   zscale (BT.709 transfer) → rgb24
// This module converts the resulting rgb24 data into ImageData.
// ============================================================

import { extractRawFrame, isFFmpegSupported, probeHdr } from './ffmpeg-frame-extractor.js';

export { probeHdr };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert rgb24 data (8-bit per channel) from ffmpeg into ImageData.
 *
 * ffmpeg has already applied HDR→SDR tone mapping via zscale/tonemap filters,
 * so this just packs RGB into RGBA.
 */
export function rawFrameToImageData(
  rawRgb24: Uint8Array,
  width: number,
  height: number
): ImageData {
  const pixelCount = width * height;
  const imageData = new ImageData(width, height);
  const out = imageData.data;

  for (let i = 0; i < pixelCount; i++) {
    const srcOff = i * 3;
    const dstOff = i * 4;

    out[dstOff] = rawRgb24[srcOff];
    out[dstOff + 1] = rawRgb24[srcOff + 1];
    out[dstOff + 2] = rawRgb24[srcOff + 2];
    out[dstOff + 3] = 255;
  }

  return imageData;
}

/**
 * Extract a video frame and produce an sRGB ImageData.
 *
 * For HDR content (isHdr=true), uses ffmpeg.wasm to decode the frame directly
 * from the file, bypassing the browser's video pipeline which incorrectly
 * tone-maps HDR10 content. ffmpeg applies zscale + hable tonemap to produce
 * correct SDR output.
 *
 * For SDR content (isHdr=false), uses the standard canvas drawImage approach
 * which works correctly for BT.709/sRGB content.
 */
export async function extractAndTonemapFrame(
  file: File,
  videoEl: HTMLVideoElement,
  timestampMs: number,
  isHdr: boolean
): Promise<ImageData> {
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;

  // For HDR content, use ffmpeg.wasm to extract and tone-map the frame
  if (isHdr && isFFmpegSupported()) {
    const timestampSec = timestampMs / 1000;
    try {
      const rawData = await extractRawFrame(file, timestampSec, width, height);
      const expectedBytes = width * height * 3;

      if (rawData.length === expectedBytes) {
        return rawFrameToImageData(rawData, width, height);
      }

      console.warn(
        `[HDR tonemap] Frame size mismatch (${rawData.length} vs ${expectedBytes}), falling back`
      );
    } catch (err) {
      console.warn('[HDR tonemap] ffmpeg extraction failed, falling back to canvas', err);
    }
  }

  // Standard canvas capture — correct for SDR, fallback for HDR on error
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(videoEl, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}
