# OpenLightFX Studio Rewrite — Layer 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild OpenLightFX Studio from scratch with a modern floating-panel UX, HDR-aware frame extraction via ffmpeg.wasm, and a SaveProvider abstraction — delivering the core editing loop (video + timeline + keyframes + channels + eyedropper + export).

**Architecture:** SvelteKit SPA with Svelte 5 runes for reactivity. Canvas-based timeline for 60fps rendering of 10k+ keyframes. Command pattern for undo/redo (200-deep stack). ffmpeg.wasm in a Web Worker for HDR detection and tone-mapped frame extraction. SaveProvider interface abstracts local file system (Chromium), download fallback (Firefox/Safari), and future cloud saves.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript 5, Tailwind CSS 3, Vite 6, protobufjs 7, ffmpeg.wasm 0.12, vitest

**Design Spec:** `requirements/openlightfx-studio-rewrite-design.md`
**Proto Schema:** `../shared/lightfx.proto` (also at `src/proto/lightfx.proto`)

---

## ⚠️ Clean-Slate Rewrite — Zero Preserved Code

**This is a complete ground-up rewrite. NONE of the current implementation is preserved.** Every file under `src/` is deleted — all components, stores, services, types, routes, and utilities from the previous implementation are discarded entirely. No code is carried forward, no files are selectively kept, no refactoring of existing modules. The previous implementation is beyond repair and serves only as a cautionary reference.

The only files retained from the existing repo are build/config files (`vite.config.js`, `svelte.config.js`, `tailwind.config.js`, `tsconfig.json`, `package.json`) which will be updated as needed, and the proto schema (`../shared/lightfx.proto`).

---

## File Structure

```
src/
├── app.html
├── app.css
├── app.d.ts
├── proto/lightfx.proto
│
├── lib/
│   ├── types/
│   │   ├── track.ts              # Proto-mirroring types (RGBColor, Keyframe, Channel, etc.)
│   │   ├── project.ts            # ProjectFile, ProjectState, ProjectUIState
│   │   ├── timeline.ts           # TimelineViewport, TimelineSelection, SceneMarker
│   │   ├── channels.ts           # ChannelGroup, ChannelTemplate, CHANNEL_TEMPLATES
│   │   ├── commands.ts           # Command interface, CommandType, SerializedCommandData
│   │   ├── video.ts              # VideoState, PlaybackSpeed, VideoContainerMetadata
│   │   ├── ui.ts                 # UIState, ModalType, Toast, ContextMenu, KeyboardShortcut
│   │   ├── save.ts               # SaveProvider interface, SaveProviderType
│   │   └── index.ts              # Barrel export
│   │
│   ├── services/
│   │   ├── color-utils.ts        # RGB↔HSL↔Hex, Kelvin→RGB, color interpolation
│   │   ├── interpolation.ts      # Keyframe interpolation engine (Step, Linear)
│   │   ├── safety.ts             # computeSafetyInfo()
│   │   ├── validation.ts         # validateTrack()
│   │   ├── protobuf.ts           # encode/decode .lightfx via protobufjs
│   │   ├── project-io.ts         # newProject(), projectToJson(), jsonToProject()
│   │   ├── id.ts                 # UUID generation
│   │   └── index.ts
│   │
│   ├── commands/
│   │   ├── add-keyframe.ts
│   │   ├── delete-keyframe.ts
│   │   ├── move-keyframe.ts
│   │   ├── edit-keyframe.ts
│   │   ├── add-channel.ts
│   │   ├── delete-channel.ts
│   │   ├── edit-channel.ts
│   │   ├── reorder-channels.ts
│   │   ├── edit-metadata.ts
│   │   ├── composite.ts
│   │   └── index.ts
│   │
│   ├── stores/
│   │   ├── project.svelte.ts     # ProjectStore (track data, channels, keyframes)
│   │   ├── timeline.svelte.ts    # TimelineStore (viewport, selection)
│   │   ├── video.svelte.ts       # VideoStore (playback state, HDR flag)
│   │   ├── ui.svelte.ts          # UIStore (dark mode, modals, eyedropper)
│   │   ├── undo.svelte.ts        # UndoStore (command stacks)
│   │   ├── clipboard.svelte.ts   # ClipboardStore (copy/paste buffer)
│   │   ├── toast.svelte.ts       # ToastStore (notifications)
│   │   ├── snapshot.svelte.ts    # SnapshotStore (localStorage auto-save)
│   │   └── index.ts
│   │
│   ├── save/
│   │   ├── local-filesystem.ts   # File System Access API provider
│   │   ├── download.ts           # Download/upload fallback provider
│   │   └── index.ts              # createSaveProvider(), provider detection
│   │
│   ├── workers/
│   │   ├── ffmpeg.worker.ts      # ffmpeg.wasm frame extraction + HDR detection
│   │   └── snapshot.worker.ts    # Off-thread snapshot serialization
│   │
│   └── components/
│       ├── shared/
│       │   ├── Modal.svelte
│       │   ├── Popover.svelte
│       │   ├── Button.svelte
│       │   ├── IconButton.svelte
│       │   ├── Slider.svelte
│       │   ├── Select.svelte
│       │   ├── TextInput.svelte
│       │   ├── Toggle.svelte
│       │   ├── Toast.svelte
│       │   └── ContextMenu.svelte
│       │
│       ├── app/
│       │   ├── AppShell.svelte
│       │   ├── TopBar.svelte
│       │   ├── StatusBar.svelte
│       │   └── CommandPalette.svelte
│       │
│       ├── video/
│       │   ├── VideoPanel.svelte
│       │   ├── PlaybackControls.svelte
│       │   ├── LightingOverlay.svelte
│       │   └── Eyedropper.svelte
│       │
│       ├── timeline/
│       │   ├── TimelinePanel.svelte
│       │   ├── TimelineCanvas.svelte
│       │   ├── ChannelHeaders.svelte
│       │   ├── Minimap.svelte
│       │   └── interaction.ts      # Pointer event handling logic (pure functions)
│       │
│       ├── properties/
│       │   ├── KeyframePopover.svelte
│       │   ├── ChannelPopover.svelte
│       │   ├── TrackMetadataModal.svelte
│       │   └── MovieMetadataModal.svelte
│       │
│       ├── color/
│       │   ├── ColorPicker.svelte
│       │   ├── ColorWheel.svelte
│       │   ├── RGBSliders.svelte
│       │   ├── KelvinSlider.svelte
│       │   ├── HexInput.svelte
│       │   └── ColorHistory.svelte
│       │
│       ├── channels/
│       │   ├── ChannelTemplateSelector.svelte
│       │   ├── AddChannelDialog.svelte
│       │   └── NewProjectDialog.svelte
│       │
│       └── dialogs/
│           ├── ExportDialog.svelte
│           ├── KeyboardShortcutsDialog.svelte
│           └── AboutDialog.svelte
│
├── routes/
│   ├── +layout.svelte
│   ├── +layout.ts
│   └── +page.svelte
│
tests/
├── services/
│   ├── color-utils.test.ts
│   ├── interpolation.test.ts
│   ├── safety.test.ts
│   ├── validation.test.ts
│   ├── protobuf.test.ts
│   └── project-io.test.ts
├── commands/
│   ├── keyframe-commands.test.ts
│   ├── channel-commands.test.ts
│   └── composite-command.test.ts
├── stores/
│   ├── project.test.ts
│   ├── timeline.test.ts
│   ├── undo.test.ts
│   └── clipboard.test.ts
└── save/
    └── providers.test.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Delete: all files under `src/lib/`, `src/routes/`
- Create: `vitest.config.ts`
- Create: `src/app.html`
- Create: `src/app.css`
- Create: `src/app.d.ts`
- Create: `src/routes/+layout.svelte`
- Create: `src/routes/+layout.ts`
- Create: `src/routes/+page.svelte`

- [ ] **Step 1: Add vitest and testing dependencies**

```bash
npm install -D vitest @testing-library/svelte @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Delete all existing source files under src/lib and src/routes**

```bash
rm -rf src/lib src/routes
mkdir -p src/lib src/routes
```

Keep `src/app.html`, `src/app.css`, `src/app.d.ts`, `src/proto/`.

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
  },
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

- [ ] **Step 4: Update vite.config.js to reference vitest**

Replace `vite.config.js`:
```javascript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.proto'],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg'],
  },
});
```

- [ ] **Step 5: Create minimal app entry files**

Create `src/app.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/logo.svg" />
    <title>OpenLightFX Studio</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body { background: #0f0f1a; margin: 0; }</style>
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

Create `src/app.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  color-scheme: dark;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.5); }
```

Create `src/app.d.ts`:
```typescript
/// <reference types="@sveltejs/kit" />
declare namespace App {}
```

Create `src/routes/+layout.ts`:
```typescript
export const ssr = false;
export const prerender = true;
```

Create `src/routes/+layout.svelte`:
```svelte
<script>
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

Create `src/routes/+page.svelte`:
```svelte
<div class="h-screen w-screen bg-bg text-text-base flex items-center justify-center">
  <p class="text-textMuted">OpenLightFX Studio — Loading...</p>
</div>
```

- [ ] **Step 6: Verify build compiles**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Verify vitest runs**

```bash
npx vitest run
```

Expected: "No test files found" (no tests yet, but vitest runs successfully).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold clean project with vitest"
```

---

### Task 2: Core Types

**Files:**
- Create: `src/lib/types/track.ts`
- Create: `src/lib/types/project.ts`
- Create: `src/lib/types/timeline.ts`
- Create: `src/lib/types/channels.ts`
- Create: `src/lib/types/commands.ts`
- Create: `src/lib/types/video.ts`
- Create: `src/lib/types/ui.ts`
- Create: `src/lib/types/save.ts`
- Create: `src/lib/types/index.ts`

- [ ] **Step 1: Create track types**

Create `src/lib/types/track.ts`:
```typescript
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export type ColorMode = 'RGB' | 'COLOR_TEMPERATURE';
export type InterpolationMode = 'STEP' | 'LINEAR';
export type BoundaryBehavior = 'BOUNDARY_UNSPECIFIED' | 'LEAVE' | 'OFF' | 'ON';
export type PreshowState = 'PRESHOW_UNSPECIFIED' | 'PRESHOW_DIM' | 'PRESHOW_OFF' | 'PRESHOW_WARM';
export type CreditsBehavior = 'CREDITS_UNSPECIFIED' | 'CREDITS_CONTINUE' | 'CREDITS_DIM_UP' | 'CREDITS_RAISE' | 'CREDITS_OFF';
export type IntensityRating = 'INTENSITY_UNSPECIFIED' | 'SUBTLE' | 'MODERATE' | 'INTENSE' | 'EXTREME';
export type SpatialHint =
  | 'SPATIAL_UNSPECIFIED' | 'SPATIAL_LEFT' | 'SPATIAL_RIGHT' | 'SPATIAL_CENTER'
  | 'SPATIAL_SURROUND_LEFT' | 'SPATIAL_SURROUND_RIGHT' | 'SPATIAL_CEILING'
  | 'SPATIAL_FLOOR' | 'SPATIAL_BEHIND_SCREEN' | 'SPATIAL_AMBIENT';

export type EffectType =
  | 'EFFECT_UNSPECIFIED' | 'LIGHTNING' | 'FLAME' | 'FLASHBANG' | 'EXPLOSION'
  | 'PULSE' | 'STROBE' | 'SIREN' | 'AURORA' | 'CANDLE' | 'GUNFIRE'
  | 'NEON' | 'BREATHING' | 'SPARK';

export type RequiredCapability = 'CAPABILITY_ANY' | 'CAPABILITY_RGB' | 'CAPABILITY_FAST_TRANSITION' | 'CAPABILITY_FAST_RGB';

export interface MovieReference {
  imdbId: string;
  title: string;
  year: number;
  runtimeMinutes: number;
}

export interface TrackMetadata {
  title: string;
  description: string;
  movieReference: MovieReference;
  author: string;
  tags: string[];
  durationMs: number;
  startBehavior: BoundaryBehavior;
  endBehavior: BoundaryBehavior;
  preshowDurationMs: number;
  preshowState: PreshowState;
  creditsStartMs: number;
  creditsBehavior: CreditsBehavior;
  trackVersion: string;
}

export interface Channel {
  id: string;
  displayName: string;
  description: string;
  defaultColor: RGBColor;
  defaultBrightness: number;
  spatialHint: SpatialHint;
  optional: boolean;
}

export interface Keyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  colorMode: ColorMode;
  color: RGBColor;
  colorTemperature: number;
  brightness: number;
  transitionMs: number;
  interpolation: InterpolationMode;
  powerOn: boolean;
}

export interface EffectParams {
  params: Record<string, number>;
}

export interface EffectKeyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  effectType: EffectType;
  intensity: number;
  primaryColor: RGBColor;
  secondaryColor: RGBColor;
  effectParams: EffectParams;
  requiredCapability: RequiredCapability;
  fallbackColor: RGBColor;
  fallbackBrightness: number;
}

export interface SafetyInfo {
  containsFlashing: boolean;
  containsStrobing: boolean;
  maxFlashFrequencyHz: number;
  maxBrightnessDelta: number;
  warningText: string;
  intensityRating: IntensityRating;
}

export interface LightFXTrack {
  version: number;
  metadata: TrackMetadata;
  channels: Channel[];
  keyframes: Keyframe[];
  effectKeyframes: EffectKeyframe[];
  safetyInfo: SafetyInfo;
}

export const DEFAULT_RGB_COLOR: RGBColor = { r: 0, g: 0, b: 0 };
export const DEFAULT_WHITE_COLOR: RGBColor = { r: 255, g: 255, b: 255 };
export const DEFAULT_BRIGHTNESS = 0;
export const DEFAULT_INTERPOLATION: InterpolationMode = 'STEP';
export const DEFAULT_COLOR_MODE: ColorMode = 'RGB';
export const TRACK_FORMAT_VERSION = 1;
export const MIN_KEYFRAME_INTERVAL_MS = 100;
export const MAX_KEYFRAME_INTERVAL_MS = 1000;
export const DEFAULT_KEYFRAME_INTERVAL_MS = 200;
export const MIN_COLOR_TEMPERATURE = 1000;
export const MAX_COLOR_TEMPERATURE = 10000;
export const COLOR_TEMPERATURE_STEP = 100;
```

- [ ] **Step 2: Create channels types**

Create `src/lib/types/channels.ts`:
```typescript
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
```

- [ ] **Step 3: Create timeline types**

Create `src/lib/types/timeline.ts`:
```typescript
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
export const CHANNEL_LANE_HEIGHT = 44;  // 44px for touch targets
export const CHANNEL_HEADER_WIDTH = 160;
export const RULER_HEIGHT = 28;
export const MINIMAP_MIN_HEIGHT = 48;   // min 48px for tablet usability
export const MINIMAP_MAX_HEIGHT = 80;
export const MINIMAP_DEFAULT_HEIGHT = 56;
export const KEYFRAME_MARKER_RADIUS = 6;
export const KEYFRAME_HIT_RADIUS = 12;  // larger hit area for touch
export const KEYFRAME_SNAP_DISTANCE = 8;
export const PLAYHEAD_AUTO_FOLLOW_THRESHOLD = 0.75; // scroll when playhead reaches 75% of viewport
```

- [ ] **Step 4: Create video, ui, commands, save, project types**

Create `src/lib/types/video.ts`:
```typescript
export interface VideoState {
  isLoaded: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  playbackSpeed: PlaybackSpeed;
  videoWidth: number;
  videoHeight: number;
  frameRate: number;
  frameDurationMs: number;
  objectUrl: string | null;
  file: File | null;
  isHdr: boolean;
  colorSpace: string | null;
}

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;
export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4];
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1;
export const DEFAULT_FRAME_RATE = 24;
export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/x-matroska'];
export const VIDEO_FILE_EXTENSIONS = '.mp4,.webm,.mkv';

