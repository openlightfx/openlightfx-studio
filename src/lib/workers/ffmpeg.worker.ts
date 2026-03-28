/**
 * ffmpeg.wasm Web Worker
 *
 * Handles two message types:
 *   - probe: extract video stream metadata (HDR detection, resolution, fps, chapters)
 *   - extractFrame: seek to a timestamp and return a PNG frame (with optional HDR tone-mapping)
 *
 * Message protocol:
 *   Incoming: { id: number, type: 'probe' | 'extractFrame', file?: File, timestampMs?: number, isHdr?: boolean }
 *   Outgoing: { id: number, result?: any, error?: string }
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { VideoProbeResult, VideoChapter } from '$lib/types/video.js';

// ---------------------------------------------------------------------------
// FFmpeg singleton – lazily loaded on first use
// ---------------------------------------------------------------------------

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();
  await ffmpeg.load();
  return ffmpeg;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a File (or a slice of it) into the ffmpeg virtual filesystem.
 *
 * For files larger than SIZE_THRESHOLD we only write the bytes we need.
 * ffmpeg can still parse headers correctly when we pre-seek with `-ss` before
 * the `-i` flag, but for probe we need the full beginning of the file; for
 * frame extraction we can limit the window around the target timestamp.
 */
const SIZE_THRESHOLD = 500 * 1024 * 1024; // 500 MB

async function writeVideoFile(
  ff: FFmpeg,
  file: File,
  vfsName: string,
  timestampMs?: number
): Promise<void> {
  let blob: Blob;

  if (file.size <= SIZE_THRESHOLD || timestampMs === undefined) {
    // Small file or probe: write everything (probe needs headers)
    blob = file;
  } else {
    // Large file + known timestamp: write a window of data around the target.
    // We include 10 MB before the seek point and 50 MB after so ffmpeg can
    // decode a complete GOP.
    const bytesPerMs = file.size / (file.size > 0 ? file.size : 1); // placeholder
    // Estimate byte offset proportionally from duration – we don't know the
    // real duration here so we use a generous fixed window instead.
    const windowBefore = 10 * 1024 * 1024; // 10 MB
    const windowAfter = 50 * 1024 * 1024; // 50 MB
    const estimatedOffset = Math.max(0, (timestampMs / (24 * 3600 * 1000)) * file.size); // very rough
    const start = Math.max(0, estimatedOffset - windowBefore);
    const end = Math.min(file.size, estimatedOffset + windowAfter);
    blob = file.slice(start, end);
  }

  const buffer = await blob.arrayBuffer();
  await ff.writeFile(vfsName, new Uint8Array(buffer));
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

/**
 * Parse the text output of `ffprobe -print_format json -show_streams -show_chapters`
 * into a VideoProbeResult.
 */
function parseProbeOutput(jsonText: string): VideoProbeResult {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse ffprobe JSON output: ${jsonText.slice(0, 200)}`);
  }

  const streams: any[] = parsed.streams ?? [];
  const chapters: any[] = parsed.chapters ?? [];

  // Find the first video stream
  const videoStream = streams.find((s: any) => s.codec_type === 'video') ?? {};

  // Resolution
  const width: number = videoStream.width ?? 0;
  const height: number = videoStream.height ?? 0;

  // Codec
  const codec: string = videoStream.codec_name ?? 'unknown';

  // Frame rate – prefer avg_frame_rate, fall back to r_frame_rate
  const fpsStr: string = videoStream.avg_frame_rate ?? videoStream.r_frame_rate ?? '0/1';
  const [fpNum, fpDen] = fpsStr.split('/').map(Number);
  const frameRate: number = fpDen && fpDen !== 0 ? fpNum / fpDen : fpNum || 0;

  // Duration – prefer video stream, fall back to format
  const durationSec: number =
    parseFloat(videoStream.duration ?? parsed.format?.duration ?? '0') || 0;
  const durationMs: number = durationSec * 1000;

  // Color metadata
  const colorSpace: string | null = videoStream.color_space ?? null;
  const colorTransfer: string | null = videoStream.color_transfer ?? null;
  const colorPrimaries: string | null = videoStream.color_primaries ?? null;

  // HDR detection: PQ (smpte2084) or HLG (arib-std-b67) transfer + BT.2020 primaries
  const isPq = colorTransfer?.includes('smpte2084') ?? false;
  const isHlg = colorTransfer?.includes('arib-std-b67') ?? false;
  const isBt2020 = colorPrimaries?.includes('bt2020') ?? false;
  const isHdr: boolean = (isPq || isHlg) && isBt2020;

  // Chapters
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

async function probe(file: File): Promise<VideoProbeResult> {
  const ff = await getFFmpeg();
  const inputName = 'probe_input.mp4';
  const outputName = 'probe_output.json';

  try {
    await writeVideoFile(ff, file, inputName);

    await ff.ffprobe([
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_chapters',
      inputName,
      '-o', outputName,
    ]);

    const raw = await ff.readFile(outputName, 'utf8');
    const jsonText = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);

    return parseProbeOutput(jsonText);
  } finally {
    // Clean up VFS files to free memory
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Frame extraction
// ---------------------------------------------------------------------------

/**
 * HDR tone-mapping filter chain: linear light → BT.709 → Hable tone-map
 */
const HDR_FILTER =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709:t=bt709:m=bt709,tonemap=hable:desat=0,zscale=t=bt709,format=yuv420p';

async function extractFrame(
  file: File,
  timestampMs: number,
  isHdr: boolean
): Promise<Uint8Array> {
  const ff = await getFFmpeg();
  const inputName = 'frame_input.mp4';
  const outputName = 'frame_output.png';

  try {
    await writeVideoFile(ff, file, inputName, timestampMs);

    const seekSec = (timestampMs / 1000).toFixed(6);

    const args: string[] = [
      '-ss', seekSec,
      '-i', inputName,
      '-frames:v', '1',
    ];

    if (isHdr) {
      args.push('-vf', HDR_FILTER);
    }

    args.push('-y', outputName);

    await ff.exec(args);

    const data = await ff.readFile(outputName);
    return data instanceof Uint8Array ? data : new Uint8Array((data as unknown) as ArrayBuffer);
  } finally {
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = async (
  e: MessageEvent<{
    id: number;
    type: 'probe' | 'extractFrame';
    file?: File;
    timestampMs?: number;
    isHdr?: boolean;
  }>
) => {
  const { id, type, file, timestampMs, isHdr } = e.data;

  try {
    if (type === 'probe') {
      if (!file) throw new Error('probe: missing file');
      const result = await probe(file);
      self.postMessage({ id, result });
    } else if (type === 'extractFrame') {
      if (!file) throw new Error('extractFrame: missing file');
      if (timestampMs === undefined) throw new Error('extractFrame: missing timestampMs');
      const result = await extractFrame(file, timestampMs, isHdr ?? false);
      // Transfer the underlying buffer to avoid copying.
      // Narrow ArrayBufferLike → ArrayBuffer for the Transferable list.
      const buf: ArrayBuffer =
        result.buffer instanceof ArrayBuffer
          ? result.buffer
          : (result.buffer.slice(0) as unknown as ArrayBuffer);
      self.postMessage({ id, result }, { transfer: [buf] });
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ id, error: message });
  }
};
