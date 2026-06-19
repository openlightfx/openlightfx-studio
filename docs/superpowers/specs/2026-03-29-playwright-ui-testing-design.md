# Playwright Functional UI Testing — Design Spec

## Goal

Catch UI regressions (like the null-crash on mount we just hit) before they reach the user. Cover the critical user workflows and the color picker interaction surface using Playwright end-to-end tests.

## Scope

**In scope (critical workflows + color picker):**

1. App boot & project lifecycle (snapshot restore, new project dialog)
2. Timeline canvas interactions (click keyframe, drag keyframe, double-click to create, right-click context menu, selection rectangle)
3. Keyframe editing via KeyframePopover (brightness, transition, interpolation, power, color)
4. Color picker (wheel click, RGB sliders, hex input, Kelvin mode, color history, mode toggle)
5. Channel headers (solo, mute, rename, right-click popover)
6. Keyboard shortcuts (play/pause, undo/redo, copy/paste, delete, zoom, Ctrl+K)
7. Command palette (open, search, execute command)
8. Video loading via drag-drop + playback controls
9. Export dialog (validation display, download)
10. Undo/redo chains across keyframe create → edit color → move → delete

**Out of scope (future layers):**

- Eyedropper (requires pixel-level canvas sampling — fragile in CI)
- Scene detection (long-running async worker — better as integration test)
- Effect keyframe editing (EffectPopover — lower priority, same popover pattern as keyframe)
- Visual regression screenshots (add later once functional tests are stable)
- Channel group dialog (lower priority)

## Architecture

```
e2e/
  fixtures/
    test-project.json          # Minimal 2-channel project (stereo template)
    test-video.mp4             # 97 MB test video (23.976 fps, rotating gradients)
  pages/
    app.page.ts                # Boot helpers, fixture seeding, video loading
    timeline.page.ts           # Canvas coordinate math, click/drag helpers
    color-picker.page.ts       # Color wheel, sliders, hex, history, mode toggle
    command-palette.page.ts    # Open, search, execute
  tests/
    boot.spec.ts               # App lifecycle tests
    timeline.spec.ts           # Canvas interaction tests
    keyframe-editing.spec.ts   # Popover + property editing tests
    color-picker.spec.ts       # Full color picker interaction tests
    channel-headers.spec.ts    # Solo/mute/rename/popover tests
    keyboard-shortcuts.spec.ts # Shortcut tests
    video-playback.spec.ts     # Video load + playback controls
    export.spec.ts             # Export dialog tests
    undo-redo.spec.ts          # Multi-step undo/redo chains
  playwright.config.ts         # Config: webServer, projects, timeouts
```

## Test Fixture Strategy

### Project Seeding

Tests inject a known project snapshot into localStorage before page load using `page.addInitScript()`. This bypasses the NewProjectDialog and gives every test a deterministic starting state.

**Fixture: `test-project.json`** — Stereo template (2 channels: "Left", "Right") with:
- 4 keyframes: 2 per channel at t=0ms and t=5000ms
- Left channel keyframes: red (255,0,0) at 0ms, blue (0,0,255) at 5000ms
- Right channel keyframes: green (0,255,0) at 0ms, white (255,255,255) at 5000ms
- All brightness=100%, interpolation=STEP, powerOn=true
- No effects, no scene markers, no channel groups
- Timeline zoom set so 5000ms is visible in viewport

This gives tests concrete, known keyframes to click on and verify color changes against.

### Video File

`e2e/fixtures/test-video.mp4` — copied from `/home/jon/Downloads/01. Banding_Rotating-gradients_23.976.mp4` (97 MB, 23.976 fps). Used for:
- Drag-drop loading tests
- Playback control tests
- Zoom-to-fit (needs duration > 0)

The file is committed to the repo via Git LFS (tracked as `e2e/fixtures/*.mp4`).

### Fixture Helper (`app.page.ts`)