export interface VideoChapter {
  startMs: number;
  endMs: number;
  title: string;
}

export interface VideoProbeResult {
  isHdr: boolean;
  colorSpace: string | null;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  frameRate: number;
  durationMs: number;
  codec: string;
  width: number;
  height: number;
  chapters: VideoChapter[];
}
```

Create `src/lib/types/ui.ts`:
```typescript
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
```

Create `src/lib/types/commands.ts`:
```typescript
export interface Command {
  readonly type: string;
  readonly description: string;
  execute(): void;
  undo(): void;
  serialize(): SerializedCommandData;
}

export interface SerializedCommandData {
  type: string;
  description: string;
  payload: unknown;
}

export type CommandType =
  | 'ADD_KEYFRAME' | 'DELETE_KEYFRAME' | 'MOVE_KEYFRAME' | 'EDIT_KEYFRAME'
  | 'ADD_CHANNEL' | 'DELETE_CHANNEL' | 'EDIT_CHANNEL' | 'REORDER_CHANNELS'
  | 'EDIT_METADATA' | 'COMPOSITE';

export const MAX_UNDO_STACK_SIZE = 200;
```

Create `src/lib/types/save.ts`:
```typescript
import type { ProjectFile } from './project.js';

export interface SaveProvider {
  readonly type: SaveProviderType;
  readonly displayName: string;
  readonly canAutoSave: boolean;
  save(project: ProjectFile): Promise<void>;
  load(): Promise<ProjectFile>;
  saveAs(project: ProjectFile): Promise<void>;
  hasFile(): boolean;
}

export type SaveProviderType = 'local-filesystem' | 'download' | 'cloud';
```

Create `src/lib/types/project.ts`:
```typescript
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
```

- [ ] **Step 5: Create barrel export**

Create `src/lib/types/index.ts`:
```typescript
export * from './track.js';
export * from './project.js';
export * from './timeline.js';
export * from './channels.js';
export * from './commands.js';
export * from './video.js';
export * from './ui.js';
export * from './save.js';
```

- [ ] **Step 6: Verify types compile**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add core type definitions"
```

---

### Task 3: ID Generation & Color Utilities Service

**Files:**
- Create: `src/lib/services/id.ts`
- Create: `src/lib/services/color-utils.ts`
- Create: `tests/services/color-utils.test.ts`

- [ ] **Step 1: Create ID service**

Create `src/lib/services/id.ts`:
```typescript
export function generateId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Write failing color-utils tests**

Create `tests/services/color-utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  rgbToHex, hexToRgb, rgbToHsl, hslToRgb,
  kelvinToRgb, rgbToNearestKelvin, interpolateColor,
  clampRgb, rgbEqual,
} from '../../src/lib/services/color-utils.js';

describe('rgbToHex', () => {
  it('converts black', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });
  it('converts white', () => {
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
  });
  it('converts a color', () => {
    expect(rgbToHex({ r: 108, g: 99, b: 255 })).toBe('#6c63ff');
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#6c63ff')).toEqual({ r: 108, g: 99, b: 255 });
  });
  it('parses 3-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('parses without hash', () => {
    expect(hexToRgb('6c63ff')).toEqual({ r: 108, g: 99, b: 255 });
  });
  it('returns null for invalid input', () => {
    expect(hexToRgb('xyz')).toBeNull();
  });
});

describe('rgbToHsl / hslToRgb', () => {
  it('round-trips red', () => {
    const rgb = { r: 255, g: 0, b: 0 };
    const hsl = rgbToHsl(rgb);
    expect(hsl.h).toBeCloseTo(0);
    expect(hsl.s).toBeCloseTo(100);
    expect(hsl.l).toBeCloseTo(50);
    const back = hslToRgb(hsl);
    expect(back.r).toBe(255);
    expect(back.g).toBe(0);
    expect(back.b).toBe(0);
  });
  it('round-trips gray', () => {
    const rgb = { r: 128, g: 128, b: 128 };
    const hsl = rgbToHsl(rgb);
    expect(hsl.s).toBeCloseTo(0);
    const back = hslToRgb(hsl);
    expect(back.r).toBe(128);
  });
});

describe('kelvinToRgb', () => {
  it('returns warm color at 2000K', () => {
    const rgb = kelvinToRgb(2000);
    expect(rgb.r).toBeGreaterThan(rgb.b);
  });
  it('returns cool color at 9000K', () => {
    const rgb = kelvinToRgb(9000);
    expect(rgb.b).toBeGreaterThan(rgb.r);
  });
  it('returns near-white at ~6500K', () => {
    const rgb = kelvinToRgb(6500);
    expect(Math.abs(rgb.r - rgb.b)).toBeLessThan(30);
  });
});

describe('rgbToNearestKelvin', () => {
  it('maps warm orange to low kelvin', () => {
    const k = rgbToNearestKelvin({ r: 255, g: 147, b: 41 });
    expect(k).toBeGreaterThanOrEqual(1000);
    expect(k).toBeLessThan(3000);
  });
});

describe('interpolateColor', () => {
  it('returns start at t=0', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(interpolateColor(a, b, 0)).toEqual(a);
  });
  it('returns end at t=1', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(interpolateColor(a, b, 1)).toEqual(b);
  });
  it('returns midpoint at t=0.5', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 200, g: 100, b: 50 };
    const mid = interpolateColor(a, b, 0.5);
    expect(mid.r).toBe(100);
    expect(mid.g).toBe(50);
    expect(mid.b).toBe(25);
  });
});

describe('clampRgb', () => {
  it('clamps values to 0-255', () => {
    expect(clampRgb({ r: -10, g: 300, b: 128 })).toEqual({ r: 0, g: 255, b: 128 });
  });
});

