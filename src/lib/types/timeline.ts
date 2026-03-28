export interface TimelineViewport {
  pxPerMs: number;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface TimelineSelection {
  keyframeIds: string[];
  effectKeyframeIds: string[];
  sceneMarkerIds: string[];
  activeChannelId: string | null;
  selectionRect: SelectionRect | null;
}

export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type SceneMarkerType = 'MARKER_MANUAL' | 'MARKER_AUTO_DETECTED' | 'MARKER_CHAPTER';

export interface SceneMarker {
  id: string;
  timestampMs: number;
  label: string;
  type: SceneMarkerType;
}

export interface TimelineHitResult {
  type: 'keyframe' | 'effect' | 'scene-marker' | 'channel-header' | 'ruler' | 'empty';
  channelId?: string;
  keyframeId?: string;
  effectKeyframeId?: string;
  sceneMarkerId?: string;
  timestampMs: number;
  y: number;
}

export interface TimelineDragState {
  type: 'keyframe' | 'effect' | 'scene-marker' | 'selection-rect' | 'scroll';
  startX: number;
  startY: number;
  startTimestampMs: number;
  targetIds: string[];
  originalTimestamps: Map<string, number>;
}

export const MIN_PX_PER_MS = 0.001;
export const MAX_PX_PER_MS = 2.0;
export const DEFAULT_PX_PER_MS = 0.00467;
export const CHANNEL_LANE_HEIGHT = 44;
export const CHANNEL_HEADER_WIDTH = 160;
export const RULER_HEIGHT = 28;
export const MINIMAP_MIN_HEIGHT = 48;
export const MINIMAP_MAX_HEIGHT = 80;
export const MINIMAP_DEFAULT_HEIGHT = 56;
export const KEYFRAME_MARKER_RADIUS = 6;
export const KEYFRAME_HIT_RADIUS = 12;
export const KEYFRAME_SNAP_DISTANCE = 8;
export const PLAYHEAD_AUTO_FOLLOW_THRESHOLD = 0.75;