```typescript
export class AppPage {
  constructor(private page: Page) {}

  /** Seed localStorage with test project, navigate, wait for canvas render */
  async boot(): Promise<void> {
    const fixture = JSON.parse(fs.readFileSync('e2e/fixtures/test-project.json', 'utf8'));
    await this.page.addInitScript((json) => {
      localStorage.setItem(
        'openlightfx-studio:snapshot:test-fixture',
        json,
      );
    }, JSON.stringify(fixture));
    await this.page.goto('/');
    await this.page.waitForSelector('canvas');
  }

  /** Load video via drag-drop on the video panel */
  async loadVideo(): Promise<void> { /* ... */ }

  /** Get the timeline canvas element */
  get canvas(): Locator { return this.page.locator('.timeline-panel canvas'); }
}
```

## Page Objects

### `timeline.page.ts` — Canvas Interaction Helpers

The timeline is a `<canvas>` element, so we can't use DOM selectors for keyframes. Instead, we compute pixel coordinates from known keyframe timestamps and channel indices.

```typescript
export class TimelinePage {
  constructor(private page: Page) {}

  /** Convert (timestampMs, channelIndex) → canvas pixel coordinates */
  async getKeyframePosition(timestampMs: number, channelIndex: number): Promise<{x: number, y: number}> {
    // Read pxPerMs and scrollX from timelineStore via page.evaluate()
    // Compute: x = (timestampMs - scrollX) * pxPerMs
    //          y = RULER_HEIGHT + channelIndex * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2
  }

  /** Click a keyframe at known position */
  async clickKeyframe(timestampMs: number, channelIndex: number): Promise<void> { /* ... */ }

  /** Drag a keyframe from one timestamp to another */
  async dragKeyframe(fromMs: number, toMs: number, channelIndex: number): Promise<void> { /* ... */ }

  /** Double-click empty space to create keyframe */
  async doubleClickAt(timestampMs: number, channelIndex: number): Promise<void> { /* ... */ }

  /** Right-click at position to open context menu */
  async rightClickAt(timestampMs: number, channelIndex: number): Promise<void> { /* ... */ }

  /** Draw selection rectangle between two points */
  async selectRect(fromMs: number, fromCh: number, toMs: number, toCh: number): Promise<void> { /* ... */ }

  /** Read selected keyframe IDs from timelineStore */
  async getSelectedKeyframeIds(): Promise<string[]> { /* page.evaluate */ }

  /** Read all keyframe timestamps from projectStore */
  async getKeyframeTimestamps(channelId: string): Promise<number[]> { /* page.evaluate */ }
}
```

### `color-picker.page.ts` — Color Picker Helpers

```typescript
export class ColorPickerPage {
  constructor(private page: Page) {}

  /** Check if color picker section is expanded in the popover */
  async isExpanded(): Promise<boolean> { /* ... */ }

  /** Click the color swatch to expand/collapse the picker */
  async toggleExpand(): Promise<void> { /* ... */ }

  /** Click at (x, y) relative to the color wheel canvas center */
  async clickWheel(angle: number, radius: number): Promise<void> {
    // Convert polar (angle, radius) to cartesian relative to wheel center
    // Wheel is 200x200, center at (100, 100)
  }

  /** Drag the lightness slider to a value 0-100 */
  async setLightness(percent: number): Promise<void> { /* ... */ }

  /** Set RGB slider values */
  async setRed(value: number): Promise<void> { /* ... */ }
  async setGreen(value: number): Promise<void> { /* ... */ }
  async setBlue(value: number): Promise<void> { /* ... */ }

  /** Type a hex value and press Enter */
  async setHex(hex: string): Promise<void> { /* ... */ }

  /** Switch to RGB or Kelvin mode */
  async selectMode(mode: 'RGB' | 'Kelvin'): Promise<void> { /* ... */ }

  /** Set Kelvin slider value */
  async setKelvin(temperature: number): Promise<void> { /* ... */ }

  /** Click a color history swatch by index */
  async clickHistorySwatch(index: number): Promise<void> { /* ... */ }

  /** Read current color from the keyframe via projectStore */
  async getKeyframeColor(keyframeId: string): Promise<{r: number, g: number, b: number}> {
    return this.page.evaluate((id) => {
      // Access projectStore to read keyframe color
    }, keyframeId);
  }
}
```

### `command-palette.page.ts`