describe('rgbEqual', () => {
  it('returns true for same colors', () => {
    expect(rgbEqual({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(true);
  });
  it('returns false for different colors', () => {
    expect(rgbEqual({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 31 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/services/color-utils.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement color-utils**

Create `src/lib/services/color-utils.ts`:
```typescript
import type { RGBColor } from '$lib/types/index.js';

export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function rgbToHex(color: RGBColor): string {
  const r = color.r.toString(16).padStart(2, '0');
  const g = color.g.toString(16).padStart(2, '0');
  const b = color.b.toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgb(hex: string): RGBColor | null {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHsl(color: RGBColor): HSLColor {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: HSLColor): RGBColor {
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  const h = hsl.h / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Convert color temperature (Kelvin) to approximate RGB.
 * Based on Tanner Helland's algorithm.
 */
export function kelvinToRgb(kelvin: number): RGBColor {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }

  return clampRgb({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
}

/**
 * Find the nearest color temperature (Kelvin) for an RGB color.
 * Brute-force search in 100K steps over 1000–10000K range.
 */
export function rgbToNearestKelvin(color: RGBColor): number {
  let bestK = 1000;
  let bestDist = Infinity;
  for (let k = 1000; k <= 10000; k += 100) {
    const ref = kelvinToRgb(k);
    const dist = Math.sqrt(
      (color.r - ref.r) ** 2 + (color.g - ref.g) ** 2 + (color.b - ref.b) ** 2,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestK = k;
    }
  }
  return bestK;
}

export function interpolateColor(a: RGBColor, b: RGBColor, t: number): RGBColor {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export function clampRgb(color: RGBColor): RGBColor {
  return {
    r: Math.max(0, Math.min(255, color.r)),
    g: Math.max(0, Math.min(255, color.g)),
    b: Math.max(0, Math.min(255, color.b)),
  };
}

export function rgbEqual(a: RGBColor, b: RGBColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function rgbToCssString(color: RGBColor, alpha = 1): string {
  if (alpha < 1) return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/services/color-utils.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add ID generation and color utilities service with tests"
```

---

### Task 4: Interpolation Service

**Files:**
- Create: `src/lib/services/interpolation.ts`
- Create: `tests/services/interpolation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/services/interpolation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getChannelStateAtTime } from '../../src/lib/services/interpolation.js';
import type { Keyframe, RGBColor } from '../../src/lib/types/index.js';

function makeKeyframe(overrides: Partial<Keyframe> & { timestampMs: number; channelId: string }): Keyframe {
  return {
    id: 'kf-' + overrides.timestampMs,
    colorMode: 'RGB',
    color: { r: 0, g: 0, b: 0 },
    colorTemperature: 4000,
    brightness: 100,
    transitionMs: 0,
    interpolation: 'STEP',
    powerOn: true,
    ...overrides,
  };
}

describe('getChannelStateAtTime', () => {
  it('returns null for empty keyframes', () => {
    expect(getChannelStateAtTime([], 1000)).toBeNull();
  });

  it('returns the only keyframe when at its time', () => {
    const kfs = [makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 50 })];
    const state = getChannelStateAtTime(kfs, 0);
    expect(state?.brightness).toBe(50);
  });

  it('holds STEP value until next keyframe', () => {
    const kfs = [
      makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 50 }),
      makeKeyframe({ channelId: 'a', timestampMs: 1000, brightness: 100, interpolation: 'STEP' }),
    ];
    const state = getChannelStateAtTime(kfs, 500);
    expect(state?.brightness).toBe(50);
  });

  it('interpolates LINEAR between keyframes', () => {
    const kfs = [
      makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 0, color: { r: 0, g: 0, b: 0 } }),
      makeKeyframe({ channelId: 'a', timestampMs: 1000, brightness: 100, color: { r: 200, g: 100, b: 50 }, interpolation: 'LINEAR' }),
    ];
    const state = getChannelStateAtTime(kfs, 500);
    expect(state?.brightness).toBe(50);
    expect(state?.color.r).toBe(100);
  });

  it('returns last keyframe state after it', () => {
    const kfs = [makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 75 })];
    const state = getChannelStateAtTime(kfs, 5000);
    expect(state?.brightness).toBe(75);
  });

  it('returns null before first keyframe', () => {
    const kfs = [makeKeyframe({ channelId: 'a', timestampMs: 1000 })];
    expect(getChannelStateAtTime(kfs, 500)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/interpolation.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement interpolation service**

Create `src/lib/services/interpolation.ts`:
```typescript
import type { Keyframe, RGBColor } from '$lib/types/index.js';
import { interpolateColor } from './color-utils.js';

export interface ChannelState {
  color: RGBColor;
  brightness: number;
  powerOn: boolean;
}

/**
 * Get the interpolated channel state at a given timestamp.
 * Keyframes must all be for the same channel, sorted by timestampMs ascending.
 */
export function getChannelStateAtTime(keyframes: Keyframe[], timeMs: number): ChannelState | null {
  if (keyframes.length === 0) return null;

  const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);

  // Before first keyframe
  if (timeMs < sorted[0].timestampMs) return null;

  // Find surrounding keyframes
  let prevIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].timestampMs <= timeMs) prevIdx = i;
    else break;
  }

  const prev = sorted[prevIdx];
  const next = sorted[prevIdx + 1];

  // At or past last keyframe — hold the last value
  if (!next || timeMs >= next.timestampMs) {
    // If we're exactly at `next`, use next's value
    if (next && timeMs >= next.timestampMs) {
      return keyframeToState(next);
    }
    return keyframeToState(prev);
  }

  // Between prev and next
  if (next.interpolation === 'STEP') {
    return keyframeToState(prev);
  }

  // LINEAR interpolation
  const duration = next.timestampMs - prev.timestampMs;
  const elapsed = timeMs - prev.timestampMs;
  const t = duration > 0 ? elapsed / duration : 0;

  return {
    color: interpolateColor(prev.color, next.color, t),
    brightness: Math.round(prev.brightness + (next.brightness - prev.brightness) * t),
    powerOn: t < 0.5 ? prev.powerOn : next.powerOn,
  };
}

function keyframeToState(kf: Keyframe): ChannelState {
  return {
    color: { ...kf.color },
    brightness: kf.brightness,
    powerOn: kf.powerOn,
  };
}

/**
 * Get keyframes for a specific channel, sorted by timestamp.
 */
export function getKeyframesForChannel(keyframes: Keyframe[], channelId: string): Keyframe[] {
  return keyframes.filter((kf) => kf.channelId === channelId).sort((a, b) => a.timestampMs - b.timestampMs);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/interpolation.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add keyframe interpolation service with tests"
```

---

### Task 5: Safety & Validation Services

**Files:**
- Create: `src/lib/services/safety.ts`
- Create: `src/lib/services/validation.ts`
- Create: `tests/services/safety.test.ts`
- Create: `tests/services/validation.test.ts`

- [ ] **Step 1: Write failing safety tests**

Create `tests/services/safety.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { computeSafetyInfo } from '../../src/lib/services/safety.js';
import type { Keyframe, EffectKeyframe } from '../../src/lib/types/index.js';

describe('computeSafetyInfo', () => {
  it('returns SUBTLE for empty track', () => {
    const info = computeSafetyInfo([], []);
    expect(info.intensityRating).toBe('SUBTLE');
    expect(info.containsFlashing).toBe(false);
    expect(info.containsStrobing).toBe(false);
    expect(info.maxFlashFrequencyHz).toBe(0);
    expect(info.maxBrightnessDelta).toBe(0);
  });

  it('detects flashing from LIGHTNING effect', () => {
    const effects: EffectKeyframe[] = [{
      id: 'e1', channelId: 'a', timestampMs: 0, durationMs: 2000,
      effectType: 'LIGHTNING', intensity: 100,
      primaryColor: { r: 255, g: 255, b: 255 },
      secondaryColor: { r: 0, g: 0, b: 0 },
      effectParams: { params: { flash_count: 3 } },
      requiredCapability: 'CAPABILITY_ANY',
      fallbackColor: { r: 255, g: 255, b: 255 }, fallbackBrightness: 100,
    }];
    const info = computeSafetyInfo([], effects);
    expect(info.containsFlashing).toBe(true);
    expect(info.maxFlashFrequencyHz).toBeGreaterThan(0);
  });

  it('detects strobing from STROBE effect', () => {
    const effects: EffectKeyframe[] = [{
      id: 'e1', channelId: 'a', timestampMs: 0, durationMs: 2000,
      effectType: 'STROBE', intensity: 100,
      primaryColor: { r: 255, g: 255, b: 255 },
      secondaryColor: { r: 0, g: 0, b: 0 },
      effectParams: { params: { flash_count: 10 } },
      requiredCapability: 'CAPABILITY_ANY',
      fallbackColor: { r: 255, g: 255, b: 255 }, fallbackBrightness: 100,
    }];
    const info = computeSafetyInfo([], effects);
    expect(info.containsStrobing).toBe(true);
    expect(info.intensityRating).toBe('EXTREME');
  });

  it('computes max brightness delta from keyframes', () => {
    const kfs: Keyframe[] = [
      { id: 'k1', channelId: 'a', timestampMs: 0, colorMode: 'RGB', color: { r: 0, g: 0, b: 0 }, colorTemperature: 0, brightness: 10, transitionMs: 0, interpolation: 'STEP', powerOn: true },
      { id: 'k2', channelId: 'a', timestampMs: 1000, colorMode: 'RGB', color: { r: 255, g: 255, b: 255 }, colorTemperature: 0, brightness: 90, transitionMs: 0, interpolation: 'STEP', powerOn: true },
    ];
    const info = computeSafetyInfo(kfs, []);
    expect(info.maxBrightnessDelta).toBe(80);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/services/safety.test.ts
```

- [ ] **Step 3: Implement safety service**

Create `src/lib/services/safety.ts`:
```typescript
import type { SafetyInfo, Keyframe, EffectKeyframe, IntensityRating, EffectType } from '$lib/types/index.js';

const FLASHING_EFFECTS: Set<EffectType> = new Set(['LIGHTNING', 'FLASHBANG', 'GUNFIRE', 'STROBE', 'SPARK']);
const STROBING_EFFECTS: Set<EffectType> = new Set(['STROBE']);
const MODERATE_EFFECTS: Set<EffectType> = new Set(['PULSE', 'BREATHING', 'AURORA', 'FLAME', 'CANDLE', 'NEON', 'SIREN']);
const INTENSE_EFFECTS: Set<EffectType> = new Set(['LIGHTNING', 'FLASHBANG', 'EXPLOSION', 'GUNFIRE', 'SPARK']);

export function computeSafetyInfo(keyframes: Keyframe[], effects: EffectKeyframe[]): SafetyInfo {
  const containsFlashing = effects.some((e) => FLASHING_EFFECTS.has(e.effectType));
  const containsStrobing = effects.some((e) => STROBING_EFFECTS.has(e.effectType));

  let maxFlashFrequencyHz = 0;
  for (const e of effects) {
    if (!FLASHING_EFFECTS.has(e.effectType)) continue;
    const flashCount = e.effectParams.params.flash_count ?? 1;
    const durationSec = e.durationMs / 1000;
    if (durationSec > 0) {
      const freq = flashCount / durationSec;
      maxFlashFrequencyHz = Math.max(maxFlashFrequencyHz, freq);
    }
  }

  const maxBrightnessDelta = computeMaxBrightnessDelta(keyframes);
  const intensityRating = computeIntensityRating(effects, containsStrobing);

  const warnings: string[] = [];
  if (containsStrobing) warnings.push('Contains strobing effects');
  if (containsFlashing) warnings.push('Contains flashing effects');

  return {
    containsFlashing,
    containsStrobing,
    maxFlashFrequencyHz,
    maxBrightnessDelta,
    warningText: warnings.join('. '),
    intensityRating,
  };
}

function computeMaxBrightnessDelta(keyframes: Keyframe[]): number {
  const byChannel = new Map<string, Keyframe[]>();
  for (const kf of keyframes) {
    let arr = byChannel.get(kf.channelId);
    if (!arr) { arr = []; byChannel.set(kf.channelId, arr); }
    arr.push(kf);
  }

  let maxDelta = 0;
  for (const channelKfs of byChannel.values()) {
    const sorted = channelKfs.sort((a, b) => a.timestampMs - b.timestampMs);
    for (let i = 1; i < sorted.length; i++) {
      const delta = Math.abs(sorted[i].brightness - sorted[i - 1].brightness);
      maxDelta = Math.max(maxDelta, delta);
    }
  }
  return maxDelta;
}

function computeIntensityRating(effects: EffectKeyframe[], containsStrobing: boolean): IntensityRating {
  if (containsStrobing) return 'EXTREME';
  const intenseCount = effects.filter((e) => INTENSE_EFFECTS.has(e.effectType)).length;
  if (intenseCount >= 5) return 'EXTREME';
  if (intenseCount > 0) return 'INTENSE';
  const hasModerate = effects.some((e) => MODERATE_EFFECTS.has(e.effectType));
  if (hasModerate) return 'MODERATE';
  return 'SUBTLE';
}
```

- [ ] **Step 4: Run safety tests**

```bash
npx vitest run tests/services/safety.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Write failing validation tests**

Create `tests/services/validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateTrack } from '../../src/lib/services/validation.js';
import type { LightFXTrack } from '../../src/lib/types/index.js';

function emptyTrack(): LightFXTrack {
  return {
    version: 1,
    metadata: {
      title: '', description: '', author: '', tags: [], durationMs: 0,
      movieReference: { imdbId: '', title: '', year: 0, runtimeMinutes: 0 },
      startBehavior: 'LEAVE', endBehavior: 'LEAVE',
      preshowDurationMs: 0, preshowState: 'PRESHOW_UNSPECIFIED',
      creditsStartMs: 0, creditsBehavior: 'CREDITS_UNSPECIFIED', trackVersion: '1.0',
    },
    channels: [],
    keyframes: [],
    effectKeyframes: [],
    safetyInfo: {
      containsFlashing: false, containsStrobing: false,
      maxFlashFrequencyHz: 0, maxBrightnessDelta: 0,
      warningText: '', intensityRating: 'SUBTLE',
    },
  };
}

describe('validateTrack', () => {
  it('passes for empty valid track', () => {
    const result = validateTrack(emptyTrack());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for duplicate channel IDs', () => {
    const track = emptyTrack();
    track.channels = [
      { id: 'a', displayName: 'A', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
      { id: 'a', displayName: 'B', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
    ];
    const result = validateTrack(track);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('fails for invalid channel ID format', () => {
    const track = emptyTrack();
    track.channels = [
      { id: 'INVALID ID!', displayName: 'A', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
    ];
    const result = validateTrack(track);
    expect(result.valid).toBe(false);
  });

  it('fails for orphaned keyframe channel reference', () => {
    const track = emptyTrack();
    track.channels = [
      { id: 'a', displayName: 'A', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
    ];
    track.keyframes = [
      { id: 'k1', channelId: 'nonexistent', timestampMs: 0, colorMode: 'RGB', color: { r: 0, g: 0, b: 0 }, colorTemperature: 0, brightness: 0, transitionMs: 0, interpolation: 'STEP', powerOn: false },
    ];
    const result = validateTrack(track);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });
});
```

- [ ] **Step 6: Implement validation service**

Create `src/lib/services/validation.ts`:
```typescript
import type { LightFXTrack } from '$lib/types/index.js';

const CHANNEL_ID_REGEX = /^[a-z0-9_-]{1,64}$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTrack(track: LightFXTrack): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const channelIds = new Set<string>();

  for (const ch of track.channels) {
    if (!CHANNEL_ID_REGEX.test(ch.id)) {
      errors.push(`Channel ID "${ch.id}" is invalid — must match [a-z0-9_-]{1,64}`);
    }
    if (channelIds.has(ch.id)) {
      errors.push(`Channel ID "${ch.id}" is duplicate`);
    }
    channelIds.add(ch.id);
  }

  for (const kf of track.keyframes) {
    if (!channelIds.has(kf.channelId)) {
      errors.push(`Keyframe "${kf.id}" references nonexistent channel "${kf.channelId}"`);
    }
    if (track.metadata.durationMs > 0 && kf.timestampMs > track.metadata.durationMs) {
      warnings.push(`Keyframe "${kf.id}" at ${kf.timestampMs}ms exceeds track duration`);
    }
  }

  for (const ef of track.effectKeyframes) {
    if (!channelIds.has(ef.channelId)) {
      errors.push(`Effect "${ef.id}" references nonexistent channel "${ef.channelId}"`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add safety computation and track validation services with tests"
```

---

### Task 6: Protobuf & Project I/O Services

**Files:**
- Create: `src/lib/services/protobuf.ts`
- Create: `src/lib/services/project-io.ts`
- Create: `src/lib/services/index.ts`
- Create: `tests/services/protobuf.test.ts`
- Create: `tests/services/project-io.test.ts`

- [ ] **Step 1: Write failing protobuf tests**

Create `tests/services/protobuf.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { encodeLightFXTrack, decodeLightFXTrack } from '../../src/lib/services/protobuf.js';
import type { LightFXTrack } from '../../src/lib/types/index.js';

function minimalTrack(): LightFXTrack {
  return {
    version: 1,
    metadata: {
      title: 'Test Track', description: 'A test', author: 'Tester', tags: ['test'],
      durationMs: 120000,
      movieReference: { imdbId: 'tt0000001', title: 'Test Movie', year: 2024, runtimeMinutes: 120 },
      startBehavior: 'LEAVE', endBehavior: 'OFF',
      preshowDurationMs: 0, preshowState: 'PRESHOW_UNSPECIFIED',
      creditsStartMs: 0, creditsBehavior: 'CREDITS_CONTINUE', trackVersion: '1.0',
    },
    channels: [
      { id: 'ambient', displayName: 'Ambient', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_AMBIENT', optional: true },
    ],
    keyframes: [
      { id: 'k1', channelId: 'ambient', timestampMs: 0, colorMode: 'RGB', color: { r: 255, g: 100, b: 50 }, colorTemperature: 0, brightness: 80, transitionMs: 0, interpolation: 'STEP', powerOn: false },
    ],
    effectKeyframes: [],
    safetyInfo: { containsFlashing: false, containsStrobing: false, maxFlashFrequencyHz: 0, maxBrightnessDelta: 0, warningText: '', intensityRating: 'SUBTLE' },
  };
}

describe('protobuf encode/decode', () => {
  it('round-trips a minimal track', async () => {
    const track = minimalTrack();
    const bytes = await encodeLightFXTrack(track);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const decoded = await decodeLightFXTrack(bytes);
    expect(decoded.version).toBe(1);
    expect(decoded.metadata.title).toBe('Test Track');
    expect(decoded.channels).toHaveLength(1);
    expect(decoded.channels[0].id).toBe('ambient');
    expect(decoded.keyframes).toHaveLength(1);
    expect(decoded.keyframes[0].color.r).toBe(255);
    expect(decoded.keyframes[0].brightness).toBe(80);
  });
});
```

- [ ] **Step 2: Implement protobuf service**

Create `src/lib/services/protobuf.ts`:
```typescript
import protobuf from 'protobufjs';
import type { LightFXTrack, RGBColor, Keyframe, EffectKeyframe, Channel, SafetyInfo, TrackMetadata } from '$lib/types/index.js';

let root: protobuf.Root | null = null;

async function getRoot(): Promise<protobuf.Root> {
  if (root) return root;
  const protoText = await fetch('/src/proto/lightfx.proto').then((r) => r.text()).catch(() => {
    // Fallback: try importing as raw
    return import('../../proto/lightfx.proto?raw').then((m) => m.default);
  });
  root = protobuf.parse(protoText).root;
  return root;
}

// Maps for enum conversion between our string types and proto numeric values
const BOUNDARY_MAP: Record<string, number> = { 'BOUNDARY_UNSPECIFIED': 0, 'LEAVE': 1, 'OFF': 2, 'ON': 3 };
const PRESHOW_MAP: Record<string, number> = { 'PRESHOW_UNSPECIFIED': 0, 'PRESHOW_DIM': 1, 'PRESHOW_OFF': 2, 'PRESHOW_WARM': 3 };
const CREDITS_MAP: Record<string, number> = { 'CREDITS_UNSPECIFIED': 0, 'CREDITS_CONTINUE': 1, 'CREDITS_DIM_UP': 2, 'CREDITS_RAISE': 3, 'CREDITS_OFF': 4 };
const INTENSITY_MAP: Record<string, number> = { 'INTENSITY_UNSPECIFIED': 0, 'SUBTLE': 1, 'MODERATE': 2, 'INTENSE': 3, 'EXTREME': 4 };
const COLOR_MODE_MAP: Record<string, number> = { 'COLOR_MODE_UNSPECIFIED': 0, 'RGB': 1, 'COLOR_TEMPERATURE': 2 };
const INTERPOLATION_MAP: Record<string, number> = { 'INTERPOLATION_UNSPECIFIED': 0, 'STEP': 1, 'LINEAR': 2 };
const EFFECT_TYPE_MAP: Record<string, number> = {
  'EFFECT_UNSPECIFIED': 0, 'LIGHTNING': 1, 'FLAME': 2, 'FLASHBANG': 3, 'EXPLOSION': 4,
  'PULSE': 5, 'STROBE': 6, 'SIREN': 7, 'AURORA': 8, 'CANDLE': 9, 'GUNFIRE': 10,
  'NEON': 11, 'BREATHING': 12, 'SPARK': 13,
};

function reverseMap(map: Record<string, number>): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [k, v] of Object.entries(map)) result[v] = k;
  return result;
}
const REV_BOUNDARY = reverseMap(BOUNDARY_MAP);
const REV_PRESHOW = reverseMap(PRESHOW_MAP);
const REV_CREDITS = reverseMap(CREDITS_MAP);
const REV_INTENSITY = reverseMap(INTENSITY_MAP);
const REV_COLOR_MODE = reverseMap(COLOR_MODE_MAP);
const REV_INTERPOLATION = reverseMap(INTERPOLATION_MAP);
const REV_EFFECT_TYPE = reverseMap(EFFECT_TYPE_MAP);

export async function encodeLightFXTrack(track: LightFXTrack): Promise<Uint8Array> {
  const r = await getRoot();
  const LightFXTrackMsg = r.lookupType('openlightfx.LightFXTrack');

  const payload = {
    version: track.version,
    metadata: {
      title: track.metadata.title,
      description: track.metadata.description,
      movieReference: track.metadata.movieReference ? {
        imdbId: track.metadata.movieReference.imdbId,
        title: track.metadata.movieReference.title,
        year: track.metadata.movieReference.year,
        runtimeMinutes: track.metadata.movieReference.runtimeMinutes,
      } : undefined,
      author: track.metadata.author,
      tags: track.metadata.tags,
      durationMs: track.metadata.durationMs,
      startBehavior: BOUNDARY_MAP[track.metadata.startBehavior] ?? 0,
      endBehavior: BOUNDARY_MAP[track.metadata.endBehavior] ?? 0,
      preshowDurationMs: track.metadata.preshowDurationMs,
      preshowState: PRESHOW_MAP[track.metadata.preshowState] ?? 0,
      creditsStartMs: track.metadata.creditsStartMs,
      creditsBehavior: CREDITS_MAP[track.metadata.creditsBehavior] ?? 0,
      trackVersion: track.metadata.trackVersion,
    },
    channels: track.channels.map((ch) => ({
      id: ch.id,
      displayName: ch.displayName,
      description: ch.description,
      defaultColor: ch.defaultColor,
      defaultBrightness: ch.defaultBrightness,
      spatialHint: ch.spatialHint,
      optional: ch.optional,
    })),
    keyframes: track.keyframes.map((kf) => ({
      id: kf.id,
      channelId: kf.channelId,
      timestampMs: kf.timestampMs,
      colorMode: COLOR_MODE_MAP[kf.colorMode] ?? 0,
      color: kf.color,
      colorTemperature: kf.colorTemperature,
      brightness: kf.brightness,
      transitionMs: kf.transitionMs,
      interpolation: INTERPOLATION_MAP[kf.interpolation] ?? 0,
      powerOn: kf.powerOn,
    })),
    effectKeyframes: track.effectKeyframes.map((ef) => ({
      id: ef.id,
      channelId: ef.channelId,
      timestampMs: ef.timestampMs,
      durationMs: ef.durationMs,
      effectType: EFFECT_TYPE_MAP[ef.effectType] ?? 0,
      intensity: ef.intensity,
      primaryColor: ef.primaryColor,
      secondaryColor: ef.secondaryColor,
      effectParams: ef.effectParams.params ? { params: ef.effectParams.params } : undefined,
      requiredCapability: ef.requiredCapability,
      fallbackColor: ef.fallbackColor,
      fallbackBrightness: ef.fallbackBrightness,
    })),
    safetyInfo: {
      containsFlashing: track.safetyInfo.containsFlashing,
      containsStrobing: track.safetyInfo.containsStrobing,
      maxFlashFrequencyHz: track.safetyInfo.maxFlashFrequencyHz,
      maxBrightnessDelta: track.safetyInfo.maxBrightnessDelta,
      warningText: track.safetyInfo.warningText,
      intensityRating: INTENSITY_MAP[track.safetyInfo.intensityRating] ?? 0,
    },
  };

  const msg = LightFXTrackMsg.create(payload);
  return LightFXTrackMsg.encode(msg).finish();
}

export async function decodeLightFXTrack(bytes: Uint8Array): Promise<LightFXTrack> {
  const r = await getRoot();
  const LightFXTrackMsg = r.lookupType('openlightfx.LightFXTrack');
  const msg = LightFXTrackMsg.decode(bytes) as any;

  const meta = msg.metadata || {};
  const movieRef = meta.movieReference || {};

  return {
    version: msg.version || 1,
    metadata: {
      title: meta.title || '',
      description: meta.description || '',
      author: meta.author || '',
      tags: meta.tags || [],
      durationMs: Number(meta.durationMs || 0),
      movieReference: {
        imdbId: movieRef.imdbId || '',
        title: movieRef.title || '',
        year: movieRef.year || 0,
        runtimeMinutes: movieRef.runtimeMinutes || 0,
      },
      startBehavior: (REV_BOUNDARY[meta.startBehavior] ?? 'BOUNDARY_UNSPECIFIED') as any,
      endBehavior: (REV_BOUNDARY[meta.endBehavior] ?? 'BOUNDARY_UNSPECIFIED') as any,
      preshowDurationMs: meta.preshowDurationMs || 0,
      preshowState: (REV_PRESHOW[meta.preshowState] ?? 'PRESHOW_UNSPECIFIED') as any,
      creditsStartMs: Number(meta.creditsStartMs || 0),
      creditsBehavior: (REV_CREDITS[meta.creditsBehavior] ?? 'CREDITS_UNSPECIFIED') as any,
      trackVersion: meta.trackVersion || '',
    },
    channels: (msg.channels || []).map((ch: any) => ({
      id: ch.id || '',
      displayName: ch.displayName || '',
      description: ch.description || '',
      defaultColor: ch.defaultColor || { r: 0, g: 0, b: 0 },
      defaultBrightness: ch.defaultBrightness || 0,
      spatialHint: ch.spatialHint || 'SPATIAL_UNSPECIFIED',
      optional: ch.optional || false,
    })),
    keyframes: (msg.keyframes || []).map((kf: any) => ({
      id: kf.id || '',
      channelId: kf.channelId || '',
      timestampMs: Number(kf.timestampMs || 0),
      colorMode: (REV_COLOR_MODE[kf.colorMode] ?? 'RGB') as any,
      color: kf.color || { r: 0, g: 0, b: 0 },
      colorTemperature: kf.colorTemperature || 0,
      brightness: kf.brightness || 0,
      transitionMs: kf.transitionMs || 0,
      interpolation: (REV_INTERPOLATION[kf.interpolation] ?? 'STEP') as any,
      powerOn: kf.powerOn || false,
    })),
    effectKeyframes: (msg.effectKeyframes || []).map((ef: any) => ({
      id: ef.id || '',
      channelId: ef.channelId || '',
      timestampMs: Number(ef.timestampMs || 0),
      durationMs: Number(ef.durationMs || 0),
      effectType: (REV_EFFECT_TYPE[ef.effectType] ?? 'EFFECT_UNSPECIFIED') as any,
      intensity: ef.intensity || 0,
      primaryColor: ef.primaryColor || { r: 0, g: 0, b: 0 },
      secondaryColor: ef.secondaryColor || { r: 0, g: 0, b: 0 },
      effectParams: { params: ef.effectParams?.params || {} },
      requiredCapability: ef.requiredCapability || 'CAPABILITY_ANY',
      fallbackColor: ef.fallbackColor || { r: 0, g: 0, b: 0 },
      fallbackBrightness: ef.fallbackBrightness || 0,
    })),
    safetyInfo: {
      containsFlashing: msg.safetyInfo?.containsFlashing || false,
      containsStrobing: msg.safetyInfo?.containsStrobing || false,
      maxFlashFrequencyHz: msg.safetyInfo?.maxFlashFrequencyHz || 0,
      maxBrightnessDelta: msg.safetyInfo?.maxBrightnessDelta || 0,
      warningText: msg.safetyInfo?.warningText || '',
      intensityRating: (REV_INTENSITY[msg.safetyInfo?.intensityRating] ?? 'SUBTLE') as any,
    },
  };
}
```

- [ ] **Step 3: Write project-io tests and implementation**

Create `tests/services/project-io.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { newProject, projectToJson, jsonToProject } from '../../src/lib/services/project-io.js';

describe('project-io', () => {
  it('creates a new project with given template channels', () => {
    const channels = [
      { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' as const },
    ];
    const project = newProject(channels);
    expect(project.formatVersion).toBe(1);
    expect(project.projectId).toBeTruthy();
    expect(project.track.channels).toHaveLength(1);
    expect(project.track.channels[0].id).toBe('ambient');
    // Black keyframe auto-inserted at t=0
    expect(project.track.keyframes).toHaveLength(1);
    expect(project.track.keyframes[0].timestampMs).toBe(0);
    expect(project.track.keyframes[0].brightness).toBe(0);
    expect(project.track.keyframes[0].powerOn).toBe(false);
  });

  it('round-trips project via JSON', () => {
    const project = newProject([
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' as const },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' as const },
    ]);
    const json = projectToJson(project);
    expect(typeof json).toBe('string');
    const restored = jsonToProject(json);
    expect(restored.projectId).toBe(project.projectId);
    expect(restored.track.channels).toHaveLength(2);
    expect(restored.track.keyframes).toHaveLength(2); // one per channel
  });
});
```

Create `src/lib/services/project-io.ts`:
```typescript
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

export function projectToJson(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

export function jsonToProject(json: string): ProjectFile {
  return JSON.parse(json) as ProjectFile;
}
```

- [ ] **Step 4: Create services barrel**

Create `src/lib/services/index.ts`:
```typescript
export * from './id.js';
export * from './color-utils.js';
export * from './interpolation.js';
export * from './safety.js';
export * from './validation.js';
export * from './protobuf.js';
export * from './project-io.js';
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: project-io tests PASS, protobuf tests may require proto file loading adjustment — fix import path if needed. All other tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add protobuf encode/decode and project I/O services with tests"
```

---

### Task 7: Undo Store & Command Implementations

**Files:**
- Create: `src/lib/commands/add-keyframe.ts`
- Create: `src/lib/commands/delete-keyframe.ts`
- Create: `src/lib/commands/move-keyframe.ts`
- Create: `src/lib/commands/edit-keyframe.ts`
- Create: `src/lib/commands/add-channel.ts`
- Create: `src/lib/commands/delete-channel.ts`
- Create: `src/lib/commands/edit-channel.ts`
- Create: `src/lib/commands/reorder-channels.ts`
- Create: `src/lib/commands/edit-metadata.ts`
- Create: `src/lib/commands/composite.ts`
- Create: `src/lib/commands/index.ts`
- Create: `src/lib/stores/undo.svelte.ts`
- Create: `tests/commands/keyframe-commands.test.ts`
- Create: `tests/stores/undo.test.ts`

- [ ] **Step 1: Write failing keyframe command tests**

Create `tests/commands/keyframe-commands.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { AddKeyframeCommand } from '../../src/lib/commands/add-keyframe.js';
import { DeleteKeyframeCommand } from '../../src/lib/commands/delete-keyframe.js';
import { MoveKeyframeCommand } from '../../src/lib/commands/move-keyframe.js';
import { EditKeyframeCommand } from '../../src/lib/commands/edit-keyframe.js';
import type { Keyframe } from '../../src/lib/types/index.js';

function makeStore() {
  const keyframes: Keyframe[] = [];
  return {
    getKeyframes: () => keyframes,
    addKeyframe: (kf: Keyframe) => keyframes.push(kf),
    removeKeyframe: (id: string) => {
      const idx = keyframes.findIndex((k) => k.id === id);
      if (idx >= 0) keyframes.splice(idx, 1);
    },
    updateKeyframe: (id: string, patch: Partial<Keyframe>) => {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) Object.assign(kf, patch);
    },
  };
}

const sampleKf: Keyframe = {
  id: 'k1', channelId: 'ambient', timestampMs: 1000,
  colorMode: 'RGB', color: { r: 255, g: 0, b: 0 }, colorTemperature: 0,
  brightness: 80, transitionMs: 0, interpolation: 'STEP', powerOn: true,
};

describe('AddKeyframeCommand', () => {
  it('adds and undoes a keyframe', () => {
    const store = makeStore();
    const cmd = new AddKeyframeCommand(sampleKf, store);
    cmd.execute();
    expect(store.getKeyframes()).toHaveLength(1);
    cmd.undo();
    expect(store.getKeyframes()).toHaveLength(0);
  });
});

describe('DeleteKeyframeCommand', () => {
  it('deletes and restores a keyframe', () => {
    const store = makeStore();
    store.addKeyframe({ ...sampleKf });
    const cmd = new DeleteKeyframeCommand('k1', store);
    cmd.execute();
    expect(store.getKeyframes()).toHaveLength(0);
    cmd.undo();
    expect(store.getKeyframes()).toHaveLength(1);
    expect(store.getKeyframes()[0].id).toBe('k1');
  });
});

describe('MoveKeyframeCommand', () => {
  it('moves and undoes a keyframe timestamp', () => {
    const store = makeStore();
    store.addKeyframe({ ...sampleKf });
    const cmd = new MoveKeyframeCommand('k1', 2000, store);
    cmd.execute();
    expect(store.getKeyframes()[0].timestampMs).toBe(2000);
    cmd.undo();
    expect(store.getKeyframes()[0].timestampMs).toBe(1000);
  });
});

describe('EditKeyframeCommand', () => {
  it('edits and undoes keyframe properties', () => {
    const store = makeStore();
    store.addKeyframe({ ...sampleKf });
    const cmd = new EditKeyframeCommand('k1', { brightness: 50, color: { r: 0, g: 255, b: 0 } }, store);
    cmd.execute();
    expect(store.getKeyframes()[0].brightness).toBe(50);
    expect(store.getKeyframes()[0].color.g).toBe(255);
    cmd.undo();
    expect(store.getKeyframes()[0].brightness).toBe(80);
    expect(store.getKeyframes()[0].color.r).toBe(255);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run tests/commands/keyframe-commands.test.ts
```

- [ ] **Step 3: Implement command classes**

All commands follow the same pattern: constructor captures the mutation target and store reference, `execute()` applies the change, `undo()` reverses it using captured state.

Create `src/lib/commands/add-keyframe.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';

export interface KeyframeStore {
  getKeyframes(): Keyframe[];
  addKeyframe(kf: Keyframe): void;
  removeKeyframe(id: string): void;
  updateKeyframe(id: string, patch: Partial<Keyframe>): void;
}

export class AddKeyframeCommand implements Command {
  readonly type = 'ADD_KEYFRAME';
  readonly description: string;

  constructor(private readonly keyframe: Keyframe, private readonly store: KeyframeStore) {
    this.description = `Add keyframe at ${keyframe.timestampMs}ms on ${keyframe.channelId}`;
  }

  execute(): void { this.store.addKeyframe({ ...this.keyframe }); }
  undo(): void { this.store.removeKeyframe(this.keyframe.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframe: this.keyframe } };
  }
}
```

Create `src/lib/commands/delete-keyframe.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from './add-keyframe.js';

export class DeleteKeyframeCommand implements Command {
  readonly type = 'DELETE_KEYFRAME';
  readonly description: string;
  private savedKeyframe: Keyframe | null = null;

  constructor(private readonly keyframeId: string, private readonly store: KeyframeStore) {
    this.description = `Delete keyframe ${keyframeId}`;
  }

  execute(): void {
    this.savedKeyframe = this.store.getKeyframes().find((k) => k.id === this.keyframeId) ?? null;
    if (this.savedKeyframe) {
      this.savedKeyframe = { ...this.savedKeyframe, color: { ...this.savedKeyframe.color } };
    }
    this.store.removeKeyframe(this.keyframeId);
  }

  undo(): void {
    if (this.savedKeyframe) this.store.addKeyframe({ ...this.savedKeyframe });
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframeId: this.keyframeId, savedKeyframe: this.savedKeyframe } };
  }
}
```

Create `src/lib/commands/move-keyframe.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { KeyframeStore } from './add-keyframe.js';

export class MoveKeyframeCommand implements Command {
  readonly type = 'MOVE_KEYFRAME';
  readonly description: string;
  private previousTimestampMs = 0;

  constructor(
    private readonly keyframeId: string,
    private readonly newTimestampMs: number,
    private readonly store: KeyframeStore,
  ) {
    this.description = `Move keyframe to ${newTimestampMs}ms`;
  }

  execute(): void {
    const kf = this.store.getKeyframes().find((k) => k.id === this.keyframeId);
    if (kf) {
      this.previousTimestampMs = kf.timestampMs;
      this.store.updateKeyframe(this.keyframeId, { timestampMs: this.newTimestampMs });
    }
  }

  undo(): void {
    this.store.updateKeyframe(this.keyframeId, { timestampMs: this.previousTimestampMs });
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframeId: this.keyframeId, newTimestampMs: this.newTimestampMs, previousTimestampMs: this.previousTimestampMs } };
  }
}
```

Create `src/lib/commands/edit-keyframe.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from './add-keyframe.js';

export class EditKeyframeCommand implements Command {
  readonly type = 'EDIT_KEYFRAME';
  readonly description: string;
  private previousValues: Partial<Keyframe> = {};

  constructor(
    private readonly keyframeId: string,
    private readonly patch: Partial<Keyframe>,
    private readonly store: KeyframeStore,
  ) {
    this.description = `Edit keyframe ${keyframeId}`;
  }

  execute(): void {
    const kf = this.store.getKeyframes().find((k) => k.id === this.keyframeId);
    if (!kf) return;
    // Capture previous values for keys we're changing
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof Keyframe)[]) {
      const val = kf[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null ? { ...val } : val;
    }
    this.store.updateKeyframe(this.keyframeId, this.patch);
  }

  undo(): void {
    this.store.updateKeyframe(this.keyframeId, this.previousValues);
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframeId: this.keyframeId, patch: this.patch, previousValues: this.previousValues } };
  }
}
```

Create `src/lib/commands/add-channel.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Channel, Keyframe } from '$lib/types/track.js';
import { generateId } from '$lib/services/id.js';

export interface ChannelStore {
  getChannels(): Channel[];
  getKeyframes(): Keyframe[];
  addChannel(ch: Channel): void;
  removeChannel(id: string): void;
  addKeyframe(kf: Keyframe): void;
  removeKeyframe(id: string): void;
}

export class AddChannelCommand implements Command {
  readonly type = 'ADD_CHANNEL';
  readonly description: string;
  private readonly initialKeyframeId: string;

  constructor(private readonly channel: Channel, private readonly store: ChannelStore) {
    this.description = `Add channel "${channel.displayName}"`;
    this.initialKeyframeId = generateId();
  }

  execute(): void {
    this.store.addChannel({ ...this.channel });
    // Auto-insert black keyframe at t=0
    this.store.addKeyframe({
      id: this.initialKeyframeId,
      channelId: this.channel.id,
      timestampMs: 0,
      colorMode: 'RGB',
      color: { r: 0, g: 0, b: 0 },
      colorTemperature: 0,
      brightness: 0,
      transitionMs: 0,
      interpolation: 'STEP',
      powerOn: false,
    });
  }

  undo(): void {
    this.store.removeKeyframe(this.initialKeyframeId);
    this.store.removeChannel(this.channel.id);
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { channel: this.channel } };
  }
}
```

Create `src/lib/commands/delete-channel.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Channel, Keyframe } from '$lib/types/track.js';
import type { ChannelStore } from './add-channel.js';

export class DeleteChannelCommand implements Command {
  readonly type = 'DELETE_CHANNEL';
  readonly description: string;
  private savedChannel: Channel | null = null;
  private savedKeyframes: Keyframe[] = [];

  constructor(private readonly channelId: string, private readonly store: ChannelStore) {
    this.description = `Delete channel "${channelId}"`;
  }

  execute(): void {
    this.savedChannel = this.store.getChannels().find((c) => c.id === this.channelId) ?? null;
    if (this.savedChannel) this.savedChannel = { ...this.savedChannel, defaultColor: { ...this.savedChannel.defaultColor } };
    this.savedKeyframes = this.store.getKeyframes()
      .filter((kf) => kf.channelId === this.channelId)
      .map((kf) => ({ ...kf, color: { ...kf.color } }));
    for (const kf of this.savedKeyframes) this.store.removeKeyframe(kf.id);
    this.store.removeChannel(this.channelId);
  }

  undo(): void {
    if (this.savedChannel) this.store.addChannel({ ...this.savedChannel });
    for (const kf of this.savedKeyframes) this.store.addKeyframe({ ...kf });
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { channelId: this.channelId } };
  }
}
```

Create `src/lib/commands/edit-channel.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Channel } from '$lib/types/track.js';

export interface ChannelEditStore {
  getChannels(): Channel[];
  updateChannel(id: string, patch: Partial<Channel>): void;
}

export class EditChannelCommand implements Command {
  readonly type = 'EDIT_CHANNEL';
  readonly description: string;
  private previousValues: Partial<Channel> = {};

  constructor(
    private readonly channelId: string,
    private readonly patch: Partial<Channel>,
    private readonly store: ChannelEditStore,
  ) {
    this.description = `Edit channel "${channelId}"`;
  }

  execute(): void {
    const ch = this.store.getChannels().find((c) => c.id === this.channelId);
    if (!ch) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof Channel)[]) {
      const val = ch[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null ? { ...val } : val;
    }
    this.store.updateChannel(this.channelId, this.patch);
  }

  undo(): void {
    this.store.updateChannel(this.channelId, this.previousValues);
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { channelId: this.channelId, patch: this.patch } };
  }
}
```

Create `src/lib/commands/reorder-channels.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';

export interface ChannelOrderStore {
  getChannelOrder(): string[];
  setChannelOrder(ids: string[]): void;
}

export class ReorderChannelsCommand implements Command {
  readonly type = 'REORDER_CHANNELS';
  readonly description = 'Reorder channels';
  private previousOrder: string[] = [];

  constructor(private readonly newOrder: string[], private readonly store: ChannelOrderStore) {}

  execute(): void {
    this.previousOrder = [...this.store.getChannelOrder()];
    this.store.setChannelOrder(this.newOrder);
  }

  undo(): void {
    this.store.setChannelOrder(this.previousOrder);
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { newOrder: this.newOrder, previousOrder: this.previousOrder } };
  }
}
```

Create `src/lib/commands/edit-metadata.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { TrackMetadata } from '$lib/types/track.js';

export interface MetadataStore {
  getMetadata(): TrackMetadata;
  updateMetadata(patch: Partial<TrackMetadata>): void;
}

export class EditMetadataCommand implements Command {
  readonly type = 'EDIT_METADATA';
  readonly description = 'Edit track metadata';
  private previousValues: Partial<TrackMetadata> = {};

  constructor(private readonly patch: Partial<TrackMetadata>, private readonly store: MetadataStore) {}

  execute(): void {
    const meta = this.store.getMetadata();
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof TrackMetadata)[]) {
      const val = meta[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null
        ? Array.isArray(val) ? [...val] : { ...val }
        : val;
    }
    this.store.updateMetadata(this.patch);
  }

  undo(): void {
    this.store.updateMetadata(this.previousValues);
  }

  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { patch: this.patch } };
  }
}
```

Create `src/lib/commands/composite.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';

export class CompositeCommand implements Command {
  readonly type = 'COMPOSITE';
  readonly description: string;
  readonly commands: Command[];

  constructor(description: string, commands: Command[]) {
    this.description = description;
    this.commands = commands;
  }

  execute(): void {
    for (const cmd of this.commands) cmd.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo();
  }

  serialize(): SerializedCommandData {
    return {
      type: this.type,
      description: this.description,
      payload: { commands: this.commands.map((c) => c.serialize()) },
    };
  }
}
```

Create `src/lib/commands/index.ts`:
```typescript
export { AddKeyframeCommand, type KeyframeStore } from './add-keyframe.js';
export { DeleteKeyframeCommand } from './delete-keyframe.js';
export { MoveKeyframeCommand } from './move-keyframe.js';
export { EditKeyframeCommand } from './edit-keyframe.js';
export { AddChannelCommand, type ChannelStore } from './add-channel.js';
export { DeleteChannelCommand } from './delete-channel.js';
export { EditChannelCommand, type ChannelEditStore } from './edit-channel.js';
export { ReorderChannelsCommand, type ChannelOrderStore } from './reorder-channels.js';
export { EditMetadataCommand, type MetadataStore } from './edit-metadata.js';
export { CompositeCommand } from './composite.js';
```

- [ ] **Step 4: Run command tests**

```bash
npx vitest run tests/commands/keyframe-commands.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Write failing undo store tests**

Create `tests/stores/undo.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { Command, SerializedCommandData } from '../../src/lib/types/commands.js';

// Inline mock command for testing the undo logic
class MockCommand implements Command {
  readonly type = 'MOCK';
  readonly description: string;
  executed = false;
  undone = false;
  constructor(desc: string) { this.description = desc; }
  execute() { this.executed = true; this.undone = false; }
  undo() { this.undone = true; this.executed = false; }
  serialize(): SerializedCommandData { return { type: 'MOCK', description: this.description, payload: {} }; }
}

// Test the logic directly — store tests need Svelte runes which require component context.
// We test the command pattern here; the store wiring is tested via integration.
describe('Command pattern', () => {
  it('execute sets state, undo reverses it', () => {
    const cmd = new MockCommand('test');
    cmd.execute();
    expect(cmd.executed).toBe(true);
    cmd.undo();
    expect(cmd.undone).toBe(true);
    expect(cmd.executed).toBe(false);
  });
});
```

- [ ] **Step 6: Create undo store**

Create `src/lib/stores/undo.svelte.ts`:
```typescript
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import { MAX_UNDO_STACK_SIZE } from '$lib/types/commands.js';

class UndoStore {
  undoStack = $state<Command[]>([]);
  redoStack = $state<Command[]>([]);

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_UNDO_STACK_SIZE) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  serialize(): SerializedCommandData[] {
    return this.undoStack.map((cmd) => cmd.serialize());
  }
}

export const undoStore = new UndoStore();
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add undo store and command implementations with tests"
```

---

### Task 8: Project, Video, UI, Toast, Clipboard Stores

**Files:**
- Create: `src/lib/stores/project.svelte.ts`
- Create: `src/lib/stores/video.svelte.ts`
- Create: `src/lib/stores/ui.svelte.ts`
- Create: `src/lib/stores/toast.svelte.ts`
- Create: `src/lib/stores/clipboard.svelte.ts`
- Create: `src/lib/stores/timeline.svelte.ts`
- Create: `src/lib/stores/snapshot.svelte.ts`
- Create: `src/lib/stores/index.ts`

- [ ] **Step 1: Create project store**

Create `src/lib/stores/project.svelte.ts`:
```typescript
import type { ProjectFile, ProjectState, CandidateMovieMetadata } from '$lib/types/project.js';
import type { Channel, Keyframe, TrackMetadata } from '$lib/types/track.js';
import type { ChannelGroup } from '$lib/types/channels.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import type { KeyframeStore } from '$lib/commands/add-keyframe.js';
import type { ChannelStore } from '$lib/commands/add-channel.js';
import type { ChannelEditStore } from '$lib/commands/edit-channel.js';
import type { ChannelOrderStore } from '$lib/commands/reorder-channels.js';
import type { MetadataStore } from '$lib/commands/edit-metadata.js';

class ProjectStore implements KeyframeStore, ChannelStore, ChannelEditStore, ChannelOrderStore, MetadataStore {
  file = $state<ProjectFile>(null!);
  isDirty = $state(false);
  displayName = $state('Untitled Project');
  videoFile = $state<File | null>(null);
  videoObjectUrl = $state<string | null>(null);

  load(file: ProjectFile): void {
    this.file = file;
    this.isDirty = false;
    this.displayName = file.track.metadata.title || 'Untitled Project';
  }

  markDirty(): void { this.isDirty = true; }
  markClean(): void { this.isDirty = false; }

  // KeyframeStore interface
  getKeyframes(): Keyframe[] { return this.file.track.keyframes; }
  addKeyframe(kf: Keyframe): void {
    this.file.track.keyframes.push(kf);
    this.markDirty();
  }
  removeKeyframe(id: string): void {
    this.file.track.keyframes = this.file.track.keyframes.filter((k) => k.id !== id);
    this.markDirty();
  }
  updateKeyframe(id: string, patch: Partial<Keyframe>): void {
    const kf = this.file.track.keyframes.find((k) => k.id === id);
    if (kf) Object.assign(kf, patch);
    this.markDirty();
  }

  // ChannelStore interface
  getChannels(): Channel[] { return this.file.track.channels; }
  addChannel(ch: Channel): void {
    this.file.track.channels.push(ch);
    this.markDirty();
  }
  removeChannel(id: string): void {
    this.file.track.channels = this.file.track.channels.filter((c) => c.id !== id);
    this.markDirty();
  }

  // ChannelEditStore interface
  updateChannel(id: string, patch: Partial<Channel>): void {
    const ch = this.file.track.channels.find((c) => c.id === id);
    if (ch) Object.assign(ch, patch);
    this.markDirty();
  }

  // ChannelOrderStore interface
  getChannelOrder(): string[] { return this.file.track.channels.map((c) => c.id); }
  setChannelOrder(ids: string[]): void {
    const map = new Map(this.file.track.channels.map((c) => [c.id, c]));
    this.file.track.channels = ids.map((id) => map.get(id)!).filter(Boolean);
    this.markDirty();
  }

  // MetadataStore interface
  getMetadata(): TrackMetadata { return this.file.track.metadata; }
  updateMetadata(patch: Partial<TrackMetadata>): void {
    Object.assign(this.file.track.metadata, patch);
    this.displayName = this.file.track.metadata.title || 'Untitled Project';
    this.markDirty();
  }

  setVideoFile(file: File): void {
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    this.videoFile = file;
    this.videoObjectUrl = URL.createObjectURL(file);
    this.file.videoFilePath = file.name;
    this.markDirty();
  }
}

export const projectStore = new ProjectStore();
```

- [ ] **Step 2: Create video store**

Create `src/lib/stores/video.svelte.ts`:
```typescript
import type { VideoState, PlaybackSpeed, VideoProbeResult } from '$lib/types/video.js';
import { DEFAULT_FRAME_RATE, DEFAULT_PLAYBACK_SPEED } from '$lib/types/video.js';

class VideoStore {
  isLoaded = $state(false);
  isLoading = $state(false);
  isPlaying = $state(false);
  currentTimeMs = $state(0);
  durationMs = $state(0);
  playbackSpeed = $state<PlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  videoWidth = $state(0);
  videoHeight = $state(0);
  frameRate = $state(DEFAULT_FRAME_RATE);
  frameDurationMs = $derived(1000 / this.frameRate);
  objectUrl = $state<string | null>(null);
  file = $state<File | null>(null);
  isHdr = $state(false);
  colorSpace = $state<string | null>(null);

  private videoElement: HTMLVideoElement | null = null;
  private rafId: number | null = null;

  bindElement(el: HTMLVideoElement): void {
    this.videoElement = el;
    el.addEventListener('loadedmetadata', () => {
      this.durationMs = el.duration * 1000;
      this.videoWidth = el.videoWidth;
      this.videoHeight = el.videoHeight;
      this.isLoaded = true;
      this.isLoading = false;
    });
    el.addEventListener('ended', () => { this.isPlaying = false; });
  }

  loadFile(file: File, objectUrl: string): void {
    this.isLoading = true;
    this.file = file;
    this.objectUrl = objectUrl;
    if (this.videoElement) {
      this.videoElement.src = objectUrl;
    }
  }

  applyProbeResult(result: VideoProbeResult): void {
    this.isHdr = result.isHdr;
    this.colorSpace = result.colorSpace;
    if (result.frameRate > 0) this.frameRate = result.frameRate;
    if (result.durationMs > 0 && this.durationMs === 0) this.durationMs = result.durationMs;
  }

  play(): void {
    if (!this.videoElement || !this.isLoaded) return;
    this.videoElement.playbackRate = this.playbackSpeed;
    this.videoElement.play();
    this.isPlaying = true;
    this.startTimeSync();
  }

  pause(): void {
    this.videoElement?.pause();
    this.isPlaying = false;
    this.stopTimeSync();
    this.syncTime();
  }

  togglePlayback(): void {
    if (this.isPlaying) this.pause(); else this.play();
  }

  seek(timeMs: number): void {
    if (!this.videoElement) return;
    this.videoElement.currentTime = timeMs / 1000;
    this.currentTimeMs = timeMs;
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.playbackSpeed = speed;
    if (this.videoElement) this.videoElement.playbackRate = speed;
  }

  stepForward(): void { this.seek(this.currentTimeMs + this.frameDurationMs); }
  stepBackward(): void { this.seek(Math.max(0, this.currentTimeMs - this.frameDurationMs)); }

  private startTimeSync(): void {
    const sync = () => {
      this.syncTime();
      this.rafId = requestAnimationFrame(sync);
    };
    this.rafId = requestAnimationFrame(sync);
  }

  private stopTimeSync(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private syncTime(): void {
    if (this.videoElement) {
      this.currentTimeMs = this.videoElement.currentTime * 1000;
    }
  }

  destroy(): void {
    this.stopTimeSync();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}

export const videoStore = new VideoStore();
```

- [ ] **Step 3: Create UI, toast, clipboard stores**

Create `src/lib/stores/ui.svelte.ts`:
```typescript
import type { UIState, ModalType } from '$lib/types/ui.js';
import { LS_KEY_DARK_MODE, LS_KEY_MIN_KEYFRAME_INTERVAL } from '$lib/types/ui.js';
import { DEFAULT_KEYFRAME_INTERVAL_MS } from '$lib/types/track.js';

class UIStore {
  darkMode = $state(true);
  overlayEnabled = $state(true);
  snappingEnabled = $state(true);
  onboardingComplete = $state(false);
  activeModal = $state<ModalType | null>(null);
  eyedropperActive = $state(false);
  minKeyframeIntervalMs = $state(DEFAULT_KEYFRAME_INTERVAL_MS);

  init(): void {
    if (typeof localStorage === 'undefined') return;
    const dm = localStorage.getItem(LS_KEY_DARK_MODE);
    if (dm !== null) this.darkMode = dm === 'true';
    const mki = localStorage.getItem(LS_KEY_MIN_KEYFRAME_INTERVAL);
    if (mki) this.minKeyframeIntervalMs = parseInt(mki, 10);
  }

  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem(LS_KEY_DARK_MODE, String(this.darkMode));
  }

  toggleOverlay(): void { this.overlayEnabled = !this.overlayEnabled; }
  toggleSnapping(): void { this.snappingEnabled = !this.snappingEnabled; }
  openModal(modal: ModalType): void { this.activeModal = modal; }
  closeModal(): void { this.activeModal = null; }
  toggleEyedropper(): void { this.eyedropperActive = !this.eyedropperActive; }
}

export const uiStore = new UIStore();
```

Create `src/lib/stores/toast.svelte.ts`:
```typescript
import type { Toast, ToastType } from '$lib/types/ui.js';
import { DEFAULT_TOAST_DURATION_MS, ERROR_TOAST_DURATION_MS } from '$lib/types/ui.js';
import { generateId } from '$lib/services/id.js';

class ToastStore {
  toasts = $state<Toast[]>([]);

  private add(message: string, type: ToastType, durationMs?: number): void {
    const duration = durationMs ?? (type === 'error' ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);
    const toast: Toast = { id: generateId(), message, type, durationMs: duration };
    this.toasts.push(toast);
    setTimeout(() => this.dismiss(toast.id), duration);
  }

  info(message: string): void { this.add(message, 'info'); }
  success(message: string): void { this.add(message, 'success'); }
  warning(message: string): void { this.add(message, 'warning'); }
  error(message: string): void { this.add(message, 'error'); }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toastStore = new ToastStore();
```

Create `src/lib/stores/clipboard.svelte.ts`:
```typescript
import type { ClipboardBuffer } from '$lib/types/ui.js';
import type { Keyframe } from '$lib/types/track.js';

class ClipboardStore {
  buffer = $state<ClipboardBuffer | null>(null);

  get hasContent(): boolean { return this.buffer !== null; }

  copyKeyframes(keyframes: Keyframe[], sourceChannelId: string): void {
    if (keyframes.length === 0) return;
    const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);
    const baseTimestampMs = sorted[0].timestampMs;
    this.buffer = {
      type: 'keyframes',
      sourceChannelId,
      data: sorted.map((kf) => ({ ...kf, color: { ...kf.color } })),
      baseTimestampMs,
    };
  }

  clear(): void { this.buffer = null; }
}

export const clipboardStore = new ClipboardStore();
```

- [ ] **Step 4: Create timeline store**

Create `src/lib/stores/timeline.svelte.ts`:
```typescript
import type { TimelineViewport, TimelineSelection } from '$lib/types/timeline.js';
import {
  DEFAULT_PX_PER_MS, MIN_PX_PER_MS, MAX_PX_PER_MS,
  MINIMAP_DEFAULT_HEIGHT, MINIMAP_MIN_HEIGHT, MINIMAP_MAX_HEIGHT,
} from '$lib/types/timeline.js';

class TimelineStore {
  // Viewport
  pxPerMs = $state(DEFAULT_PX_PER_MS);
  scrollX = $state(0);
  scrollY = $state(0);
  viewportWidth = $state(0);
  viewportHeight = $state(0);
  minimapHeight = $state(MINIMAP_DEFAULT_HEIGHT);

  // Selection
  selectedKeyframeIds = $state<string[]>([]);
  selectedEffectIds = $state<string[]>([]);
  selectedMarkerIds = $state<string[]>([]);
  activeChannelId = $state<string | null>(null);
  selectionRect = $state<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Channel state
  soloChannelIds = $state<Set<string>>(new Set());
  mutedChannelIds = $state<Set<string>>(new Set());

  get visibleStartMs(): number { return this.scrollX; }
  get visibleEndMs(): number { return this.scrollX + this.viewportWidth / this.pxPerMs; }

  setViewportSize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  zoom(factor: number, centerMs?: number): void {
    const center = centerMs ?? (this.scrollX + this.viewportWidth / this.pxPerMs / 2);
    const newPxPerMs = Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, this.pxPerMs * factor));
    const newScrollX = center - this.viewportWidth / newPxPerMs / 2;
    this.pxPerMs = newPxPerMs;
    this.scrollX = Math.max(0, newScrollX);
  }

  zoomToFit(durationMs: number): void {
    if (durationMs <= 0 || this.viewportWidth <= 0) return;
    this.pxPerMs = Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, this.viewportWidth / durationMs));
    this.scrollX = 0;
  }

  scrollTo(ms: number): void { this.scrollX = Math.max(0, ms); }
  scrollBy(deltaMs: number): void { this.scrollX = Math.max(0, this.scrollX + deltaMs); }

  selectKeyframe(id: string, additive = false): void {
    if (additive) {
      if (this.selectedKeyframeIds.includes(id)) {
        this.selectedKeyframeIds = this.selectedKeyframeIds.filter((k) => k !== id);
      } else {
        this.selectedKeyframeIds = [...this.selectedKeyframeIds, id];
      }
    } else {
      this.selectedKeyframeIds = [id];
    }
  }

  clearSelection(): void {
    this.selectedKeyframeIds = [];
    this.selectedEffectIds = [];
    this.selectedMarkerIds = [];
    this.selectionRect = null;
  }

  toggleSolo(channelId: string): void {
    const next = new Set(this.soloChannelIds);
    if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
    this.soloChannelIds = next;
  }

  toggleMute(channelId: string): void {
    const next = new Set(this.mutedChannelIds);
    if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
    this.mutedChannelIds = next;
  }

  isChannelAudible(channelId: string): boolean {
    if (this.mutedChannelIds.has(channelId)) return false;
    if (this.soloChannelIds.size > 0 && !this.soloChannelIds.has(channelId)) return false;
    return true;
  }

  resizeMinimap(height: number): void {
    this.minimapHeight = Math.max(MINIMAP_MIN_HEIGHT, Math.min(MINIMAP_MAX_HEIGHT, height));
  }
}

export const timelineStore = new TimelineStore();
```

- [ ] **Step 5: Create snapshot store**

Create `src/lib/stores/snapshot.svelte.ts`:
```typescript
import type { ProjectFile } from '$lib/types/project.js';
import { LS_KEY_SNAPSHOT_PREFIX, AUTO_SAVE_INTERVAL_MS } from '$lib/types/ui.js';
import { projectToJson, jsonToProject } from '$lib/services/project-io.js';

class SnapshotStore {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  isRestored = $state(false);

  startAutoSave(getProject: () => ProjectFile): void {
    this.stopAutoSave();
    this.intervalId = setInterval(() => {
      this.save(getProject());
    }, AUTO_SAVE_INTERVAL_MS);
  }

  stopAutoSave(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  save(project: ProjectFile): void {
    try {
      const key = LS_KEY_SNAPSHOT_PREFIX + project.projectId;
      localStorage.setItem(key, projectToJson(project));
    } catch { /* localStorage full — silently ignore */ }
  }

  restore(projectId: string): ProjectFile | null {
    const key = LS_KEY_SNAPSHOT_PREFIX + projectId;
    const data = localStorage.getItem(key);
    if (!data) return null;
    try {
      const project = jsonToProject(data);
      this.isRestored = true;
      return project;
    } catch {
      return null;
    }
  }

  clear(projectId: string): void {
    localStorage.removeItem(LS_KEY_SNAPSHOT_PREFIX + projectId);
  }

  destroy(): void { this.stopAutoSave(); }
}

export const snapshotStore = new SnapshotStore();
```

- [ ] **Step 6: Create stores barrel**

Create `src/lib/stores/index.ts`:
```typescript
export { projectStore } from './project.svelte.js';
export { videoStore } from './video.svelte.js';
export { timelineStore } from './timeline.svelte.js';
export { uiStore } from './ui.svelte.js';
export { undoStore } from './undo.svelte.js';
export { clipboardStore } from './clipboard.svelte.js';
export { toastStore } from './toast.svelte.js';
export { snapshotStore } from './snapshot.svelte.js';
```

- [ ] **Step 7: Verify compilation**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
```

Expected: no errors (or only non-blocking warnings about unused stores).

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add all Svelte 5 rune-based stores (project, video, timeline, ui, toast, clipboard, snapshot)"
```

---

### Task 9: Save Providers

**Files:**
- Create: `src/lib/save/local-filesystem.ts`
- Create: `src/lib/save/download.ts`
- Create: `src/lib/save/index.ts`

- [ ] **Step 1: Implement LocalFileSystemProvider**

Create `src/lib/save/local-filesystem.ts`:
```typescript
import type { SaveProvider, SaveProviderType } from '$lib/types/save.js';
import type { ProjectFile } from '$lib/types/project.js';
import { projectToJson, jsonToProject } from '$lib/services/project-io.js';

export class LocalFileSystemProvider implements SaveProvider {
  readonly type: SaveProviderType = 'local-filesystem';
  readonly displayName = 'Local file';
  readonly canAutoSave = true;
  private fileHandle: FileSystemFileHandle | null = null;

  hasFile(): boolean { return this.fileHandle !== null; }

  async save(project: ProjectFile): Promise<void> {
    if (!this.fileHandle) return this.saveAs(project);
    const writable = await this.fileHandle.createWritable();
    await writable.write(projectToJson(project));
    await writable.close();
  }

  async saveAs(project: ProjectFile): Promise<void> {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `${project.track.metadata.title || 'untitled'}.lightfx-project`,
      types: [{
        description: 'OpenLightFX Project',
        accept: { 'application/json': ['.lightfx-project'] },
      }],
    });
    this.fileHandle = handle;
    await this.save(project);
  }

  async load(): Promise<ProjectFile> {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{
        description: 'OpenLightFX Project',
        accept: { 'application/json': ['.lightfx-project'] },
      }],
    });
    this.fileHandle = handle;
    const file = await handle.getFile();
    const text = await file.text();
    return jsonToProject(text);
  }
}
```

- [ ] **Step 2: Implement DownloadProvider**

Create `src/lib/save/download.ts`:
```typescript
import type { SaveProvider, SaveProviderType } from '$lib/types/save.js';
import type { ProjectFile } from '$lib/types/project.js';
import { projectToJson, jsonToProject } from '$lib/services/project-io.js';

export class DownloadProvider implements SaveProvider {
  readonly type: SaveProviderType = 'download';
  readonly displayName = 'Download';
  readonly canAutoSave = false;

  hasFile(): boolean { return false; }

  async save(project: ProjectFile): Promise<void> {
    return this.saveAs(project);
  }

  async saveAs(project: ProjectFile): Promise<void> {
    const json = projectToJson(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.track.metadata.title || 'untitled'}.lightfx-project`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async load(): Promise<ProjectFile> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lightfx-project';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { reject(new Error('No file selected')); return; }
        const text = await file.text();
        resolve(jsonToProject(text));
      };
      input.click();
    });
  }
}
```

- [ ] **Step 3: Create save provider factory**

Create `src/lib/save/index.ts`:
```typescript
import type { SaveProvider } from '$lib/types/save.js';
import { LocalFileSystemProvider } from './local-filesystem.js';
import { DownloadProvider } from './download.js';

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export function createSaveProvider(): SaveProvider {
  if (supportsFileSystemAccess()) return new LocalFileSystemProvider();
  return new DownloadProvider();
}

export { LocalFileSystemProvider } from './local-filesystem.js';
export { DownloadProvider } from './download.js';
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add save providers (local filesystem + download fallback)"
```

---

### Task 10: Shared UI Components

**Files:**
- Create: `src/lib/components/shared/Modal.svelte`
- Create: `src/lib/components/shared/Popover.svelte`
- Create: `src/lib/components/shared/Button.svelte`
- Create: `src/lib/components/shared/IconButton.svelte`
- Create: `src/lib/components/shared/Slider.svelte`
- Create: `src/lib/components/shared/Select.svelte`
- Create: `src/lib/components/shared/TextInput.svelte`
- Create: `src/lib/components/shared/Toggle.svelte`
- Create: `src/lib/components/shared/Toast.svelte`
- Create: `src/lib/components/shared/ContextMenu.svelte`

These are presentational primitives. Each is a self-contained Svelte 5 component using `$props()` and snippets. Implementation details:

- **Modal**: Backdrop overlay + centered panel, `onclose` callback, Escape to dismiss, focus trap, animation (fade-in + slide-up).
- **Popover**: Anchored to a trigger element via `anchorRect` prop. Uses `position: fixed` with smart edge-clamping to stay on screen. Dismisses on click-outside or Escape. On tablet (detected via viewport width or pointer type), renders as a bottom sheet instead.
- **Button**: `variant` prop ('primary' | 'secondary' | 'ghost' | 'danger'), `size` ('sm' | 'md'), disabled state, min-height 44px for touch.
- **IconButton**: Circular button with SVG icon slot, tooltip on hover, 44px diameter.
- **Slider**: Horizontal range input with label, value display, min/max/step, 44px touch track height.
- **Select**: Custom dropdown with native `<select>` fallback for mobile. Options as `{ value, label }[]`.
- **TextInput**: Styled text input with label, placeholder, validation error display.
- **Toggle**: Boolean toggle switch, 44px hit area.
- **Toast**: Positioned bottom-right, shows toast messages with type-based color (info/success/warning/error), auto-dismiss, manual close.
- **ContextMenu**: Positioned at click point, renders items with icons/shortcuts/submenus, dismisses on click-outside.

- [ ] **Step 1: Create Modal component**

Create `src/lib/components/shared/Modal.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onclick={handleBackdrop}>
  <div class="bg-surface rounded-xl shadow-2xl border border-surface3 w-full max-w-lg mx-4 p-6 animate-slide-up" role="dialog" aria-modal="true" aria-label={title}>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-text-base">{title}</h2>
      <button class="text-textMuted hover:text-text-base p-1 rounded-lg hover:bg-surface2 transition-colors" onclick={onclose} aria-label="Close">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
    {@render children()}
  </div>
</div>
```

- [ ] **Step 2: Create Popover component**

Create `src/lib/components/shared/Popover.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';

  let {
    anchorRect, onclose, children,
  }: {
    anchorRect: { x: number; y: number; width: number; height: number };
    onclose: () => void;
    children: Snippet;
  } = $props();

  let popoverEl: HTMLDivElement;
  let style = $state('');
  let isBottomSheet = $state(false);

  onMount(() => {
    // Check if tablet/mobile via pointer type or viewport
    isBottomSheet = window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches;
    if (!isBottomSheet) positionPopover();

    function handleClick(e: MouseEvent) {
      if (popoverEl && !popoverEl.contains(e.target as Node)) onclose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onclose();
    }
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  });

  function positionPopover() {
    if (!popoverEl) return;
    const rect = popoverEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = anchorRect.y + anchorRect.height + 8;
    let left = anchorRect.x;
    if (top + rect.height > vh) top = anchorRect.y - rect.height - 8;
    if (left + rect.width > vw) left = vw - rect.width - 8;
    left = Math.max(8, left);
    style = `top: ${top}px; left: ${left}px;`;
  }
</script>

{#if isBottomSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 bg-black/40" onclick={onclose}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div bind:this={popoverEl} class="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl border-t border-surface3 p-4 max-h-[70vh] overflow-y-auto animate-slide-up" onclick|stopPropagation>
      <div class="w-10 h-1 bg-surface3 rounded-full mx-auto mb-3"></div>
      {@render children()}
    </div>
  </div>
{:else}
  <div bind:this={popoverEl} class="fixed z-50 bg-surface rounded-xl shadow-2xl border border-surface3 p-4 min-w-[280px] animate-fade-in" {style}>
    {@render children()}
  </div>
{/if}
```

- [ ] **Step 3: Create remaining shared components**

Create `src/lib/components/shared/Button.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    variant = 'secondary', size = 'md', disabled = false, onclick, children,
  }: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed';
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-sm min-h-[36px]' : 'px-4 py-2 text-sm min-h-[44px]';
  const variantClasses = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-surface2 text-text-base hover:bg-surface3',
    ghost: 'text-textMuted hover:text-text-base hover:bg-surface2',
    danger: 'bg-danger/10 text-danger hover:bg-danger/20',
  }[variant];
</script>

<button class="{baseClasses} {sizeClasses} {variantClasses}" {disabled} {onclick}>
  {@render children()}
</button>
```

Create `src/lib/components/shared/IconButton.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    label, disabled = false, active = false, onclick, children,
  }: {
    label: string; disabled?: boolean; active?: boolean; onclick?: (e: MouseEvent) => void; children: Snippet;
  } = $props();
</script>

<button
  class="w-11 h-11 flex items-center justify-center rounded-lg transition-colors text-textMuted hover:text-text-base hover:bg-surface2 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
  class:bg-surface2={active}
  class:text-accent={active}
  {disabled} {onclick} aria-label={label} title={label}
>
  {@render children()}
</button>
```

Create `src/lib/components/shared/Slider.svelte`:
```svelte
<script lang="ts">
  let {
    label, value = $bindable(), min = 0, max = 100, step = 1, unit = '',
  }: {
    label: string; value: number; min?: number; max?: number; step?: number; unit?: string;
  } = $props();
</script>

<div class="flex items-center gap-3">
  <label class="text-xs text-textMuted w-16 shrink-0">{label}</label>
  <input type="range" class="flex-1 h-2 rounded-full appearance-none bg-surface3 accent-accent [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:appearance-none" bind:value {min} {max} {step} />
  <span class="text-xs text-textMuted w-12 text-right tabular-nums">{value}{unit}</span>
</div>
```

Create `src/lib/components/shared/Select.svelte`:
```svelte
<script lang="ts">
  let {
    label, value = $bindable(), options,
  }: {
    label: string; value: string; options: { value: string; label: string }[];
  } = $props();
</script>

<div class="flex items-center gap-3">
  <label class="text-xs text-textMuted w-16 shrink-0">{label}</label>
  <select class="flex-1 bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]" bind:value>
    {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
</div>
```

Create `src/lib/components/shared/TextInput.svelte`:
```svelte
<script lang="ts">
  let {
    label, value = $bindable(), placeholder = '', error = '',
  }: {
    label: string; value: string; placeholder?: string; error?: string;
  } = $props();
</script>

<div class="flex flex-col gap-1">
  <label class="text-xs text-textMuted">{label}</label>
  <input type="text" class="bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]" class:border-danger={error} bind:value {placeholder} />
  {#if error}<span class="text-xs text-danger">{error}</span>{/if}
</div>
```

Create `src/lib/components/shared/Toggle.svelte`:
```svelte
<script lang="ts">
  let { label, checked = $bindable() }: { label: string; checked: boolean } = $props();
</script>

<label class="flex items-center gap-3 cursor-pointer min-h-[44px]">
  <span class="text-xs text-textMuted">{label}</span>
  <button role="switch" aria-checked={checked} class="relative w-10 h-6 rounded-full transition-colors" class:bg-accent={checked} class:bg-surface3={!checked} onclick={() => checked = !checked}>
    <span class="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform" class:translate-x-5={checked} class:translate-x-1={!checked}></span>
  </button>
</label>
```

Create `src/lib/components/shared/Toast.svelte`:
```svelte
<script lang="ts">
  import { toastStore } from '$lib/stores/index.js';

  const typeColors: Record<string, string> = {
    info: 'border-accent2', success: 'border-success', warning: 'border-warning', error: 'border-danger',
  };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  {#each toastStore.toasts as toast (toast.id)}
    <div class="pointer-events-auto bg-surface rounded-lg shadow-xl border-l-4 {typeColors[toast.type]} px-4 py-3 text-sm text-text-base animate-slide-up max-w-sm">
      <div class="flex items-center justify-between gap-3">
        <span>{toast.message}</span>
        <button class="text-textMuted hover:text-text-base shrink-0" onclick={() => toastStore.dismiss(toast.id)} aria-label="Dismiss">&times;</button>
      </div>
    </div>
  {/each}
</div>
```

Create `src/lib/components/shared/ContextMenu.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ContextMenuItem } from '$lib/types/ui.js';

  let { x, y, items, onclose }: { x: number; y: number; items: ContextMenuItem[]; onclose: () => void } = $props();

  let menuEl: HTMLDivElement;

  onMount(() => {
    function handleClick(e: MouseEvent) {
      if (menuEl && !menuEl.contains(e.target as Node)) onclose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onclose();
    }
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  });
</script>

<div bind:this={menuEl} class="fixed z-50 bg-surface rounded-xl shadow-2xl border border-surface3 py-1 min-w-[200px] animate-fade-in" style="top: {y}px; left: {x}px;">
  {#each items as item}
    {#if item.separator}
      <div class="h-px bg-surface3 my-1"></div>
    {:else}
      <button
        class="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-surface2 transition-colors min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!item.enabled}
        onclick={() => { item.action?.(); onclose(); }}
      >
        <span class:text-textMuted={!item.enabled}>{item.label}</span>
        {#if item.shortcut}<span class="text-xs text-textMuted ml-4">{item.shortcut}</span>{/if}
      </button>
    {/if}
  {/each}
</div>
```

- [ ] **Step 4: Verify compilation**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add shared UI components (Modal, Popover, Button, Slider, Select, etc.)"
```

---

### Task 11–31: Remaining Component Tasks

From this point forward, each task follows the same pattern: create component files, verify compilation, commit. The remaining tasks build the full application UI on top of the foundation established in Tasks 1–10.

Detailed implementation for each follows. Due to plan size, these tasks provide complete component structures with key logic. The implementing agent should reference the design spec for full behavioral details.

---

### Task 11: Application Shell (TopBar + StatusBar + Layout)

**Files:**
- Create: `src/lib/components/app/TopBar.svelte`
- Create: `src/lib/components/app/StatusBar.svelte`
- Create: `src/lib/components/app/AppShell.svelte`

- [ ] **Step 1: Create TopBar**

`TopBar.svelte` contains: logo (from `/logo.svg`), project title (editable inline, click to rename), save status indicator, toolbar buttons (New, Open, Save, Export), and the Cmd+K command palette trigger button.

Key props: `projectName: string`, `isDirty: boolean`, `saveProviderName: string`.
Events: `onnewproject`, `onopen`, `onsave`, `onexport`, `oncommandpalette`.

- [ ] **Step 2: Create StatusBar**

`StatusBar.svelte` shows: HDR badge (if `videoStore.isHdr`), zoom percentage, save provider type, `isDirty` indicator. A thin bar at the bottom of the viewport.

- [ ] **Step 3: Create AppShell**

`AppShell.svelte` is the root layout container. Uses CSS Grid:
```
grid-template-rows: auto 1fr auto auto auto auto;
```
Rows: TopBar, VideoPanel (resizable), PlaybackControls, Timeline (resizable), Minimap, StatusBar.

Resizable boundary between video and timeline: drag handle with Pointer Events, stores sizes as percentages in `projectStore.file.uiState`.

- [ ] **Step 4: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add application shell (TopBar, StatusBar, AppShell layout)"
```

---

### Task 12: Video Panel + Playback Controls

**Files:**
- Create: `src/lib/components/video/VideoPanel.svelte`
- Create: `src/lib/components/video/PlaybackControls.svelte`

- [ ] **Step 1: Create VideoPanel**

Contains `<video>` element bound to `videoStore`. Maintains aspect ratio via `aspect-ratio` CSS. Centered in its grid row. Renders `LightingOverlay` (Task 27) and `Eyedropper` overlay (Task 21) as children when active.

On mount, calls `videoStore.bindElement(videoEl)`. Accepts file drops (drag-and-drop video file onto panel).

- [ ] **Step 2: Create PlaybackControls**

Unified playback control bar below video, above timeline. Contains:
- Play/Pause button (Space shortcut shown)
- Frame step backward/forward buttons
- Current timestamp display (`mm:ss.ms`)
- Scrub bar (range input spanning full duration)
- Speed selector dropdown (0.25x, 0.5x, 1x, 2x, 4x)
- Chapter nav buttons (previous/next), disabled if no chapters

Scrub bar bidirectionally synced: dragging updates `videoStore.seek()`, playback updates the bar position. Uses `pointerdown`/`pointermove`/`pointerup` with pointer capture for smooth scrubbing.

- [ ] **Step 3: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add video panel and playback controls"
```

---

### Task 13: ffmpeg.wasm Worker + HDR Detection + Frame Extraction

**Files:**
- Create: `src/lib/workers/ffmpeg.worker.ts`
- Create: `src/lib/services/frame-extractor.ts`

- [ ] **Step 1: Create ffmpeg Web Worker**

The worker loads ffmpeg.wasm lazily on first message. Handles two message types:

1. **`probe`**: Receives video `File`, writes to ffmpeg filesystem, runs `ffprobe`-equivalent command to extract stream metadata. Returns `VideoProbeResult` with `isHdr`, `colorSpace`, `colorTransfer`, `colorPrimaries`, `frameRate`, `durationMs`, `codec`, `width`, `height`, `chapters`.

   HDR detection: `color_transfer` contains `smpte2084` (PQ) or `arib-std-b67` (HLG), and `color_primaries` contains `bt2020`.

2. **`extractFrame`**: Receives video `File` + `timestampMs` + `isHdr` flag. Seeks to timestamp, extracts single frame as PNG. If HDR, applies zscale filter chain:
   ```
   -vf "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709:t=bt709:m=bt709,tonemap=hable:desat=0,zscale=t=bt709,format=yuv420p"
   ```
   Returns `Uint8Array` (PNG bytes).

For large files: write only a portion using `File.slice()` around the seek target, or write the entire file if under a size threshold (e.g., 500MB). For files over 500MB, use ffmpeg's ability to seek on partial data.

- [ ] **Step 2: Create frame-extractor service (main thread controller)**

Create `src/lib/services/frame-extractor.ts`:
```typescript
import type { VideoProbeResult } from '$lib/types/video.js';

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('$lib/workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        if (error) p.reject(new Error(error));
        else p.resolve(result);
      }
    };
  }
  return worker;
}

function send<T>(type: string, payload: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, ...payload });
  });
}

