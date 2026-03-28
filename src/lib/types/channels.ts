import type { SpatialHint } from './track.js';

export type GroupMode = 'GROUP_MIRROR' | 'GROUP_SPREAD' | 'GROUP_ALTERNATE';

export interface ChannelGroupOffset {
  channelId: string;
  hueOffset: number;
  brightnessOffset: number;
  timingOffsetMs: number;
}

export interface ChannelGroup {
  id: string;
  name: string;
  mode: GroupMode;
  channelIds: string[];
  offsets: ChannelGroupOffset[];
  defaultSpreadOffsetMs: number;
}

export interface ChannelTemplate {
  name: string;
  description: string;
  channels: ChannelTemplateEntry[];
}

export interface ChannelTemplateEntry {
  id: string;
  displayName: string;
  spatialHint: SpatialHint;
}

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  {
    name: 'Ambient',
    description: 'Single ambient channel',
    channels: [{ id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' }],
  },
  {
    name: 'Stereo',
    description: 'Left and right channels',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    ],
  },
  {
    name: 'Stereo + Ambient',
    description: 'Left, right, and ambient channels',
    channels: [
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
      { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
    ],
  },
  {
    name: 'Surround',
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

export const DEFAULT_SPREAD_OFFSET_MS = 150;
export const MIN_SPREAD_OFFSET_MS = 0;
export const MAX_SPREAD_OFFSET_MS = 2000;
export const SPREAD_OFFSET_STEP_MS = 10;