```typescript
export class CommandPalettePage {
  constructor(private page: Page) {}

  async open(): Promise<void> {
    await this.page.keyboard.press('Control+k');
    await this.page.waitForSelector('[role="dialog"][aria-label="Command palette"]');
  }

  async search(query: string): Promise<void> { /* type in input */ }

  async executeByLabel(label: string): Promise<void> {
    await this.search(label);
    await this.page.keyboard.press('Enter');
  }

  async getVisibleCommands(): Promise<string[]> { /* read list items */ }
}
```

## Test Plan

### 1. `boot.spec.ts` — App Lifecycle

| Test | Action | Assertion |
|------|--------|-----------|
| Shows new-project dialog when no snapshot | Clear localStorage, navigate | NewProjectDialog visible |
| Restores snapshot on boot | Seed fixture, navigate | Canvas visible, no dialog, 2 channels in headers |
| Project title displayed | Boot with fixture | Title reads "Test Project" |

### 2. `timeline.spec.ts` — Canvas Interactions

| Test | Action | Assertion |
|------|--------|-----------|
| Click keyframe selects it | Click kf at t=0, ch=0 | `selectedKeyframeIds` contains `kf-left-0` |
| Ctrl+click adds to selection | Click kf1, Ctrl+click kf2 | Both IDs in selection |
| Click empty deselects | Select kf, click empty space | Selection empty |
| Double-click creates keyframe | Double-click at t=2500, ch=0 | New keyframe exists at ~2500ms on "left" |
| Drag moves keyframe | Drag kf from 5000ms to 3000ms | Keyframe timestamp updated to ~3000ms |
| Right-click shows context menu | Right-click on keyframe | Context menu visible with "Delete Keyframe" |
| Selection rectangle | Drag rect covering t=0-5000, ch=0-1 | All 4 keyframes selected |

### 3. `keyframe-editing.spec.ts` — Popover Properties

| Test | Action | Assertion |
|------|--------|-----------|
| Popover opens on select | Click keyframe | KeyframePopover visible (Popover component with sliders) |
| Brightness slider | Select kf, change brightness to 50% | `kf.brightness` = ~0.5 |
| Interpolation dropdown | Select kf, change to LINEAR | `kf.interpolation` = "LINEAR" |
| Power toggle | Select kf, toggle power off | `kf.powerOn` = false |
| Transition slider | Select kf, set transition 500ms | `kf.transitionMs` = ~500 |
| Multi-select shows mixed | Select 2 kf with different colors | Mixed indicator "—" visible |
| Popover closes on deselect | Click empty space | Popover gone |

### 4. `color-picker.spec.ts` — Color Interactions

| Test | Action | Assertion |
|------|--------|-----------|
| Expand color picker | Click color swatch in popover | Color wheel visible |
| Click color wheel changes color | Click upper-right of wheel | Keyframe color changed (not black) |
| RGB sliders update keyframe | Set R=255, G=0, B=0 | Keyframe color = {255, 0, 0} |
| Hex input applies color | Type "00FF00", Enter | Keyframe color = {0, 255, 0} |
| Invalid hex shows error | Type "ZZZZZZ", blur | Error message visible, color unchanged |
| Switch to Kelvin mode | Click "Kelvin" tab | Kelvin slider visible, wheel hidden |
| Kelvin slider sets temperature | Move slider to ~3000K | Keyframe color warm-tinted, colorMode = "COLOR_TEMPERATURE" |
| Switch back to RGB | Click "RGB" tab | Wheel + sliders visible, kelvin hidden |
| Color history records picks | Set red, then set green | History shows red swatch |
| Click history swatch applies | Click first history swatch | Keyframe color matches swatch |
| Multi-select color change | Select 2 kf, set hex "FF0000" | Both keyframes turn red |

### 5. `channel-headers.spec.ts`

| Test | Action | Assertion |
|------|--------|-----------|
| Shows 2 channels | Boot | "Left" and "Right" channel names visible |
| Solo toggles | Click S on "Left" | Solo button highlighted, store updated |
| Mute toggles | Click M on "Right" | Mute button red, store updated |
| Rename channel | Double-click "Left", type "Front Left", Enter | Channel name reads "Front Left" |
| Rename cancel | Double-click, type, Escape | Name reverts |
| Right-click opens popover | Right-click channel row | ChannelPopover visible |

