// ============================================================
// FFmpeg Frame Extractor — extract raw video frames via ffmpeg.wasm
// bypassing the browser's video decoder to get untouched pixel data.
//
// Uses WORKERFS to mount the File object directly, avoiding the 2GB
// memory limit of writeFile (which copies the entire file into WASM heap).
//
// Ported from main branch's ffmpeg-frame-extractor.ts + hdr-tonemap.ts.
// ============================================================

import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import type { VideoProbeResult, VideoChapter } from '$lib/types/video.js';

// ---------------------------------------------------------------------------
// FFmpeg singleton — uses multithreaded core when SharedArrayBuffer is available
// ---------------------------------------------------------------------------

const MOUNT_DIR = '/work';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let isMounted = false;

async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  const blob = new Blob([buf], { type: mimeType });
  return URL.createObjectURL(blob);
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    ffmpegInstance = new FFmpeg();

    ffmpegInstance.on('log', ({ type, message }) => {
      const fn = type === 'fferr' ? console.warn : console.debug;
      fn('[ffmpeg]', message);
    });

    loadPromise = (async () => {
      try {
        // Multithreaded core served from static/ffmpeg/ (same-origin).
        // Blob URLs are required — Emscripten's pthread workers use import()
        // inside classic workers, which only works reliably with blob URLs.
        const base = '/ffmpeg';
        await ffmpegInstance!.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
          workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript'),
        });
        console.debug('[ffmpeg] Loaded multithreaded core');
      } catch (err) {
        ffmpegInstance = null;
        loadPromise = null;
        throw err;
      }
    })();
  }

  await loadPromise;
  return ffmpegInstance!;
}

// ---------------------------------------------------------------------------
// WORKERFS mount/unmount
// ---------------------------------------------------------------------------

async function mountFile(ffmpeg: FFmpeg, file: File): Promise<string> {
  if (isMounted) {
    try {
      await ffmpeg.unmount(MOUNT_DIR);
    } catch {
      // ignore — may already be unmounted
    }
    isMounted = false;
  }

  try {
    await ffmpeg.createDir(MOUNT_DIR);
  } catch {
    // Directory already exists from a previous call
  }

  await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, MOUNT_DIR);
  isMounted = true;

  return `${MOUNT_DIR}/${file.name}`;
}

async function unmountFile(ffmpeg: FFmpeg): Promise<void> {
  if (!isMounted) return;
  try {
    await ffmpeg.unmount(MOUNT_DIR);
  } catch {
    // ignore
  }
  isMounted = false;
}

// ---------------------------------------------------------------------------
// Raw frame extraction
// ---------------------------------------------------------------------------

// Max dimension for HDR frame extraction. Reduces WASM memory usage
// (the MT core has a fixed 1GB heap) and speeds up the zscale/tonemap pipeline.
// The eyedropper samples single pixels from the result — 1920px is plenty.
const MAX_EXTRACT_WIDTH = 1920;

/**
 * Extract a single video frame as tone-mapped 8-bit RGB (rgb24) using ffmpeg.wasm.
 *
 * Full HDR→SDR pipeline via zscale + tonemap (libzimg is compiled into @ffmpeg/core):
 *   scale (cap width to 1920, preserve aspect) →
 *   zscale (PQ→linear, BT.2020 input, npl=100) → gbrpf32le float intermediate →
 *   zscale (BT.2020→BT.709 primaries) → tonemap (Hable, no desat) →
 *   zscale (BT.709 transfer/matrix/TV range) → rgb24
 *
 * Uses -map 0:v:0 to skip subtitle/audio streams that can crash the WASM runtime.
 * Uses WORKERFS to mount the File directly — files >2GB work (no heap copy).
 *
 * Returns: { data, width, height } — output may be smaller than input if scaled.
 */
