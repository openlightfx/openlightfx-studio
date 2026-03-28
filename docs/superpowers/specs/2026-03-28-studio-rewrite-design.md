# OpenLightFX Studio — Rewrite Design Spec

**Date:** 2026-03-28
**Branch:** feat/refactor
**Scope:** Full rewrite with layered MVP approach

---

## 1. Overview

OpenLightFX Studio is a SvelteKit web application for authoring `.lightfx` tracks — lighting sequences synchronized to movie video. Users load local video files, author lighting keyframes on a multi-channel timeline, and export to `.lightfx` protobuf format. The app runs entirely in the browser using the File API; no server upload needed.

This spec covers a ground-up rewrite on the `feat/refactor` branch, replacing the previous implementation which suffered from HDR color sampling bugs and a dated UX.

## 2. Key Design Decisions

### 2.1 HDR Strategy

WebCodecs does not expose raw BT.2020 PQ frame data in any browser (HDR/WCG support is not yet included in the WebCodecs spec). Canvas sampling from the `<video>` element returns the browser's display-dependent tone-mapped output, which is unreliable.

**Solution: ffmpeg.wasm for all frame extraction and HDR handling.**

- **HDR detection happens immediately on video file selection.** ffmpeg.wasm probes stream metadata (`color_space`, `color_transfer`, `color_primaries`) and stores an `isHDR` flag plus colorspace info on the video state.
- **Eyedropper activation** extracts a single frame at the current timestamp via ffmpeg.wasm. For HDR content, the `zscale` filter chain applies BT.2020→BT.709 conversion with Hable tone mapping. For SDR content, the frame is extracted as-is.
- **The tone-mapped frame is rendered to an overlay canvas** positioned over the video. The user samples from this overlay, ensuring what they see is what they pick.
- **Future auto-channel generation** uses the same `extractToneMappedFrame(timestamp)` pipeline to programmatically determine colors (e.g., center-excluded frame border averaging for ambient channels).
- **ffmpeg.wasm is lazy-loaded** on first need (video file selection), cached in a Web Worker for fast subsequent extractions (~200-500ms per frame).

### 2.2 UX Direction

Modern web-native UX — not desktop application from 1999. Inspired by Figma/Linear design language.

- **No permanent sidebar.** Properties, channel config, metadata surface as anchored popovers triggered by interacting with the relevant element.
- **Command palette** (Cmd+K / tap search icon) as the primary discovery mechanism.
- **Contextual mini-toolbars** appear near selections (color swatch, delete, duplicate, interpolation toggle).
- **Touch-first considerations:** 44px minimum touch targets, Pointer Events API throughout, pinch-to-zoom and two-finger pan on timeline. On tablet, popovers become bottom sheets.
- **Dark theme default** with light mode toggle. Modern palette (deep navy/slate, not pure black), accent colors, subtle backdrop blur on popovers.

### 2.3 Save Architecture

Native-feeling save via File System Access API, with future cloud saves.

```
SaveProvider (interface)
├── save(project): Promise<void>
├── load(): Promise<ProjectFile>
├── canAutoSave: boolean
└── displayName: string

LocalFileSystemProvider    # File System Access API (Chromium) — native save UX
DownloadProvider           # Fallback download/upload (Firefox, Safari)
CloudProvider              # Future: marketplace API + auth (all browsers)
```

- **First save / Save As:** `showDirectoryPicker()` lets the user select a project folder. `FileSystemFileHandle` stored in memory.
- **Subsequent saves (Cmd+S):** writes directly to the same file handle via `createWritable()`. No download dialog.
- **Firefox/Safari fallback:** download-triggered saves.
- **Cloud provider:** interface defined, implementation stubs with "coming soon." Designed to slot in when marketplace auth lands without touching save/load call sites.

### 2.4 Tablet Support

The floating contextual panel approach (Approach A) was chosen specifically for tablet flexibility.

