import type { LightFXTrack } from './track.js';
import type { ChannelGroup } from './channels.js';
import type { SceneMarker } from './timeline.js';
import type { SerializedCommandData } from './commands.js';

export interface ProjectFile {
  formatVersion: number;
  projectId: string;
  track: LightFXTrack;
  channelGroups: ChannelGroup[];
  sceneMarkers: SceneMarker[];
  undoHistory: SerializedCommandData[];
  undoPointer: number;
  uiState: ProjectUIState;
  videoFilePath: string;
  candidateMetadata: Partial<CandidateMovieMetadata>;
  lastModified: string;
}

export interface ProjectUIState {
  timelineZoom: number;
  timelineScrollX: number;
  timelineScrollY: number;
  selectedChannelId: string | null;
  selectedKeyframeIds: string[];
  overlayEnabled: boolean;
}

export interface CandidateMovieMetadata {
  title: string;
  imdbId: string;
  year: number;
  durationMs: number;
}

export interface ProjectState {
  file: ProjectFile;
  isDirty: boolean;
  displayName: string;
  videoFile: File | null;
  videoObjectUrl: string | null;
}

export const PROJECT_FORMAT_VERSION = 1;

export const DEFAULT_UI_STATE: ProjectUIState = {
  timelineZoom: 1,
  timelineScrollX: 0,
  timelineScrollY: 0,
  selectedChannelId: null,
  selectedKeyframeIds: [],
  overlayEnabled: true,
};
