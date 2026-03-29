import type { SceneMarker } from '$lib/types/timeline.js';
import { generateId } from './id.js';

export type SceneDetectionSensitivity = 'low' | 'medium' | 'high';

export interface SceneDetectionProgress {
  currentMs: number;
  totalMs: number;
  markersFound: number;
}

export interface SceneDetectionResult {
  markers: SceneMarker[];
}

export async function detectScenes(
  videoElement: HTMLVideoElement,
  durationMs: number,
  sensitivity: SceneDetectionSensitivity,
  onProgress: (p: SceneDetectionProgress) => void,
  signal?: AbortSignal,
): Promise<SceneDetectionResult> {
  const worker = new Worker(
    new URL('$lib/workers/scene-detection.worker.ts', import.meta.url),
    { type: 'module' },
  );

  const canvas = new OffscreenCanvas(160, 90);
  const ctx = canvas.getContext('2d')!;

  const markers: SceneMarker[] = [];
  const SAMPLE_INTERVAL_MS = 500;

  return new Promise<SceneDetectionResult>((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    signal?.addEventListener('abort', () => {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    });

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'scene-change') {
        markers.push({
          id: generateId(),
          timestampMs: e.data.timestampMs,
          label: `Scene ${markers.length + 1}`,
          type: 'MARKER_AUTO_DETECTED',
        });
        onProgress({ currentMs: e.data.timestampMs, totalMs: durationMs, markersFound: markers.length });
      } else if (e.data.type === 'progress') {
        onProgress({ currentMs: e.data.timestampMs, totalMs: durationMs, markersFound: markers.length });
      } else if (e.data.type === 'complete') {
        worker.terminate();
        resolve({ markers });
      }
    };

    worker.postMessage({ type: 'init' });

    const savedTime = videoElement.currentTime;
    let currentMs = 0;

    async function sampleNextFrame() {
      if (signal?.aborted) return;
      if (currentMs > durationMs) {
        worker.postMessage({ type: 'done' });
        videoElement.currentTime = savedTime;
        return;
      }

      videoElement.currentTime = currentMs / 1000;
      await new Promise<void>((res) => {
        videoElement.onseeked = () => res();
      });

      ctx.drawImage(videoElement, 0, 0, 160, 90);
      const imageData = ctx.getImageData(0, 0, 160, 90);

      worker.postMessage({
        type: 'frame',
        data: { imageData, timestampMs: currentMs, config: { sensitivity } },
      }, [imageData.data.buffer]);

      currentMs += SAMPLE_INTERVAL_MS;
      setTimeout(sampleNextFrame, 0);
    }

    sampleNextFrame();
  });
}