- Popovers anchor near the interaction point — where the user's finger already is.
- On tablet breakpoints, video stacks above timeline (single column); channel headers collapse to icons; popovers become bottom sheets.
- Command palette becomes a search-driven action bar (tap search icon).
- Timeline supports pinch-to-zoom and two-finger pan natively.

---

## 3. Application Layout

```
┌─────────────────────────────────────────────────┐
│  Top Bar (logo, project title, actions, Cmd+K)  │
├─────────────────────────────────────────────────┤
│                                                 │
│              Video Preview                      │
│              (aspect-ratio constrained,          │
│               centered, resizable)              │
│                                                 │
├─────────────────────────────────────────────────┤
│  Playback Bar (play/pause, time, speed, scrub)  │
├────────────┬────────────────────────────────────┤
│  Channel   │  Timeline Canvas                   │
│  Headers   │  (keyframes, effects, playhead,    │
│            │   scene markers)                   │
│            │                                    │
│            │  Minimap (≥48px height, up to 80px) │
├────────────┴────────────────────────────────────┤
│  Status Bar (HDR badge, zoom %, save state)     │
└─────────────────────────────────────────────────┘

  Popovers: anchor to interaction point — no reserved space.
```

- Video preview uses the full width.
- All panels are resizable (video height, timeline height).
- Responsive: single-column stack on tablet.

---

## 4. State Architecture

### 4.1 State Layers

```
ProjectStore (persisted)
├── track: LightFXTrack          # channels, keyframes, effects, metadata
├── channelGroups: ChannelGroup[] # studio-only linking/groups
├── sceneMarkers: SceneMarker[]   # timeline markers
└── videoFilePath: string         # reference to user's file

UIStore (ephemeral, not saved to project file)
├── timeline: { pxPerMs, scrollX, scrollY, viewportSize }
├── selection: { keyframeIds, effectIds, markerIds, activeChannelId }
├── modal: ModalType | null
├── overlay: { visible, enabled }
├── darkMode: boolean
└── propertiesContext: derived from selection

VideoStore (ephemeral)
├── element: HTMLVideoElement | null
├── file: File | null
├── objectUrl: string | null
├── isHDR: boolean               # set on load via ffmpeg.wasm probe
├── colorSpace: string | null    # e.g., 'bt2020nc'
├── duration: number
├── currentTime: number          # synced via requestAnimationFrame
├── playing: boolean
└── framerate: number            # detected or default 24fps

UndoStore (persisted in project file)
├── undoStack: SerializedCommand[] (max 200)
├── redoStack: SerializedCommand[]
└── execute(cmd) / undo() / redo()
```

### 4.2 Key Principles

- **Command pattern for undo/redo.** Every mutation goes through `undoStore.execute(command)`. Commands are serializable JSON. No direct mutations outside commands.
- **Derived state over duplicated state.** Properties panel content, safety info, validation state are all `$derived`, never stored separately.
- **Video store is runtime-only.** Only the file path reference is persisted. On reload, user re-selects the file.
- **HDR flag is authoritative.** Set once at video load, consulted by eyedropper and future auto-channel features.

### 4.3 Data Flow Example (Keyframe Edit)

```
User drags keyframe → PointerEvent handler
  → creates MoveKeyframeCommand(id, newTimestamp)
  → undoStore.execute(cmd)
    → cmd.execute() mutates projectStore.track
    → $derived timeline re-renders (canvas invalidation)
    → $derived safety info recomputes
    → snapshotStore marks dirty
```

### 4.4 Auto-Save & Session Recovery

- Snapshot to `localStorage` every 60 seconds during active editing.
- Namespaced: `openlightfx-studio:snapshot:<project-id>`
- Serialization in a Web Worker if payload exceeds size threshold.
- On startup/refresh: auto-restore without user action. Keyframes, channels, groups, effects, scene markers, UI state (zoom, scroll), video file path reference all restored.
- If video file is no longer accessible: track data restores, user prompted to re-select video.
- Explicit project save clears the localStorage snapshot.
- Undo history is part of the snapshot — survives refresh.