export async function extractRawFrame(
  file: File,
  timestampSec: number,
  width: number,
  height: number
): Promise<{ data: Uint8Array; width: number; height: number }> {
  console.debug(`[ffmpeg-extractor] extractRawFrame — file="${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) ts=${timestampSec.toFixed(3)}s input=${width}x${height}`);

  const ffmpeg = await getFFmpeg();
  const outputName = 'frame.raw';

  // Scale down if wider than MAX_EXTRACT_WIDTH to avoid OOM in 1GB WASM heap
  let outWidth = width;
  let outHeight = height;
  let scaleFilter = '';
  if (width > MAX_EXTRACT_WIDTH) {
    outWidth = MAX_EXTRACT_WIDTH;
    outHeight = Math.round((height * MAX_EXTRACT_WIDTH) / width);
    // Ensure even dimensions (required by many pixel formats)
    outHeight = outHeight % 2 === 0 ? outHeight : outHeight + 1;
    scaleFilter = `scale=${outWidth}:${outHeight},`;
    console.debug(`[ffmpeg-extractor] scaling ${width}x${height} → ${outWidth}x${outHeight}`);
  }

  const inputPath = await mountFile(ffmpeg, file);
  console.debug(`[ffmpeg-extractor] mounted at ${inputPath}`);

  const filterChain = `${scaleFilter}zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=rgb24`;
  const cmd = [
    // hdmv_pgs_subtitle (PGS/Blu-ray bitmap subtitle) tracks in MKV containers
    // carry "unspecified size" frame headers, which causes FFmpeg.wasm to abort
    // during input stream analysis. Setting AVDISCARD_ALL on subtitle streams
    // before -i prevents avformat_find_stream_info from ever reading PGS packets,
    // sidestepping the crash entirely without affecting the video extraction.
    // -fflags +discardcorrupt covers any other truncated or corrupt packets.
    '-fflags', '+discardcorrupt',
    '-discard:s', 'all',
    '-ss', timestampSec.toFixed(3),
    '-i', inputPath,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-vf', filterChain,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    outputName,
  ];
  console.debug(`[ffmpeg-extractor] exec: ffmpeg ${cmd.join(' ')}`);

  const t0 = performance.now();

  try {
    await ffmpeg.exec(cmd);
    console.debug(`[ffmpeg-extractor] exec completed in ${(performance.now() - t0).toFixed(0)}ms`);

    const rawData = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(outputName);

    const expectedBytes = outWidth * outHeight * 3;
    const result =
      rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData as unknown as ArrayBuffer);

    console.debug(
      `[ffmpeg-extractor] read ${result.length} bytes, expected ${expectedBytes} (${outWidth}x${outHeight}x3)`,
      result.length === expectedBytes ? '✓' : '✗ SIZE MISMATCH'
    );

    if (result.length !== expectedBytes) {
      console.warn(
        `[ffmpeg-extractor] Frame size mismatch: got ${result.length} bytes, expected ${expectedBytes}`
      );
    }

    return { data: result, width: outWidth, height: outHeight };
  } catch (execErr) {
    const elapsed = (performance.now() - t0).toFixed(0);
    const isAbort = String(execErr).includes('Aborted');
    console.error(
      `[ffmpeg-extractor] exec failed after ${elapsed}ms — ${isAbort ? 'WASM Aborted()' : 'non-zero exit'}:`,
      execErr
    );

    // ffmpeg exited non-zero or aborted — but it may have written the output frame
    // before dying (e.g. abort during cleanup after a successful encode). Try to
    // salvage the file before deciding whether to give up.
    console.debug('[ffmpeg-extractor] attempting to salvage output file despite exec error...');
    try {
      const rawData = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(outputName).catch(() => {});
      const expectedBytes = outWidth * outHeight * 3;
      const result =
        rawData instanceof Uint8Array
          ? rawData
          : new Uint8Array(rawData as unknown as ArrayBuffer);
      console.debug(
        `[ffmpeg-extractor] salvage: found ${result.length} bytes, need ${expectedBytes}`,
        result.length === expectedBytes ? '✓ salvageable' : '✗ wrong size, discarding'
      );
      if (result.length === expectedBytes) {
        console.warn('[ffmpeg-extractor] exec threw but output file is valid — using it');
        return { data: result, width: outWidth, height: outHeight };
      }
    } catch (salvageErr) {
      console.debug('[ffmpeg-extractor] salvage failed (no output file):', salvageErr);
    }

    if (isAbort) {
      console.error('[ffmpeg-extractor] WASM instance crashed, will reload on next call');
      ffmpegInstance = null;
      loadPromise = null;
      isMounted = false;
    }
    throw execErr;
  } finally {
    await unmountFile(ffmpeg);
    console.debug(`[ffmpeg-extractor] unmounted, total wall time ${(performance.now() - t0).toFixed(0)}ms`);
  }
}

