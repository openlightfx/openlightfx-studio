import type { RGBColor } from './track.js';

export interface UIState {
  darkMode: boolean;
  overlayEnabled: boolean;
  snappingEnabled: boolean;
  onboardingComplete: boolean;
  activeModal: ModalType | null;
  eyedropperActive: boolean;
  minKeyframeIntervalMs: number;
}

export type ModalType =
  | 'movie-metadata' | 'export' | 'publish' | 'welcome'
  | 'keyboard-shortcuts' | 'channel-template' | 'confirm-delete'
  | 'about' | 'new-project' | 'track-metadata';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ContextMenu {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  id: string;
  label: string;
  enabled: boolean;
  icon?: string;
  shortcut?: string;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  action?: () => void;
}

export interface ClipboardBuffer {
  type: 'keyframes' | 'effect';
  sourceChannelId: string;
  data: unknown;
  baseTimestampMs: number;
}

export interface KeyboardShortcut {
  id: string;
  label: string;
  keys: string;
  category: ShortcutCategory;
  action: () => void;
}

export type ShortcutCategory = 'file' | 'edit' | 'playback' | 'timeline' | 'keyframe' | 'view';

export interface ColorHistoryEntry {
  color: RGBColor;
  addedAt: number;
}

export const MAX_COLOR_HISTORY = 16;
export const DEFAULT_TOAST_DURATION_MS = 3000;
export const ERROR_TOAST_DURATION_MS = 5000;
export const AUTO_SAVE_INTERVAL_MS = 60_000;
export const LS_KEY_COLOR_HISTORY = 'openlightfx-studio:color-history';
export const LS_KEY_MIN_KEYFRAME_INTERVAL = 'openlightfx-studio:min-keyframe-interval-ms';
export const LS_KEY_ONBOARDING = 'openlightfx-studio:onboarding-complete';
export const LS_KEY_DARK_MODE = 'openlightfx-studio:dark-mode';
export const LS_KEY_SNAPSHOT_PREFIX = 'openlightfx-studio:snapshot:';
