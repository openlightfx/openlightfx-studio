export interface VideoState {
  isLoaded: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  playbackSpeed: PlaybackSpeed;
  videoWidth: number;
  videoHeight: number;
  frameRate: number;
  frameDurationMs: number;
  objectUrl: string | null;
  file: File | null;
  isHdr: boolean;
  colorSpace: string | null;
}

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;
export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4];
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1;
export const DEFAULT_FRAME_RATE = 24;
export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/x-matroska'];
export const VIDEO_FILE_EXTENSIONS = '.mp4,.webm,.mkv';

export interface VideoChapter {
  startMs: number;
  endMs: number;
  title: string;
}

export interface VideoProbeResult {
  isHdr: boolean;
  colorSpace: string | null;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  frameRate: number;
  durationMs: number;
  codec: string;
  width: number;
  height: number;
  chapters: VideoChapter[];
}