### 6. `keyboard-shortcuts.spec.ts`

| Test | Action | Assertion |
|------|--------|-----------|
| Ctrl+K opens palette | Press Ctrl+K | Command palette visible |
| Escape closes palette | Open palette, press Escape | Palette gone |
| Ctrl+Z undoes | Create kf, Ctrl+Z | Keyframe removed |
| Ctrl+Shift+Z redoes | Undo, then Ctrl+Shift+Z | Keyframe restored |
| Delete removes keyframe | Select kf, press Delete | Keyframe gone |
| +/- zoom | Press + | pxPerMs increases |
| Ctrl+C / Ctrl+V copy/paste | Select kf, Ctrl+C, move playhead, Ctrl+V | New keyframe at playhead |

### 7. `video-playback.spec.ts`

| Test | Action | Assertion |
|------|--------|-----------|
| Drag-drop loads video | Drop test-video.mp4 on video panel | `<video>` element has src, duration > 0 |
| Play/pause toggle | Load video, press Space | Video playing; Space again → paused |
| Step forward/backward | Load video, press → | currentTimeMs advances by one frame (~41.7ms) |
| Scrub bar seeks | Load video, click mid-point of scrub bar | currentTimeMs near duration/2 |

### 8. `export.spec.ts`

| Test | Action | Assertion |
|------|--------|-----------|
| Export dialog opens | Press Ctrl+E | Export dialog visible |
| Shows validation | Open export | Validation section visible (errors/warnings) |
| Export button downloads | Click "Export .lightfx" | Download triggered (check download event) |
| Cancel closes | Click Cancel | Dialog gone |

### 9. `undo-redo.spec.ts`

| Test | Action | Assertion |
|------|--------|-----------|
| Create → undo removes | Double-click to create kf, Ctrl+Z | Keyframe count back to original |
| Edit color → undo reverts | Select kf, change to red, Ctrl+Z | Color back to original |
| Multi-step undo | Create kf, edit color, move kf, Ctrl+Z ×3 | All reverted in order |
| Redo replays | Undo, Ctrl+Shift+Z | Change re-applied |
| Rename → undo | Rename channel, Ctrl+Z | Name reverts |

## Playwright Configuration

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,          // Canvas tests are stateful per-tab
  retries: 1,
  workers: 1,                    // Single worker avoids port conflicts
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**Why `preview` not `dev`:** Production build catches SSR issues and is closer to what users run. The COOP/COEP headers from vite.config.ts apply to both modes.

**Single browser (Chromium):** The app uses WebCodecs, OffscreenCanvas, and SharedArrayBuffer — all Chromium-first APIs. Firefox/WebKit support is not a priority.

## Git LFS for Video

The 97 MB test video will be tracked via Git LFS:

```
# .gitattributes
e2e/fixtures/*.mp4 filter=lfs diff=lfs merge=lfs -text
```

## npm Scripts

```json
{
  "test:e2e": "playwright test --config e2e/playwright.config.ts",
  "test:e2e:ui": "playwright test --config e2e/playwright.config.ts --ui",
  "test:e2e:headed": "playwright test --config e2e/playwright.config.ts --headed"
}
```

## Key Design Decisions

1. **`page.evaluate()` for assertions on store state** — Since keyframes live in a canvas (no DOM nodes), we verify mutations by reading `projectStore` and `timelineStore` directly via `page.evaluate()`. This is more reliable than pixel-sniffing the canvas.

2. **Coordinate math in page objects** — `TimelinePage` reads `pxPerMs` and `scrollX` from the store at assertion time, then computes pixel positions. This avoids hardcoding pixel values that break when viewport size changes.

3. **One browser, serial execution** — Canvas pointer capture and global keyboard listeners make parallel tabs unreliable. Running serial in Chromium keeps tests deterministic.

4. **Fixture-seeded, not UI-created** — Seeding via localStorage is 10x faster than clicking through NewProjectDialog per test. Tests that specifically test the dialog still go through the UI.

5. **Video drag-drop via Playwright's `page.dispatchEvent`** — Playwright can synthesize `DragEvent` with a `DataTransfer` containing a `File`. We read the fixture file from disk and construct the event.
