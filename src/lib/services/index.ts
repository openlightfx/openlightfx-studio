// ============================================================
// Barrel export for all services
// ============================================================

export { encodeLightFXTrack, decodeLightFXTrack } from './protobuf.js';
export { validateTrack } from './validation.js';
export type { ValidationIssue, ValidationResult } from './validation.js';
export { computeSafetyInfo } from './safety.js';
export {
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  hexToRgb,
  kelvinToRgb,
  interpolateColor,
  rgbToCssString,
  rgbToCssStringWithAlpha,
  areColorsEqual,
  clampBrightness,
  clampColorComponent,
} from './color-utils.js';
export { interpolateAtTime } from './interpolation.js';
export type { InterpolatedState } from './interpolation.js';
export { KeyboardShortcutManager } from './keyboard-shortcuts.js';
export {
  saveProjectFile,
  loadProjectFile,
  exportLightFXTrack,
  importLightFXFile,
} from './project-io.js';
export { captureVideoFrame, tonemapImageData, isHdrSignal } from './hdr-tonemap.js';
export {
  copySelectedKeyframes,
  cutSelectedKeyframes,
  pasteKeyframes,
  selectAllInActiveChannel,
  deleteSelected,
  addKeyframeAtPlayhead,
  addSceneMarkerAtPlayhead,
  openProject,
  openVideo,
  saveProject,
  saveProjectAs,
  importLightFX,
  showAbout,
} from './edit-actions.js';