export async function probeVideo(file: File): Promise<VideoProbeResult> {
  return send<VideoProbeResult>('probe', { file });
}

export async function extractToneMappedFrame(file: File, timestampMs: number, isHdr: boolean): Promise<Blob> {
  const pngBytes = await send<Uint8Array>('extractFrame', { file, timestampMs, isHdr });
  return new Blob([pngBytes], { type: 'image/png' });
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add ffmpeg.wasm worker for HDR detection and tone-mapped frame extraction"
```

---

### Task 14: Timeline Canvas Rendering

**Files:**
- Create: `src/lib/components/timeline/TimelineCanvas.svelte`
- Create: `src/lib/components/timeline/render.ts`

- [ ] **Step 1: Create timeline render functions**

Create `src/lib/components/timeline/render.ts` — pure functions that draw onto a canvas context. Each function receives state and CanvasRenderingContext2D. This keeps rendering logic testable and separate from the Svelte component.

Functions:
- `drawBackground(ctx, viewport, channels, laneHeight)` — alternating lane stripes, time grid
- `drawSceneMarkers(ctx, markers, viewport, laneHeight, channelCount)` — labeled vertical lines
- `drawKeyframes(ctx, keyframes, channels, viewport, laneHeight, selectedIds)` — colored markers
- `drawPlayhead(ctx, timeMs, viewport, totalHeight)` — red/accent vertical line
- `drawSelectionRect(ctx, rect)` — rubber-band rectangle

The `TimelineCanvas.svelte` component:
- Gets a `<canvas>` element, scales for `devicePixelRatio`
- Calls render functions whenever state changes (uses `$effect` to watch stores)
- Playhead updates at 60fps during playback via RAF (separate effect)
- Handles resize via `ResizeObserver`

- [ ] **Step 2: Implement render.ts with key functions**

```typescript
import type { Keyframe, Channel, RGBColor } from '$lib/types/index.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import { CHANNEL_LANE_HEIGHT, RULER_HEIGHT, KEYFRAME_MARKER_RADIUS } from '$lib/types/timeline.js';
import { rgbToCssString } from '$lib/services/color-utils.js';

export interface RenderViewport {
  pxPerMs: number;
  scrollX: number;
  width: number;
  height: number;
}

export function msToPx(ms: number, vp: RenderViewport): number {
  return (ms - vp.scrollX) * vp.pxPerMs;
}

export function pxToMs(px: number, vp: RenderViewport): number {
  return px / vp.pxPerMs + vp.scrollX;
}

export function drawBackground(ctx: CanvasRenderingContext2D, vp: RenderViewport, channelCount: number): void {
  ctx.clearRect(0, 0, vp.width, vp.height);

  // Lane stripes
  for (let i = 0; i < channelCount; i++) {
    const y = RULER_HEIGHT + i * CHANNEL_LANE_HEIGHT;
    ctx.fillStyle = i % 2 === 0 ? '#1a1a2e' : '#1f1f35';
    ctx.fillRect(0, y, vp.width, CHANNEL_LANE_HEIGHT);
  }

  // Time grid
  const startMs = vp.scrollX;
  const endMs = vp.scrollX + vp.width / vp.pxPerMs;
  const interval = getGridInterval(vp.pxPerMs);
  const firstTick = Math.floor(startMs / interval) * interval;

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
  ctx.lineWidth = 1;
  ctx.font = '11px Inter, system-ui';
  ctx.fillStyle = '#94a3b8';

  for (let ms = firstTick; ms <= endMs; ms += interval) {
    const x = msToPx(ms, vp);
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT);
    ctx.lineTo(x, vp.height);
    ctx.stroke();
    // Ruler label
    ctx.fillText(formatTime(ms), x + 4, RULER_HEIGHT - 6);
  }
}

