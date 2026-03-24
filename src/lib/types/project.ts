// ============================================================
// Project types — working project file format, undo history
// ============================================================

import type {
  Channel,
  EffectKeyframe,
  Keyframe,
  LightFXTrack,
  TrackMetadata,
} from './track.js';
import type { ChannelGroup } from './channels.js';
import type { SceneMarker } from './timeline.js';
import type { Command } from './commands.js';

/** The complete project file format (.lightfx-project, JSON) */
export interface ProjectFile {
  /** Project format version */
  formatVersion: number;
  /** Unique project identifier (UUID) */
  projectId: string;
  /** The track data */
  track: LightFXTrack;
  /** Channel groups (Studio-only, not exported to .lightfx) */
  channelGroups: ChannelGroup[];
  /** Scene markers (Studio-only, not exported to .lightfx) */
  sceneMarkers: SceneMarker[];
  /** Serialized undo history */
  undoHistory: SerializedCommand[];
  /** Undo stack pointer (index of next undo) */
  undoPointer: number;
  /** UI state for session restore */
  uiState: ProjectUIState;
  /** Path reference to the video file (for session restore) */
  videoFilePath: string;
  /** Candidate movie metadata from video container (for Movie Metadata modal pre-fill) */
  candidateMetadata: Partial<CandidateMovieMetadata>;
  /** Last modified timestamp (ISO 8601) */
  lastModified: string;
}

/** Serialized command for persistence in the project file */
export interface SerializedCommand {
  type: string;
  payload: unknown;
}

/** UI state to persist in the project file */
export interface ProjectUIState {
  timelineZoom: number;
  timelineScrollX: number;
  timelineScrollY: number;
  selectedChannelId: string | null;
  selectedKeyframeIds: string[];
  panelSizes: PanelSizes;
  overlayEnabled: boolean;
}

/** Panel sizes for the resizable layout */
export interface PanelSizes {
  videoPanelHeight: number; // percentage
  propertiesPanelWidth: number; // percentage
  timelinePanelHeight: number; // percentage
}

/** Candidate movie metadata extracted from video container */
export interface CandidateMovieMetadata {
  title: string;
  imdbId: string;
  year: number;
  durationMs: number;
}

/** In-memory project state (extends file format with runtime-only fields) */
export interface ProjectState {
  /** Project file data */
  file: ProjectFile;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Display name for the project (derived from track title or filename) */
  displayName: string;
  /** The currently-loaded video file handle (runtime only, not persisted) */
  videoFile: File | null;
  /** Object URL for the video (runtime only) */
  videoObjectUrl: string | null;
}

export const PROJECT_FORMAT_VERSION = 1;

/** Default panel sizes */
export const DEFAULT_PANEL_SIZES: PanelSizes = {
  videoPanelHeight: 40,
  propertiesPanelWidth: 25,
  timelinePanelHeight: 45,
};

export const DEFAULT_UI_STATE: ProjectUIState = {
  timelineZoom: 1,
  timelineScrollX: 0,
  timelineScrollY: 0,
  selectedChannelId: null,
  selectedKeyframeIds: [],
  panelSizes: DEFAULT_PANEL_SIZES,
  overlayEnabled: true,
};
