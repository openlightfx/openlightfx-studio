import type { ProjectFile } from '$lib/types/project.js';
import type { ChannelTemplateEntry } from '$lib/types/channels.js';
import type { LightFXTrack, Channel, Keyframe } from '$lib/types/track.js';
import { PROJECT_FORMAT_VERSION } from '$lib/types/project.js';
import { TRACK_FORMAT_VERSION, DEFAULT_RGB_COLOR, DEFAULT_BRIGHTNESS } from '$lib/types/track.js';
import { generateId } from './id.js';

export function newProject(templateChannels: ChannelTemplateEntry[]): ProjectFile {
  const channels: Channel[] = templateChannels.map((tc) => ({
    id: tc.id,
    displayName: tc.displayName,
    description: '',
    defaultColor: { ...DEFAULT_RGB_COLOR },
    defaultBrightness: 0,
    spatialHint: tc.spatialHint,
    optional: true,
  }));

  // Auto-insert black keyframe at t=0 for each channel
  const keyframes: Keyframe[] = channels.map((ch) => ({
    id: generateId(),
    channelId: ch.id,
    timestampMs: 0,
    colorMode: 'RGB' as const,
    color: { ...DEFAULT_RGB_COLOR },
    colorTemperature: 0,
    brightness: 0,
    transitionMs: 0,
    interpolation: 'STEP' as const,
    powerOn: false,
  }));

  const track: LightFXTrack = {
    version: TRACK_FORMAT_VERSION,
    metadata: {
      title: '',
      description: '',
      author: '',
      tags: [],
      durationMs: 0,
      movieReference: { imdbId: '', title: '', year: 0, runtimeMinutes: 0 },
      startBehavior: 'LEAVE',
      endBehavior: 'LEAVE',
      preshowDurationMs: 0,
      preshowState: 'PRESHOW_UNSPECIFIED',
      creditsStartMs: 0,
      creditsBehavior: 'CREDITS_UNSPECIFIED',
      trackVersion: '1.0',
    },
    channels,
    keyframes,
    effectKeyframes: [],
    safetyInfo: {
      containsFlashing: false,
      containsStrobing: false,
      maxFlashFrequencyHz: 0,
      maxBrightnessDelta: 0,
      warningText: '',
      intensityRating: 'SUBTLE',
    },
  };

  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    projectId: generateId(),
    track,
    channelGroups: [],
    sceneMarkers: [],
    undoHistory: [],
    undoPointer: 0,
    uiState: {
      timelineZoom: 1,
      timelineScrollX: 0,
      timelineScrollY: 0,
      selectedChannelId: null,
      selectedKeyframeIds: [],
      overlayEnabled: true,
    },
    videoFilePath: '',
    candidateMetadata: {},
    lastModified: new Date().toISOString(),
  };
}

export function trackToProject(track: LightFXTrack): ProjectFile {
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    projectId: generateId(),
    track,
    channelGroups: [],
    sceneMarkers: [],
    undoHistory: [],
    undoPointer: 0,
    uiState: {
      timelineZoom: 1,
      timelineScrollX: 0,
      timelineScrollY: 0,
      selectedChannelId: null,
      selectedKeyframeIds: [],
      overlayEnabled: true,
    },
    videoFilePath: '',
    candidateMetadata: {},
    lastModified: new Date().toISOString(),
  };
}

export function projectToJson(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

export function jsonToProject(json: string): ProjectFile {
  return JSON.parse(json) as ProjectFile;
}
