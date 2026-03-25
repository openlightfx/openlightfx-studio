// ============================================================
// Timeline types — viewport, selection, scene markers
// ============================================================

import type { EffectType } from './track.js';

/** Timeline viewport state */
export interface TimelineViewport {
  /** Pixels per millisecond (zoom level) */
  pxPerMs: number;
  /** Horizontal scroll offset in ms */
  scrollX: number;
  /** Vertical scroll offset in px */
  scrollY: number;
  /** Visible width in px */
  viewportWidth: number;
  /** Visible height in px */
  viewportHeight: number;
}

/** Timeline selection state */
export interface TimelineSelection {
  /** Currently selected keyframe IDs */
  keyframeIds: string[];
  /** Currently selected effect keyframe IDs */
  effectKeyframeIds: string[];
  /** Currently selected scene marker IDs */
  sceneMarkerIds: string[];
  /** Active channel lane (last clicked) */
  activeChannelId: string | null;
  /** Selection rectangle (for rubber-band selection) */
  selectionRect: SelectionRect | null;
}

/** Rubber-band selection rectangle */
export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** Scene marker types */
export type SceneMarkerType =
  | 'MARKER_MANUAL'
  | 'MARKER_AUTO_DETECTED'
  | 'MARKER_CHAPTER';

/** Scene marker (Studio-only, not exported to .lightfx) */
export interface SceneMarker {
  id: string;
  timestampMs: number;
  label: string;
  type: SceneMarkerType;
}

/** Timeline zoom limits */
export const MIN_PX_PER_MS = 0.001; // Very zoomed out (entire 3h movie visible)
export const MAX_PX_PER_MS = 2.0; // Very zoomed in (sub-frame precision)
export const DEFAULT_PX_PER_MS = 0.00467; // ~5 minutes visible at 1400px wide

/** Channel lane dimensions */
export const CHANNEL_LANE_HEIGHT = 40; // px
export const CHANNEL_HEADER_WIDTH = 160; // px
export const RULER_HEIGHT = 28; // px
export const MINIMAP_HEIGHT = 32; // px

/** Keyframe rendering */
export const KEYFRAME_MARKER_WIDTH = 8; // px
export const KEYFRAME_MARKER_HEIGHT = 24; // px
export const KEYFRAME_SNAP_DISTANCE = 5; // px (STU-020b)

/** Context menu item */
export interface TimelineContextMenuItem {
  id: string;
  label: string;
  enabled: boolean;
  separator?: boolean;
  submenu?: TimelineContextMenuItem[];
  action?: () => void;
}

/** Hit test result for timeline interactions */
export interface TimelineHitResult {
  type: 'keyframe' | 'effect' | 'scene-marker' | 'channel-header' | 'ruler' | 'empty';
  channelId?: string;
  keyframeId?: string;
  effectKeyframeId?: string;
  sceneMarkerId?: string;
  timestampMs: number;
  y: number;
}

/** Drag state for timeline interactions */
export interface TimelineDragState {
  type: 'keyframe' | 'effect' | 'scene-marker' | 'selection-rect' | 'scroll';
  startX: number;
  startY: number;
  startTimestampMs: number;
  targetIds: string[];
  originalTimestamps: Map<string, number>;
}
