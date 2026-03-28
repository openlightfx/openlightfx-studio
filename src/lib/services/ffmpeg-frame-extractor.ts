// ============================================================
// FFmpeg Frame Extractor — extract raw video frames via ffmpeg.wasm
// bypassing the browser's video decoder to get untouched pixel data.
//
// Uses WORKERFS to mount the File object directly, avoiding the 2GB
// memory limit of writeFile (which copies the entire file into WASM heap).
// ============================================================

import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';

const MOUNT_DIR = '/work';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let isMounted = false;

/**
 * Lazily initialize and return the singleton FFmpeg instance.
 * ffmpeg.wasm is excluded from Vite's optimizeDeps so its internal
 * worker loads correctly with the right MIME type.
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    ffmpegInstance = new FFmpeg();

    loadPromise = ffmpegInstance
      .load()
      .then(() => {})
      .catch((err) => {
        ffmpegInstance = null;
        loadPromise = null;
        throw err;
      });
  }

  await loadPromise;
  return ffmpegInstance!;
}

/**
 * Mount a File into ffmpeg's WORKERFS so it can be read on-demand
 * without copying the entire file into WASM memory.
 */
async function mountFile(ffmpeg: FFmpeg, file: File): Promise<string> {
  // Unmount previous if still mounted
  if (isMounted) {
    try {
      await ffmpeg.unmount(MOUNT_DIR);
    } catch {
      // ignore — may already be unmounted
    }
    isMounted = false;
  }

  // Create the mount directory — ignore error if it already exists
  try {
    await ffmpeg.createDir(MOUNT_DIR);
  } catch {
    // Directory already exists from a previous call, that's fine
  }

  await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, MOUNT_DIR);
  isMounted = true;

  return `${MOUNT_DIR}/${file.name}`;
}

/**
 * Unmount the WORKERFS mount point after extraction.
 */
async function unmountFile(ffmpeg: FFmpeg): Promise<void> {
  if (!isMounted) return;
  try {
    await ffmpeg.unmount(MOUNT_DIR);
  } catch {
    // ignore
  }
  isMounted = false;
}

/**
 * Extract a single video frame as tone-mapped 8-bit RGB (rgb24) using ffmpeg.wasm.
 *
 * For HDR10 content, ffmpeg applies the full conversion pipeline:
 *   zscale (PQ→linear, BT.2020 input) → gbrpf32le float intermediate →
 *   zscale (BT.2020→BT.709 primaries) → tonemap (Hable, no desat) →
 *   zscale (BT.709 transfer/matrix) → rgb24
 *
 * Uses WORKERFS to mount the File directly — the file is read on-demand by
 * ffmpeg rather than copied entirely into WASM memory, so files >2GB work.
 *
 * @param file       The original video File object
 * @param timestampSec  Seek position in seconds
 * @param width      Expected frame width (from video metadata)
 * @param height     Expected frame height (from video metadata)
 * @returns Raw pixel data as Uint8Array (rgb24: 3 bytes per pixel)
 */
export async function extractRawFrame(
  file: File,
  timestampSec: number,
  width: number,
  height: number
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();
  const outputName = 'frame.raw';

  // Mount the file via WORKERFS (no 2GB copy into WASM heap)
  const inputPath = await mountFile(ffmpeg, file);

  try {
    // Extract one frame with HDR→SDR tone mapping via zscale/tonemap filters,
    // then output as 8-bit RGB (rgb24).
    await ffmpeg.exec([
      '-ss',
      timestampSec.toFixed(3),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=rgb24',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      outputName,
    ]);

    // Read the raw output
    const rawData = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(outputName);

    const expectedBytes = width * height * 3; // 3 channels × 1 byte each
    const result =
      rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData as unknown as ArrayBuffer);

    if (result.length !== expectedBytes) {
      console.warn(
        `[ffmpeg-extractor] Frame size mismatch: got ${result.length} bytes, expected ${expectedBytes}`
      );
    }

    return result;
  } finally {
    await unmountFile(ffmpeg);
  }
}

/**
 * Probe a video file for HDR10 characteristics by inspecting ffmpeg's
 * input stream log output. Looks for BT.2020 color primaries and
 * SMPTE 2084 (PQ) transfer function in the stream info line.
 */
export async function probeHdr(file: File): Promise<boolean> {
  console.log('[probeHdr] starting probe for', file.name);
  const ffmpeg = await getFFmpeg();
  console.log('[probeHdr] ffmpeg loaded, mounting file');
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
  // HDR10 = BT.2020 primaries + SMPTE ST.2084 (PQ) transfer
  const hasBt2020 = /bt2020/i.test(logText);
  const hasPq = /smpte2084|arib-std-b67/i.test(logText);

  console.log('[probeHdr] log output:', logText);
  console.log(`[probeHdr] hasBt2020=${hasBt2020} hasPq=${hasPq} → isHdr=${hasBt2020 && hasPq}`);

  return hasBt2020 && hasPq;
}

/**
 * Check if ffmpeg.wasm is supported in the current browser.
 * Requires WebAssembly support.
 */
export function isFFmpegSupported(): boolean {
  return typeof WebAssembly !== 'undefined';
}