---

## 5. Video & HDR Pipeline

### 5.1 Video Load Sequence

```
User selects video file
  → URL.createObjectURL() → set on <video> element for playback
  → ffmpeg.wasm probe (parallel, non-blocking)
    → reads stream metadata (color_space, color_transfer, color_primaries)
    → determines: isHDR, colorSpace, framerate, duration, codec
    → extracts container metadata (chapters, title, IMDB ID)
    → stores results in VideoStore + candidate metadata
  → chapter markers auto-placed on timeline
  → HDR badge shown in status bar if applicable
```

### 5.2 Eyedropper Flow

```
User activates eyedropper (click tool or I shortcut)
  → video pauses at current frame
  → ffmpeg.wasm extracts single frame at current timestamp
    → HDR: applies zscale filter chain (bt2020→bt709, PQ→gamma, Hable tonemap)
    → SDR: extracts as-is (png)
  → tone-mapped frame rendered to overlay <canvas> positioned over video
  → user clicks pixel on overlay canvas
    → getImageData() samples accurate SDR color
    → color applied to selected keyframe (if any)
    → color added to history
  → eyedropper deactivated → overlay removed, video resumes
```

The overlay shows the ffmpeg-processed frame, so what the user sees is what they sample. The native `<video>` underneath may look slightly different on HDR content — this is expected and correct.

### 5.3 ffmpeg.wasm Loading

- Lazy loaded on first need (video file selection), not bundled in initial JS.
- Cached in a Web Worker for fast subsequent operations.
- COOP/COEP headers required for SharedArrayBuffer.

### 5.4 Future Auto-Channel Generation

The same `extractToneMappedFrame(timestamp)` function is the entry point for auto-channel generation. The pipeline doesn't need to know who's calling it — eyedropper and auto-gen are both consumers of the same frame extraction service.

Example: ambient channel auto-generation would call the frame extraction at regular intervals (or at scene change timestamps), sample the center-excluded border region, average the color, and generate keyframes programmatically.

---

## 6. Timeline & Canvas Rendering

### 6.1 Rendering Approach

HTML Canvas with `devicePixelRatio` scaling, driven by a render loop that only paints when state changes (dirty flag, not continuous RAF).

### 6.2 Canvas Layers (composited in order)

1. **Background** — alternating lane stripes per channel, time grid lines
2. **Scene markers** — labeled vertical lines spanning all lanes
3. **Keyframes** — colored circles/diamonds on their channel lane, color reflects the keyframe's RGB value
4. **Effect blocks** — colored rectangles spanning their duration, semi-transparent with pattern fill
5. **Selection highlights** — selected keyframes get a ring/glow, rubber-band selection rectangle
6. **Playhead** — vertical line synced to video currentTime via RAF (updates at 60fps during playback)

### 6.3 Minimap

- Minimum 48px height, scalable up to 80px via drag handle on top edge.
- Compressed view of full track duration. Current viewport shown as highlighted region.
- Clickable/draggable for fast navigation.
- Displays scene markers and keyframe density.

### 6.4 Playhead Auto-Follow

During playback, the timeline viewport scrolls to keep the playhead visible. When the playhead reaches ~75% of viewport width, the view advances smoothly (not jumpy page-by-page). During manual editing (not playing), auto-follow is off. Scrubbing also keeps the playhead in view.

### 6.5 Interaction Model (Pointer Events)

| Gesture | Desktop | Tablet |
|---------|---------|--------|
| Pan timeline | Middle-click drag or Shift+scroll | Two-finger drag |
| Zoom | Ctrl+scroll wheel | Pinch |
| Select keyframe | Click | Tap |
| Multi-select | Shift+click (range), Cmd+click (toggle) | Long-press enters selection mode, then tap to toggle |
| Move keyframe | Drag horizontally | Drag horizontally (44px handle) |
| Add keyframe | Double-click lane / K shortcut | Double-tap lane |
| Context menu | Right-click | Long-press |
| Scrub playhead | Click/drag on time ruler | Tap/drag on time ruler |