// ---------------------------------------------------------------------------
// HDR probe
// ---------------------------------------------------------------------------

/**
 * Probe a video file for HDR10 characteristics by inspecting ffmpeg's
 * input stream log output. Looks for BT.2020 color primaries and
 * SMPTE 2084 (PQ) transfer function in the stream info line.
 */
export async function probeHdr(file: File): Promise<boolean> {
  const ffmpeg = await getFFmpeg();
  const inputPath = await mountFile(ffmpeg, file);

  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
  };
  ffmpeg.on('log', logHandler);

  try {
    // Run ffmpeg with input only and no output — ffmpeg prints stream info
    // then exits immediately with "At least one output file must be specified".
    // Far faster than decoding the video with -f null.
    await ffmpeg.exec(['-i', inputPath]);
  } catch {
    // Expected — ffmpeg exits non-zero with no output specified
  } finally {
    ffmpeg.off('log', logHandler);
    await unmountFile(ffmpeg);
  }

  const logText = logs.join('\n');
  const hasBt2020 = /bt2020/i.test(logText);
  const hasPq = /smpte2084|arib-std-b67/i.test(logText);

  return hasBt2020 && hasPq;
}

// ---------------------------------------------------------------------------
// Full metadata probe (ffprobe JSON)
// ---------------------------------------------------------------------------

/**
 * Probe a video file for full metadata: resolution, fps, codec, HDR info,
 * chapters. Uses ffprobe JSON output.
 */
export async function probeVideo(file: File): Promise<VideoProbeResult> {
  const ffmpeg = await getFFmpeg();
  const outputName = 'probe_output.json';
  const inputPath = await mountFile(ffmpeg, file);

  try {
    await ffmpeg.ffprobe([
      '-v',
      'warning',
      '-print_format',
      'json',
      '-show_streams',
      '-show_chapters',
      inputPath,
      '-o',
      outputName,
    ]);

    const raw = await ffmpeg.readFile(outputName, 'utf8');
    const jsonText = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);
    await ffmpeg.deleteFile(outputName);

    return parseProbeOutput(jsonText);
  } finally {
    await unmountFile(ffmpeg);
  }
}