export function drawKeyframes(
  ctx: CanvasRenderingContext2D, keyframes: Keyframe[], channels: Channel[],
  vp: RenderViewport, selectedIds: Set<string>,
): void {
  const channelIndex = new Map(channels.map((c, i) => [c.id, i]));

  for (const kf of keyframes) {
    const x = msToPx(kf.timestampMs, vp);
    if (x < -KEYFRAME_MARKER_RADIUS || x > vp.width + KEYFRAME_MARKER_RADIUS) continue;
    const lane = channelIndex.get(kf.channelId);
    if (lane === undefined) continue;
    const y = RULER_HEIGHT + lane * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;

    const isSelected = selectedIds.has(kf.id);
    ctx.beginPath();
    ctx.arc(x, y, KEYFRAME_MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = rgbToCssString(kf.color);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, KEYFRAME_MARKER_RADIUS + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

export function drawPlayhead(ctx: CanvasRenderingContext2D, timeMs: number, vp: RenderViewport, height: number): void {
  const x = msToPx(timeMs, vp);
  if (x < 0 || x > vp.width) return;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  // Playhead handle
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x, 10);
  ctx.closePath();
  ctx.fill();
}

export function drawSceneMarkers(
  ctx: CanvasRenderingContext2D, markers: SceneMarker[], vp: RenderViewport, height: number,
): void {
  for (const marker of markers) {
    const x = msToPx(marker.timestampMs, vp);
    if (x < 0 || x > vp.width) continue;
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#00d9ff';
    ctx.font = '10px Inter';
    ctx.fillText(marker.label, x + 4, RULER_HEIGHT + 12);
  }
}

function getGridInterval(pxPerMs: number): number {
  const candidates = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000];
  for (const ms of candidates) {
    if (ms * pxPerMs >= 80) return ms;
  }
  return 600000;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 3: Create TimelineCanvas.svelte**

The component owns a `<canvas>`, observes stores via `$effect`, and calls render functions. Playhead animation runs its own RAF loop during playback.

- [ ] **Step 4: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add timeline canvas rendering with keyframes, playhead, grid, and scene markers"
```

---

### Task 15: Channel Headers + Minimap

**Files:**
- Create: `src/lib/components/timeline/ChannelHeaders.svelte`
- Create: `src/lib/components/timeline/Minimap.svelte`
- Create: `src/lib/components/timeline/TimelinePanel.svelte`

- [ ] **Step 1: Create ChannelHeaders**

Left column of the timeline. For each channel: display name (double-click to edit inline), color dot (click to open ChannelPopover), Solo (S) and Mute (M) toggle icons, drag handle for reordering. Min-height per row: `CHANNEL_LANE_HEIGHT` (44px).

- [ ] **Step 2: Create Minimap**

Canvas-based minimap, min 48px height. Renders compressed view of all keyframes as thin colored lines. Shows viewport highlight rectangle. Click to seek, drag to scroll. Drag top edge to resize (48–80px range).

- [ ] **Step 3: Create TimelinePanel**

Composes ChannelHeaders (left) + TimelineCanvas (right) + Minimap (bottom). Synchronizes vertical scroll between headers and canvas. Passes Pointer Events to the interaction handler (Task 16).

- [ ] **Step 4: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add channel headers, minimap, and timeline panel composition"
```

---

### Task 16: Timeline Interaction Handler

**Files:**
- Create: `src/lib/components/timeline/interaction.ts`

- [ ] **Step 1: Create interaction handler**

Pure functions that translate Pointer Events into store mutations / command executions. The TimelineCanvas passes pointer events to these functions.

Key functions:
- `hitTest(x, y, viewport, channels, keyframes)` → `TimelineHitResult`
- `handlePointerDown(e, hitResult, store, undoStore, timelineStore)` — select keyframe, start drag, start selection rect, set active channel
- `handlePointerMove(e, dragState, store, undoStore)` — move keyframe (preview), extend selection rect, scroll viewport
- `handlePointerUp(e, dragState, store, undoStore)` — commit move as MoveKeyframeCommand, finalize selection rect
- `handleDoubleClick(e, hitResult, channelId, timeMs)` — add keyframe at position
- `handleContextMenu(e, hitResult)` — build context menu items based on what was clicked
- `handleWheel(e, timelineStore)` — Ctrl+wheel = zoom, Shift+wheel = horizontal scroll, plain wheel = vertical scroll
- `handlePinch(e, timelineStore)` — pinch-to-zoom (calculated from pointermove with two tracked pointers)

Multi-select: Shift+click selects range (between last selected and clicked), Ctrl/Cmd+click toggles individual selection.

Playhead auto-follow: during playback, if playhead x-position exceeds 75% of viewport width, `timelineStore.scrollTo()` advances smoothly.

- [ ] **Step 2: Write tests for hitTest and key functions**

Create `tests/components/timeline-interaction.test.ts` — test hitTest with known keyframe positions and viewport state. Test that handleDoubleClick produces an AddKeyframeCommand.

- [ ] **Step 3: Verify and commit**

```bash
npx vitest run && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add timeline pointer event interaction handler with hit testing"
```

---

### Task 17: Color Picker Components

**Files:**
- Create: `src/lib/components/color/ColorPicker.svelte`
- Create: `src/lib/components/color/ColorWheel.svelte`
- Create: `src/lib/components/color/RGBSliders.svelte`
- Create: `src/lib/components/color/KelvinSlider.svelte`
- Create: `src/lib/components/color/HexInput.svelte`
- Create: `src/lib/components/color/ColorHistory.svelte`

- [ ] **Step 1: Implement color components**

- **ColorPicker**: Root component. Props: `color: RGBColor`, `colorMode: ColorMode`, `colorTemperature: number`, `onchange`. Contains mode toggle (RGB | Kelvin). When RGB: shows ColorWheel + RGBSliders + HexInput + eyedropper button. When Kelvin: shows KelvinSlider. Always shows ColorHistory at bottom.
- **ColorWheel**: Canvas-based HSL wheel. Pointer drag to select hue+saturation, separate lightness slider. 200x200px canvas.
- **RGBSliders**: Three sliders (R 0-255, G 0-255, B 0-255) using the shared Slider component.
- **KelvinSlider**: Single slider (1000K–10000K, step 100K) with a gradient background showing warm-to-cool colors. Displays computed RGB swatch.
- **HexInput**: Text input for hex color code (#RRGGBB). Validates on blur, auto-corrects 3-digit shorthand.
- **ColorHistory**: Grid of 16 color swatches. Loaded from/saved to `localStorage`. Click to apply.

- [ ] **Step 2: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add color picker components (wheel, RGB sliders, Kelvin slider, hex input, history)"
```

---

### Task 18: Properties Popovers

**Files:**
- Create: `src/lib/components/properties/KeyframePopover.svelte`
- Create: `src/lib/components/properties/ChannelPopover.svelte`

- [ ] **Step 1: Create KeyframePopover**

Anchored to selected keyframe's canvas position. Uses the shared `Popover` component. Contains:
- Color swatch + hex (tap to expand ColorPicker)
- Mode toggle (RGB | Kelvin)
- Kelvin slider (when in Kelvin mode)
- Brightness slider (0-100%)
- Transition duration slider (0-2000ms)
- Interpolation select (Step | Linear)
- Power toggle
- Color history row (last 16)
- Eyedropper button

Multi-select: when multiple keyframes selected, shows shared properties. Mixed values shown as "—". Changes dispatched as `CompositeCommand` containing `EditKeyframeCommand` for each selected keyframe.

All changes go through `undoStore.execute(new EditKeyframeCommand(...))`.

- [ ] **Step 2: Create ChannelPopover**

Anchored to channel header. Contains:
- Channel ID (read-only after creation, or editable with validation)
- Display name (text input)
- Spatial hint (dropdown)
- Default color (swatch)
- Optional toggle
- Duplicate / Delete buttons

Changes go through `undoStore.execute(new EditChannelCommand(...))`.
Delete goes through `undoStore.execute(new DeleteChannelCommand(...))` with confirmation.

- [ ] **Step 3: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add keyframe and channel properties popovers"
```

---

### Task 19: Channel Management (Templates + New Project)

**Files:**
- Create: `src/lib/components/channels/ChannelTemplateSelector.svelte`
- Create: `src/lib/components/channels/AddChannelDialog.svelte`
- Create: `src/lib/components/channels/NewProjectDialog.svelte`

- [ ] **Step 1: Create ChannelTemplateSelector**

Grid of template cards showing template name, description, and channel count. Selecting a template is the primary path. "Configure manually" link at the bottom opens AddChannelDialog.

- [ ] **Step 2: Create NewProjectDialog**

Modal flow: Step 1 = pick template (using ChannelTemplateSelector), Step 2 = confirm. Creates project via `newProject(template.channels)` and loads it into `projectStore`.

- [ ] **Step 3: Create AddChannelDialog**

Advanced option: text inputs for channel ID (validated), display name, spatial hint dropdown. Adds via `undoStore.execute(new AddChannelCommand(...))`.

- [ ] **Step 4: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add channel management (templates, new project, add channel)"
```

---

### Task 20: Eyedropper

**Files:**
- Create: `src/lib/components/video/Eyedropper.svelte`

- [ ] **Step 1: Implement Eyedropper**

When `uiStore.eyedropperActive`:
1. Pause video
2. Call `extractToneMappedFrame(file, currentTimeMs, isHdr)` from frame-extractor service
3. Render returned PNG as an `<img>` inside a `<canvas>` overlay positioned exactly over the video element
4. Show magnified preview (circular lens, ~100px diameter, 4x zoom) following the cursor/finger
5. Display RGB hex value next to the lens
6. On click/tap: sample pixel via `getImageData()`, dispatch color to selected keyframe (via `EditKeyframeCommand`), add to color history, deactivate eyedropper
7. On Escape: cancel and deactivate

The overlay canvas must match the video element's rendered dimensions (not the video's native resolution).

- [ ] **Step 2: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add HDR-aware eyedropper with tone-mapped frame overlay"
```

---

### Task 21: Command Palette

**Files:**
- Create: `src/lib/components/app/CommandPalette.svelte`

- [ ] **Step 1: Implement CommandPalette**

Triggered by Cmd/Ctrl+K or tapping the search icon in TopBar. Full-width overlay at top of screen. Contains:
- Text input for searching (auto-focused)
- List of matching actions, each showing: label, keyboard shortcut (if any), category
- Navigate with arrow keys, select with Enter, dismiss with Escape
- Fuzzy search over all registered actions

Actions registered from a central list that includes all keyboard shortcuts plus modal openers, channel operations, etc.

- [ ] **Step 2: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add command palette (Cmd+K)"
```

---

### Task 22: Keyboard Shortcuts

**Files:**
- Create: `src/lib/services/keyboard-shortcuts.ts`
- Create: `src/lib/components/dialogs/KeyboardShortcutsDialog.svelte`

- [ ] **Step 1: Create keyboard shortcut manager**

Centralized shortcut registration and handling. A single `keydown` listener on `window` that matches events against registered shortcuts. Supports modifier keys (Ctrl/Cmd, Shift, Alt). Prevents conflicts with text inputs (ignores when focus is in an `<input>` or `<textarea>` unless the shortcut explicitly allows it).

Register all shortcuts from the design spec (see Section 12 of the design doc).

- [ ] **Step 2: Create KeyboardShortcutsDialog**

Modal showing all shortcuts grouped by category. Accessible via `?` shortcut or command palette.

- [ ] **Step 3: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add keyboard shortcut manager and help dialog"
```

---

### Task 23: Export/Import

**Files:**
- Create: `src/lib/components/dialogs/ExportDialog.svelte`
- Create: `src/lib/components/dialogs/AboutDialog.svelte`

- [ ] **Step 1: Create ExportDialog**

Modal for exporting `.lightfx` protobuf files. Flow:
1. Auto-compute safety info from current track state
2. Run validation (`validateTrack`)
3. Display validation results (errors block export, warnings shown but don't block)
4. Duration mismatch warning if track duration differs from video by >5s
5. Export button calls `encodeLightFXTrack()` and triggers download

Also handles "Export for Marketplace" variant: validates all metadata fields are present, shows modal prompting completion if missing. Button disabled with "Coming soon" label.

- [ ] **Step 2: Create AboutDialog**

Simple modal with project name, version, links.

- [ ] **Step 3: Wire import/export into TopBar and file actions**

Import: "Open" action in TopBar loads either `.lightfx` (decode with protobuf service, create project wrapper) or `.lightfx-project` (full project restore).

- [ ] **Step 4: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add export/import dialogs and file operations"
```

---

### Task 24: Track Metadata & Movie Metadata Modals

**Files:**
- Create: `src/lib/components/properties/TrackMetadataModal.svelte`
- Create: `src/lib/components/properties/MovieMetadataModal.svelte`

- [ ] **Step 1: Create TrackMetadataModal**

Accessible via command palette or clicking project title. Fields: title, description, author, tags (comma-separated), duration display, start/end behavior dropdowns, preshow settings, credits settings, track version. Changes via `EditMetadataCommand`.

Safety info section: read-only badges showing `intensityRating`, `containsFlashing`, `containsStrobing`, `maxFlashFrequencyHz`, `maxBrightnessDelta`.

- [ ] **Step 2: Create MovieMetadataModal**

Fields: IMDB ID (text input), TMDB ID (text input), title, year, description. Inline instructions: "Find movie on themoviedb.org, copy numeric ID from URL." Pre-fills from `candidateMetadata` if available. Changes via `EditMetadataCommand`.

- [ ] **Step 3: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add track metadata and movie metadata modals"
```

---

### Task 25: Lighting Overlay

**Files:**
- Create: `src/lib/components/video/LightingOverlay.svelte`

- [ ] **Step 1: Implement LightingOverlay**

Canvas overlay on the video panel, same dimensions. Renders glow regions based on channel spatial hints and current interpolated state.

For each channel:
1. Get interpolated state at `videoStore.currentTimeMs` via `getChannelStateAtTime()`
2. Skip if channel is muted or not audible (solo logic)
3. Map `spatialHint` to glow position (per design spec Section 9)
4. Draw radial gradient with the channel's color and brightness as alpha

Updates every frame during playback (RAF loop), and on scrub. Toggleable via `uiStore.overlayEnabled`.

Uses `globalCompositeOperation = 'screen'` for additive blending of multiple glow regions.

- [ ] **Step 2: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add real-time lighting visualization overlay"
```

---

### Task 26: Snapshot Worker

**Files:**
- Create: `src/lib/workers/snapshot.worker.ts`

- [ ] **Step 1: Implement snapshot Web Worker**

Receives project state, serializes to JSON string, posts back. Used by `snapshotStore` when payload exceeds a threshold (e.g., 500KB) to avoid main-thread jank.

```typescript
self.onmessage = (e: MessageEvent) => {
  const { project } = e.data;
  const json = JSON.stringify(project);
  self.postMessage({ json });
};
```

- [ ] **Step 2: Wire into snapshotStore**

Update `snapshotStore.save()` to use the worker for large payloads, falling back to inline `JSON.stringify` for small ones.

- [ ] **Step 3: Verify and commit**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
git add -A && git commit -m "feat: add off-thread snapshot serialization worker"
```

---

### Task 27: Page Integration

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Wire everything together in +page.svelte**

The root page component:
1. Initializes stores on mount (`uiStore.init()`, attempt snapshot restore)
2. Creates save provider (`createSaveProvider()`)
3. If no snapshot: opens NewProjectDialog
4. If snapshot restored: loads project, prompts for video re-selection if needed
5. Renders `AppShell` with all child components
6. Sets up keyboard shortcut registrations
7. Starts snapshot auto-save
8. Handles `beforeunload` for unsaved changes warning
9. Renders `Toast` component for notifications
10. Renders `CommandPalette` when triggered
11. Renders active modal (switch on `uiStore.activeModal`)
12. Handles video file selection (File input or drag-drop) → loads into stores → triggers ffmpeg probe

The page is the composition root. All store interactions flow through commands via `undoStore.execute()`.

- [ ] **Step 2: Verify full app loads**

```bash
npm run dev
```

Open `http://localhost:5173` — should show the app shell with new project dialog.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Final type check**

```bash
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: wire up page integration — Layer 1 complete"
```
