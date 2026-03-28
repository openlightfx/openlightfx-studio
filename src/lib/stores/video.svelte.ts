import type { PlaybackSpeed, VideoProbeResult } from '$lib/types/video.js';
import { DEFAULT_FRAME_RATE, DEFAULT_PLAYBACK_SPEED } from '$lib/types/video.js';

class VideoStore {
  isLoaded = $state(false);
  isLoading = $state(false);
  isPlaying = $state(false);
  currentTimeMs = $state(0);
  durationMs = $state(0);
  playbackSpeed = $state<PlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  videoWidth = $state(0);
  videoHeight = $state(0);
  frameRate = $state(DEFAULT_FRAME_RATE);
  frameDurationMs = $derived(1000 / this.frameRate);
  objectUrl = $state<string | null>(null);
  file = $state<File | null>(null);
  isHdr = $state(false);
  colorSpace = $state<string | null>(null);

  private videoElement: HTMLVideoElement | null = null;
  private rafId: number | null = null;

  bindElement(el: HTMLVideoElement): void {
    this.videoElement = el;
    el.addEventListener('loadedmetadata', () => {
      this.durationMs = el.duration * 1000;
      this.videoWidth = el.videoWidth;
      this.videoHeight = el.videoHeight;
      this.isLoaded = true;
      this.isLoading = false;
    });
    el.addEventListener('ended', () => { this.isPlaying = false; });
  }

  loadFile(file: File, objectUrl: string): void {
    this.isLoading = true;
    this.file = file;
    this.objectUrl = objectUrl;
    if (this.videoElement) {
      this.videoElement.src = objectUrl;
    }
  }

  applyProbeResult(result: VideoProbeResult): void {
    this.isHdr = result.isHdr;
    this.colorSpace = result.colorSpace;
    if (result.frameRate > 0) this.frameRate = result.frameRate;
    if (result.durationMs > 0 && this.durationMs === 0) this.durationMs = result.durationMs;
  }

  play(): void {
    if (!this.videoElement || !this.isLoaded) return;
    this.videoElement.playbackRate = this.playbackSpeed;
    this.videoElement.play();
    this.isPlaying = true;
    this.startTimeSync();
  }

  pause(): void {
    this.videoElement?.pause();
    this.isPlaying = false;
    this.stopTimeSync();
    this.syncTime();
  }

  togglePlayback(): void {
    if (this.isPlaying) this.pause(); else this.play();
  }

  seek(timeMs: number): void {
    if (!this.videoElement) return;
    this.videoElement.currentTime = timeMs / 1000;
    this.currentTimeMs = timeMs;
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.playbackSpeed = speed;
    if (this.videoElement) this.videoElement.playbackRate = speed;
  }

  stepForward(): void { this.seek(this.currentTimeMs + this.frameDurationMs); }
  stepBackward(): void { this.seek(Math.max(0, this.currentTimeMs - this.frameDurationMs)); }

  private startTimeSync(): void {
    const sync = () => {
      this.syncTime();
      this.rafId = requestAnimationFrame(sync);
    };
    this.rafId = requestAnimationFrame(sync);
  }

  private stopTimeSync(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private syncTime(): void {
    if (this.videoElement) {
      this.currentTimeMs = this.videoElement.currentTime * 1000;
    }
  }

  destroy(): void {
    this.stopTimeSync();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}

export const videoStore = new VideoStore();
