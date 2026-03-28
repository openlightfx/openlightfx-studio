import type { VideoProbeResult } from '$lib/types/video.js';

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('$lib/workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        if (error) p.reject(new Error(error));
        else p.resolve(result);
      }
    };
  }
  return worker;
}

function send<T>(type: string, payload: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, ...payload });
  });
}

export async function probeVideo(file: File): Promise<VideoProbeResult> {
  return send<VideoProbeResult>('probe', { file });
}

export async function extractToneMappedFrame(file: File, timestampMs: number, isHdr: boolean): Promise<Blob> {
  const pngBytes = await send<Uint8Array>('extractFrame', { file, timestampMs, isHdr });
  // Ensure we have a plain ArrayBuffer-backed Uint8Array for Blob constructor
  const bytes = pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
}