function parseProbeOutput(jsonText: string): VideoProbeResult {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse ffprobe JSON output: ${jsonText.slice(0, 200)}`);
  }

  const streams: any[] = parsed.streams ?? [];
  const chapters: any[] = parsed.chapters ?? [];

  const videoStream = streams.find((s: any) => s.codec_type === 'video') ?? {};

  const width: number = videoStream.width ?? 0;
  const height: number = videoStream.height ?? 0;
  const codec: string = videoStream.codec_name ?? 'unknown';

  const fpsStr: string = videoStream.avg_frame_rate ?? videoStream.r_frame_rate ?? '0/1';
  const [fpNum, fpDen] = fpsStr.split('/').map(Number);
  const frameRate: number = fpDen && fpDen !== 0 ? fpNum / fpDen : fpNum || 0;

  const durationSec: number =
    parseFloat(videoStream.duration ?? parsed.format?.duration ?? '0') || 0;
  const durationMs: number = durationSec * 1000;

  const colorSpace: string | null = videoStream.color_space ?? null;
  const colorTransfer: string | null = videoStream.color_transfer ?? null;
  const colorPrimaries: string | null = videoStream.color_primaries ?? null;

  const isPq = colorTransfer?.includes('smpte2084') ?? false;
  const isHlg = colorTransfer?.includes('arib-std-b67') ?? false;
  const isBt2020 = colorPrimaries?.includes('bt2020') ?? false;
  const isHdr: boolean = (isPq || isHlg) && isBt2020;

  const videoChapters: VideoChapter[] = chapters.map((ch: any) => ({
    startMs: parseFloat(ch.start_time ?? '0') * 1000,
    endMs: parseFloat(ch.end_time ?? '0') * 1000,
    title: ch.tags?.title ?? ch.tags?.TITLE ?? `Chapter ${ch.id ?? ''}`,
  }));

  return {
    isHdr,
    colorSpace,
    colorTransfer,
    colorPrimaries,
    frameRate,
    durationMs,
    codec,
    width,
    height,
    chapters: videoChapters,
  };
}

// ---------------------------------------------------------------------------
// HDR tone mapping — high-level API
// ---------------------------------------------------------------------------

/**
 * Convert rgb24 data (8-bit per channel) from ffmpeg into ImageData.
 * ffmpeg has already applied HDR→SDR tone mapping, so this just packs RGB→RGBA.
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
 * HDR (isHdr=true): uses ffmpeg.wasm to decode the frame directly from the
 * file, bypassing the browser's video pipeline which incorrectly tone-maps
 * HDR10 content. ffmpeg applies zscale + hable tonemap for correct SDR output.
 *
 * SDR (isHdr=false): uses the standard canvas drawImage approach which works
 * correctly for BT.709/sRGB content.
 */
export async function extractAndTonemapFrame(
  file: File | null,
  videoEl: HTMLVideoElement,
  timestampMs: number,
  isHdr: boolean
): Promise<ImageData> {
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  console.debug(
    `[ffmpeg-extractor] extractAndTonemapFrame — ts=${timestampMs}ms isHdr=${isHdr} ffmpegSupported=${isFFmpegSupported()} hasFile=${!!file} video=${width}x${height}`
  );

  if (isHdr && file && isFFmpegSupported()) {
    const timestampSec = timestampMs / 1000;
    console.debug('[ffmpeg-extractor] HDR path: attempting ffmpeg tone-mapped extraction');
    try {
      const frame = await extractRawFrame(file, timestampSec, width, height);
      const expectedBytes = frame.width * frame.height * 3;

      if (frame.data.length === expectedBytes) {
        console.debug(
          `[ffmpeg-extractor] HDR extraction success — returning ${frame.width}x${frame.height} tone-mapped ImageData`
        );
        return rawFrameToImageData(frame.data, frame.width, frame.height);
      }

      console.warn(
        `[ffmpeg-extractor] Frame size mismatch (${frame.data.length} vs ${expectedBytes}), falling back to canvas`
      );
    } catch (err) {
      console.warn('[ffmpeg-extractor] HDR ffmpeg extraction failed, falling back to canvas:', err);
    }
  } else if (isHdr) {
    console.warn(
      `[ffmpeg-extractor] HDR content but cannot use ffmpeg path — file=${!!file} ffmpegSupported=${isFFmpegSupported()} — canvas fallback will NOT be tone-mapped`
    );
  }

  // Standard canvas capture — correct for SDR, fallback for HDR on error
  console.debug('[ffmpeg-extractor] canvas capture path');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(videoEl, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  console.debug(
    `[ffmpeg-extractor] canvas capture complete — ${imageData.width}x${imageData.height}${isHdr ? ' (WARNING: HDR content, colors may be incorrect)' : ''}`
  );
  return imageData;
}

/**
 * Check if ffmpeg.wasm is supported in the current browser.
 */
export function isFFmpegSupported(): boolean {
  return typeof WebAssembly !== 'undefined';
}
