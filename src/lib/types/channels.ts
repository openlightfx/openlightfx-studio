// ============================================================
// Channel group & template types
// ============================================================

import type { Channel, SpatialHint } from './track.js';

/** Channel group modes (STU-058) */
export type GroupMode = 'GROUP_MIRROR' | 'GROUP_SPREAD' | 'GROUP_ALTERNATE';

/** Per-channel offsets within a group */
export interface ChannelGroupOffset {
  channelId: string;
  hueOffset: number; // degrees 0-360
  brightnessOffset: number; // -100 to +100
  timingOffsetMs: number; // ms delay
}

/** Channel group definition (Studio-only) */
export interface ChannelGroup {
  id: string;
  name: string;
  mode: GroupMode;
  channelIds: string[];
  offsets: ChannelGroupOffset[];
  /** Default timing offset for SPREAD mode in ms */
  defaultSpreadOffsetMs: number;
}

/** Channel template definition (STU-054) */
export interface ChannelTemplate {
  name: string;
  description: string;
  channels: ChannelTemplateEntry[];
}

/** A single channel within a template */
export interface ChannelTemplateEntry {
  id: string;
  displayName: string;
  spatialHint: SpatialHint;
}

/** Predefined channel templates (STU-054) */
export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  {
    name: 'Mono (1-channel)',
    description: 'Single ambient channel',
    channels: [
      { id: 'main', displayName: 'Main', spatialHint: 'SPATIAL_AMBIENT' },
    ],
  },
  {
    name: 'Stereo (2-channel)',
    description: 'Left and right channels',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    ],
  },
  {
    name: 'Stereo + Ambient (3-channel)',
    description: 'Left, right, and ambient channels',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
      { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
    ],
  },
  {
    name: 'Surround (4-channel)',
    description: 'Front left/right and surround left/right',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
      { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
      { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
    ],
  },
  {
    name: '6-Channel Theater',
    description: 'Full theater setup with center and ambient',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
      { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
      { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
      { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
    ],
  },
  {
    name: '8-Channel Home Theater',
    description: 'Full home theater with back channels',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
      { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
      { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
      { id: 'back-left', displayName: 'Back Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
      { id: 'back-right', displayName: 'Back Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
      { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
    ],
  },
];

/** Default group spread timing offset in ms */
export const DEFAULT_SPREAD_OFFSET_MS = 150;
export const MIN_SPREAD_OFFSET_MS = 0;
export const MAX_SPREAD_OFFSET_MS = 2000;
export const SPREAD_OFFSET_STEP_MS = 10;
