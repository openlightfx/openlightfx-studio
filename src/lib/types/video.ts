// ============================================================
// Video types — playback state, metadata extraction
// ============================================================

/** Video playback state */
export interface VideoState {
  /** Whether a video file is loaded and ready */
  isLoaded: boolean;
  /** Whether a video file is currently being loaded */
  isLoading: boolean;
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** Current playback position in ms */
  currentTimeMs: number;
  /** Total duration in ms */
  durationMs: number;
  /** Playback speed multiplier */
  playbackSpeed: PlaybackSpeed;
  /** Video native width */
  videoWidth: number;
  /** Video native height */
  videoHeight: number;
  /** Detected frame rate (fps) */
  frameRate: number;
  /** Frame duration in ms (1000 / frameRate) */
  frameDurationMs: number;
  /** Object URL for the loaded video */
  objectUrl: string | null;
}

/** Supported playback speeds (STU-012b) */
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4];
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1;
export const DEFAULT_FRAME_RATE = 24;

/** Video container metadata extracted from file headers */
export interface VideoContainerMetadata {
  /** Duration from container metadata (may differ from HTML5 element) */
  durationMs: number;
  /** Chapter markers from the container */
  chapters: VideoChapter[];
  /** Container-level tags */
  tags: VideoContainerTags;
  /** Container format detected */
  format: 'mkv' | 'webm' | 'mp4' | 'unknown';
}

/** Chapter from video container */
export interface VideoChapter {
  startMs: number;
  endMs: number;
  title: string;
}

/** Metadata tags from video container */
export interface VideoContainerTags {
  title?: string;
  dateReleased?: string;
  imdbId?: string;
}

/** Supported video MIME types for the file picker */
export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'video/ogg',
];

export const VIDEO_FILE_EXTENSIONS = '.mp4,.webm,.mkv,.ogg';
