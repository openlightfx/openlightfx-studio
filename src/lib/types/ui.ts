// ============================================================
// UI types — panels, toast, context menu, modals
// ============================================================

/** UI panel visibility and layout state */
export interface UIState {
  /** Dark mode (true) or light mode (false) — STU-004 */
  darkMode: boolean;
  /** Whether the lighting overlay is visible — STU-096 */
  overlayEnabled: boolean;
  /** Whether snapping is enabled — STU-037 */
  snappingEnabled: boolean;
  /** Whether the welcome dialog has been shown — STU-120 */
  onboardingComplete: boolean;
  /** Currently open modal */
  activeModal: ModalType | null;
  /** Eyedropper active state */
  eyedropperActive: boolean;
  /** Which property context is showing in the properties panel */
  propertiesContext: PropertiesContext;
  /** Minimum keyframe interval in ms — STU-037a */
  minKeyframeIntervalMs: number;
}

/** Modal dialog types */
export type ModalType =
  | 'movie-metadata'
  | 'export'
  | 'publish'
  | 'welcome'
  | 'keyboard-shortcuts'
  | 'scene-detection'
  | 'channel-template'
  | 'channel-group'
  | 'confirm-delete';

/** Properties panel context — what to display */
export type PropertiesContext =
  | { type: 'track' }
  | { type: 'channel'; channelId: string }
  | { type: 'keyframe'; keyframeIds: string[] }
  | { type: 'effect'; effectKeyframeId: string }
  | { type: 'scene-marker'; sceneMarkerId: string };

/** Toast notification */
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

export type ToastType = 'info' | 'success' | 'warning' | 'error';

/** Context menu definition */
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

/** Clipboard buffer for copy/paste */
export interface ClipboardBuffer {
  type: 'keyframes' | 'effect';
  /** Source channel ID (for paste context) */
  sourceChannelId: string;
  /** Serialized data */
  data: unknown;
  /** Timestamp of the earliest item in the clipboard (for relative positioning) */
  baseTimestampMs: number;
}

/** Keyboard shortcut definition */
export interface KeyboardShortcut {
  id: string;
  label: string;
  keys: string; // e.g., "Ctrl+S", "K", "Delete"
  category: ShortcutCategory;
  action: () => void;
}

export type ShortcutCategory =
  | 'file'
  | 'edit'
  | 'playback'
  | 'timeline'
  | 'keyframe'
  | 'view';

/** Color history entry */
export interface ColorHistoryEntry {
  color: RGBColor;
  addedAt: number; // timestamp
}

import type { RGBColor } from './track.js';

/** Maximum color history size (STU-042) */
export const MAX_COLOR_HISTORY = 16;

/** Toast defaults */
export const DEFAULT_TOAST_DURATION_MS = 3000;
export const ERROR_TOAST_DURATION_MS = 5000;

/** Auto-save interval (STU-064) */
export const AUTO_SAVE_INTERVAL_MS = 60_000; // 1 minute

/** localStorage keys */
export const LS_KEY_COLOR_HISTORY = 'openlightfx-studio:color-history';
export const LS_KEY_MIN_KEYFRAME_INTERVAL = 'openlightfx-studio:min-keyframe-interval-ms';
export const LS_KEY_ONBOARDING = 'openlightfx-studio:onboarding-complete';
export const LS_KEY_DARK_MODE = 'openlightfx-studio:dark-mode';
export const LS_KEY_SNAPSHOT_PREFIX = 'openlightfx-studio:snapshot:';
