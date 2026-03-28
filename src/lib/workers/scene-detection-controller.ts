// ============================================================
// Scene Detection Controller
// Manages the main-thread side of scene detection: video
// seeking, frame extraction, and communication with the
// scene-detection Web Worker.
// ============================================================

import type { SceneMarker } from '../types/timeline.js';
import type {
  StartMessage,
  FrameMessage,
  CancelMessage,
  DoneMessage,
  OutboundMessage,
} from './scene-detection.worker.js';

export interface SceneDetectionOptions {
  video: HTMLVideoElement;
  sensitivity: 'low' | 'medium' | 'high';
  sampleIntervalMs?: number;
  sampleWidth?: number;
  sampleHeight?: number;
  onProgress?: (percent: number, markersFound: number) => void;
  onComplete?: (markers: SceneMarker[]) => void;
  onError?: (error: string) => void;
}

const DEFAULT_SAMPLE_INTERVAL_MS = 500;
const DEFAULT_SAMPLE_WIDTH = 160;
const DEFAULT_SAMPLE_HEIGHT = 90;

let markerIdCounter = 0;

function generateMarkerId(): string {
  markerIdCounter += 1;
  return `scene-auto-${Date.now()}-${markerIdCounter}`;
}

export class SceneDetectionController {
  private worker: Worker | null = null;
  private cancelled = false;

  start(options: SceneDetectionOptions): void {
    this.cancel();
    this.cancelled = false;

    const {
      video,
      sensitivity,
      sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
      sampleWidth = DEFAULT_SAMPLE_WIDTH,
      sampleHeight = DEFAULT_SAMPLE_HEIGHT,
      onProgress,
      onComplete,
      onError,
    } = options;

    const totalDurationMs = video.duration * 1000;
    if (!isFinite(totalDurationMs) || totalDurationMs <= 0) {
      onError?.('Video has no valid duration');
      return;
    }

    // Create off-screen canvas for frame extraction
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      onError?.('Failed to create canvas context');
      return;
    }

    // Spin up the worker
    const worker = new Worker(new URL('./scene-detection.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;

    worker.onerror = (event) => {
      onError?.(event.message || 'Worker error');
    };

    worker.onmessage = (event: MessageEvent<OutboundMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'progress':
          onProgress?.(msg.percent, msg.markersFound);
          break;
        case 'result': {
          const markers: SceneMarker[] = msg.markers.map((m) => ({
            id: generateMarkerId(),
            timestampMs: m.timestampMs,
            label: `Scene @ ${formatTimestamp(m.timestampMs)}`,
            type: 'MARKER_AUTO_DETECTED',
          }));
          onComplete?.(markers);
          this.terminateWorker();
          break;
        }
        case 'error':
          onError?.(msg.message);
          this.terminateWorker();
          break;
      }
    };

    // Tell worker to initialize
    const startMsg: StartMessage = {
      type: 'start',
      sensitivity,
      totalDurationMs,
    };
    worker.postMessage(startMsg);

    // Begin seeking through the video
    this.processFrames(
      video,
      canvas,
      ctx,
      sampleIntervalMs,
      sampleWidth,
      sampleHeight,
      totalDurationMs,
      worker
    );
  }

  cancel(): void {
    this.cancelled = true;
    if (this.worker) {
      const msg: CancelMessage = { type: 'cancel' };
      this.worker.postMessage(msg);
      this.terminateWorker();
    }
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private async processFrames(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    sampleIntervalMs: number,
    sampleWidth: number,
    sampleHeight: number,
    totalDurationMs: number,
    worker: Worker
  ): Promise<void> {
    const totalSamples = Math.ceil(totalDurationMs / sampleIntervalMs);

    for (let i = 0; i <= totalSamples; i++) {
      if (this.cancelled || this.worker !== worker) return;

      const timestampMs = Math.min(i * sampleIntervalMs, totalDurationMs);
      const timeSeconds = timestampMs / 1000;

      try {
        await seekVideo(video, timeSeconds);
      } catch {
        // Skip frames that fail to seek (e.g., past end of video)
        continue;
      }

      if (this.cancelled || this.worker !== worker) return;

      ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

      const frameMsg: FrameMessage = {
        type: 'frame',
        imageData,
        timestampMs,
      };
      worker.postMessage(frameMsg);
    }

    if (!this.cancelled && this.worker === worker) {
      const doneMsg: DoneMessage = { type: 'done' };
      worker.postMessage(doneMsg);
    }
  }
}

function seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState < 2) {
      reject(new Error('Video not ready'));
      return;
    }

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Video seek failed'));
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = timeSeconds;
  });
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