### 6.6 Snapping

Keyframes snap to other keyframes, whole-second marks, 500ms marks, and detected video frame boundaries. Visual snap indicator when engaging. Configurable minimum interval (100ms–1000ms, default 200ms).

### 6.7 Performance Targets

- 60fps rendering with up to 10,000 visible keyframes.
- Dirty region re-rendering where possible (playhead movement doesn't redraw all keyframes).
- Offscreen keyframes culled — only render what's in the viewport.

---

## 7. Keyframe Editing & Properties

### 7.1 Creating Keyframes

- Double-click/double-tap a channel lane → insert at that timestamp on that channel.
- **K** shortcut → insert at playhead on active channel.
- New keyframes inherit previous keyframe's color/brightness/power, or default to black (RGB 0,0,0, brightness 0%, power off).
- Interpolation defaults to **Step**.
- Newly created keyframes are immediately selected → properties popover appears.

### 7.2 Properties Popover (Anchored to Selected Keyframe)

```
┌──────────────────────────────┐
│  Color   [■] #1a2b3f     ▼  │  ← swatch + hex, tap to expand picker
│  Mode    [RGB ▼ | Kelvin]   │  ← toggle: RGB or Color Temperature
│  Temp    ━━━━━●━━━  4200K   │  ← shown when Kelvin mode (1000–10000K)
│  Bright  ━━━━━━━●━━  72%    │  ← slider
│  Trans.  ━━●━━━━━━━  150ms  │  ← transition duration
│  Interp  [Step ▼]           │  ← dropdown: Step / Linear
│  Power   [● On]             │  ← toggle
├──────────────────────────────┤
│  ○ ○ ○ ○ ○ ○ ○ ○            │  ← color history (last 16)
└──────────────────────────────┘
```

- **RGB mode:** swatch, hex input, expands to RGB sliders + color wheel + eyedropper.
- **Kelvin mode:** temperature slider (1000K–10000K in 100K steps) replaces color controls. Swatch still shown, computed from Kelvin value. Eyedropper available (sampled RGB auto-converts to nearest Kelvin).
- Selected `color_mode` (RGB or COLOR_TEMPERATURE) stored on the keyframe and exported to protobuf.
- **Multi-select:** shared properties shown, mixed values as "—". Changes apply to all selected.

### 7.3 Channel Properties Popover (Tap Channel Header)

```
┌──────────────────────────────┐
│  ID        [ambient]         │  ← validated: [a-z0-9_-]{1,64}
│  Name      [Ambient Light]   │
│  Spatial   [Ambient ▼]       │  ← dropdown of spatial hints
│  Default   [■] #000000      │
│  Optional  [● Yes]           │
├──────────────────────────────┤
│  [Duplicate]  [Delete]       │
└──────────────────────────────┘
```

### 7.4 Track Metadata

Accessed via command palette or top bar project title click. Title, description, IMDB/TMDB ID, author, tags, duration, start/end behavior. Movie metadata modal with manual ID entry (no external API calls). Safety info displayed as read-only computed badges.

### 7.5 Bulk Operations

- Select all in channel: Cmd/Ctrl+A with channel active.
- Select range: Shift+click start and end.
- Copy/paste: Cmd/Ctrl+C/V — paste at playhead or clicked position, cross-channel supported.
- Delete: Delete/Backspace.

---

## 8. Channel Management

### 8.1 Channel Templates

Templates are the **default UX** at project creation. Adding custom channels is an advanced option.

| Template | Channels |
|----------|----------|
| Ambient (1ch) | `ambient` |
| Stereo | `left`, `right` |
| Stereo + Ambient | `left`, `right`, `ambient` |
| Surround (4ch) | `left`, `right`, `surround-left`, `surround-right` |
| 6-Channel Theater | `left`, `center`, `right`, `surround-left`, `surround-right`, `ambient` |
| 8-Channel Home Theater | `left`, `center`, `right`, `surround-left`, `surround-right`, `back-left`, `back-right`, `ambient` |

Templates pre-assign spatial hints. "Configure manually" available as advanced option below the template grid or via command palette after creation.

### 8.2 Channel Defaults

Each new channel gets an auto-inserted black keyframe at 0:00:00 (RGB 0,0,0, brightness 0%, power off, Step interpolation).

### 8.3 Channel Groups (Layer 2)

Studio-only (not exported to `.lightfx`):
- **Mirror:** edit one → replicate to all group members.
- **Spread:** edits propagate sequentially with configurable time offset (default 150ms).
- **Alternate:** round-robin keyframe placement across group members.
- Configured via popover from channel header. Visual bracket/chain icon on grouped headers.
- Temporarily unlink for independent edits, then re-link.

### 8.4 Channel Operations

- Add channel (toolbar or command palette).
- Reorder via drag handle on channel headers.
- Solo (union mode — multiple simultaneous), Mute (skipped in preview, hidden from overlay).
- Duplicate / Delete (with confirmation).
- Channel ID validation: `[a-z0-9_-]{1,64}`, unique, inline error on conflict.
- Inline rename on double-click/double-tap of channel header name.

---

## 9. Lighting Overlay & Visualization

Real-time lighting simulation rendered as an overlay on video preview, synchronized with playback and scrubbing.

### Glow Regions by Spatial Hint

| Spatial Hint | Position | Size |
|-------------|----------|------|
| FRONT_LEFT, LEFT | Top-left edge | 15% video height |
| FRONT_CENTER, CENTER | Top-center edge | 15% video height |
| FRONT_RIGHT, RIGHT | Top-right edge | 15% video height |
| SURROUND_LEFT | Bottom-left edge | 15% video height |
| SURROUND_RIGHT | Bottom-right edge | 15% video height |
| AMBIENT | Border glow, fading inward | 20% of smaller dimension |
| CEILING | Top edge, full width | 10% video height |
| FLOOR | Bottom edge, full width | 10% video height |

- Color and brightness interpolated from channel keyframes at current position.
- Rendered as CSS/Canvas gradient overlays with soft falloff.
- Toggleable on/off (toolbar icon or **V** shortcut).
- Channels with no spatial hint excluded; shown in "Unassigned" indicator below video.
- Muted channels hidden from overlay.
- Effect blocks animate in overlay (Layer 2).

---

## 10. Import / Export

### 10.1 Import

- Open `.lightfx` files for editing (decoded via protobufjs).
- Open `.lightfx-project` files to restore full working state including undo history.

### 10.2 Export `.lightfx`

- Channel groups flattened to per-channel keyframes.
- Safety info auto-computed: `contains_flashing`, `contains_strobing`, `intensity_rating`, `max_flash_frequency_hz`, `max_brightness_delta`.
- Validation pass with error reporting before write.
- Warning if track duration differs from video by >5s.

### 10.3 Export for Marketplace

- All metadata must be populated (title, description, IMDB ID, tags).
- Modal prompts for missing fields.

### 10.4 Marketplace Publish

**Placeholder UI only.** Visible but disabled button/menu item with "Coming soon" state. No dead code paths or hidden stubs. Designed so the CloudProvider auth integration enables it when ready.

---

## 11. Undo/Redo

- Command pattern: every mutation is a serializable command object.
- `execute()` applies + pushes to undo stack. `undo()` reverses + pushes to redo stack.
- Redo stack cleared on new command execution.
- Stack depth: 200 commands.
- Composite commands for bulk operations (single undo step).
- Persisted in `.lightfx-project` file.

---

## 12. Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save | Cmd/Ctrl+S |
| Open | Cmd/Ctrl+O |
| Undo | Cmd/Ctrl+Z |
| Redo | Cmd/Ctrl+Shift+Z |
| Play/Pause | Space |
| Add keyframe | K |
| Add scene marker | M |
| Delete selection | Delete / Backspace |
| Copy | Cmd/Ctrl+C |
| Paste | Cmd/Ctrl+V |
| Select all in channel | Cmd/Ctrl+A |
| Frame step forward | → |
| Frame step backward | ← |
| Zoom in | Cmd/Ctrl+= |
| Zoom out | Cmd/Ctrl+- |
| Zoom to fit | Cmd/Ctrl+0 |
| Command palette | Cmd/Ctrl+K |
| Toggle overlay | V |
| Eyedropper | I |
| Dark/light mode | Cmd/Ctrl+Shift+D |

Shortcuts shown inline in command palette results and context menus. On tablet, primary actions available via toolbar and command palette search. Help panel accessible via `?`.

---

## 13. Scene Detection & Video Metadata (Layer 2)

### Scene Change Detection

- Frame-to-frame color histogram comparison, chi-squared distance.
- 500ms sample intervals, downscaled to 160x90.
- Three sensitivity levels (low / medium / high).
- Web Worker — non-blocking, progress indicator.
- Markers placed as `MARKER_AUTO_DETECTED`.

### Video Metadata Extraction

- Runs during ffmpeg.wasm probe at video load.
- Duration, framerate, codec, HDR info.
- Container chapters → auto-placed as `MARKER_CHAPTER` markers.
- Movie-identifying metadata → stored as candidates, pre-fill metadata modal. Never auto-applied.
- Chapter navigation buttons in playback bar (previous/next), disabled if none.

---

## 14. MVP Layers

### Layer 1 — Core Editing Loop (the rewrite)

- Application shell with modern layout
- Video preview with playback controls
- HDR detection at video load (ffmpeg.wasm probe)
- Canvas timeline with keyframes, playhead, minimap
- Keyframe creation, editing, deletion, drag, multi-select
- Properties popovers (RGB + Kelvin, brightness, interpolation, power)
- Eyedropper with HDR-aware frame extraction
- Channel management with templates (default) and custom (advanced)
- Channel solo/mute
- Undo/redo (command pattern, 200 deep)
- Save architecture (LocalFileSystem + Download fallback + CloudProvider stub)
- Auto-save snapshots to localStorage
- Import/export `.lightfx` and `.lightfx-project`
- Safety info auto-computation
- Keyboard shortcuts + command palette
- Dark/light theme
- Responsive tablet support
- Lighting overlay visualization

### Layer 2 — Effects & Advanced Timeline

- 13 effect types with drag-to-timeline
- Effect blocks rendering on canvas
- Effect properties editing
- Effect preview in lighting overlay
- Channel groups (mirror, spread, alternate)
- Scene change detection (Web Worker)
- Video metadata extraction (chapters, title, IMDB)
- Scene markers (manual + auto-detected + chapter)
- Copy/paste cross-channel
- Keyframe snapping with visual indicators

### Layer 3 — Marketplace & Intelligence

- Marketplace publish (disabled UI → enabled)
- Cloud save provider (OAuth + marketplace API)
- Auto-channel generation (ambient from frame analysis, using ffmpeg.wasm pipeline)
- Welcome/onboarding flow

---

## 15. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | SvelteKit 2 + Svelte 5 | Runes-based reactivity |
| Language | TypeScript 5 | Strict mode |
| Styling | Tailwind CSS 3 | Custom dark theme |
| Bundler | Vite 6 | HMR, optimized builds |
| Serialization | protobufjs 7 | Dynamic loading via `?raw` import |
| Video Processing | ffmpeg.wasm | HDR detection, frame extraction, tone mapping |
| State | Svelte 5 runes | `$state`, `$derived`, no external state library |
| Timeline | HTML Canvas | `devicePixelRatio` scaling, dirty-flag render loop |
| Workers | Web Workers | Scene detection, snapshot serialization, ffmpeg.wasm |
| Deployment | Static adapter (SPA) | Hosted at openlightfx.studio |
