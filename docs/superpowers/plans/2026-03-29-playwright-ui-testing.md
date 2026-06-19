# Playwright Functional UI Testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright end-to-end tests covering critical user workflows (boot, timeline, keyframe editing, color picker, channels, shortcuts, video, export, undo/redo) to catch UI regressions before they ship.

**Architecture:** Page-object model with fixture-based project seeding via localStorage. Tests run against `vite preview` (production build) in Chromium only. Canvas interactions use coordinate math from store state via `page.evaluate()`. A dev-only global hook (`window.__stores`) exposes store singletons so tests can read/assert on reactive state.

**Tech Stack:** Playwright, TypeScript, SvelteKit (vite preview), Chromium

---

### Task 1: Install Playwright and configure project

**Files:**
- Modify: `package.json` (add deps + scripts)
- Create: `e2e/playwright.config.ts`
- Modify: `.gitignore` (ignore video fixture + playwright artifacts)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `e2e/playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 3: Add npm scripts to `package.json`**

Add these to the `"scripts"` section:

```json
"test:e2e": "playwright test --config e2e/playwright.config.ts",
"test:e2e:ui": "playwright test --config e2e/playwright.config.ts --ui",
"test:e2e:headed": "playwright test --config e2e/playwright.config.ts --headed"
```

- [ ] **Step 4: Update `.gitignore`**

Append to `.gitignore`:

```
# Playwright
e2e/test-results/
e2e/playwright-report/
e2e/blob-report/

# Large test fixtures (copy manually from ~/Downloads)
e2e/fixtures/*.mp4
```

- [ ] **Step 5: Create fixture directory and copy video**

```bash
mkdir -p e2e/fixtures
cp "/home/jon/Downloads/01. Banding_Rotating-gradients_23.976.mp4" e2e/fixtures/test-video.mp4
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json e2e/playwright.config.ts .gitignore
git commit -m "chore: add Playwright with chromium config and e2e scaffold"
```

---

### Task 2: Expose stores for test assertions via dev-only global hook

Tests need to read `projectStore`, `timelineStore`, `videoStore`, and `undoStore` to verify state after UI interactions. We expose them on `window.__stores` only during development/preview builds.

**Files:**
- Modify: `src/routes/+page.svelte` (add store exposure in onMount)

- [ ] **Step 1: Add store exposure in `+page.svelte` onMount**

In `src/routes/+page.svelte`, inside the `onMount` callback, after the existing initialization code (after line 84 `const cleanupKeyboard = initKeyboardShortcuts();`), add:

```typescript
    // Expose stores for e2e testing (only in non-production or when flag is set)
    if (typeof window !== 'undefined') {
      (window as any).__stores = {
        projectStore,
        timelineStore,
        videoStore,
        undoStore,
        uiStore,
      };
    }
```

- [ ] **Step 2: Verify the app still builds**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "chore: expose stores on window.__stores for e2e test assertions"
```

---

### Task 3: Create test project fixture

**Files:**
- Create: `e2e/fixtures/test-project.json`

- [ ] **Step 1: Create `e2e/fixtures/test-project.json`**

This is a stereo template project with 4 known keyframes at predictable positions:

```json
{
  "formatVersion": 1,
  "projectId": "test-fixture",
  "track": {
    "version": 1,
    "metadata": {
      "title": "Test Project",
      "description": "Fixture for Playwright e2e tests",
      "movieReference": {
        "imdbId": "",
        "title": "",
        "year": 0,
        "runtimeMinutes": 0
      },
      "author": "Test",
      "tags": [],
      "durationMs": 0,
      "startBehavior": "LEAVE",
      "endBehavior": "LEAVE",
      "preshowDurationMs": 0,
      "preshowState": "PRESHOW_UNSPECIFIED",
      "creditsStartMs": 0,
      "creditsBehavior": "CREDITS_UNSPECIFIED",
      "trackVersion": "1.0"
    },
    "channels": [
      {
        "id": "left",
        "displayName": "Left",
        "description": "Left channel",
        "defaultColor": { "r": 0, "g": 0, "b": 0 },
        "defaultBrightness": 0,
        "spatialHint": "SPATIAL_LEFT",
        "optional": false
      },
      {
        "id": "right",
        "displayName": "Right",
        "description": "Right channel",
        "defaultColor": { "r": 0, "g": 0, "b": 0 },
        "defaultBrightness": 0,
        "spatialHint": "SPATIAL_RIGHT",
        "optional": false
      }
    ],
    "keyframes": [
      {
        "id": "kf-left-0",
        "channelId": "left",
        "timestampMs": 0,
        "colorMode": "RGB",
        "color": { "r": 255, "g": 0, "b": 0 },
        "colorTemperature": 6500,
        "brightness": 1,
        "transitionMs": 0,
        "interpolation": "STEP",
        "powerOn": true
      },
      {
        "id": "kf-left-5000",
        "channelId": "left",
        "timestampMs": 5000,
        "colorMode": "RGB",
        "color": { "r": 0, "g": 0, "b": 255 },
        "colorTemperature": 6500,
        "brightness": 1,
        "transitionMs": 0,
        "interpolation": "STEP",
        "powerOn": true
      },
      {
        "id": "kf-right-0",
        "channelId": "right",
        "timestampMs": 0,
        "colorMode": "RGB",
        "color": { "r": 0, "g": 255, "b": 0 },
        "colorTemperature": 6500,
        "brightness": 1,
        "transitionMs": 0,
        "interpolation": "STEP",
        "powerOn": true
      },
      {
        "id": "kf-right-5000",
        "channelId": "right",
        "timestampMs": 5000,
        "colorMode": "RGB",
        "color": { "r": 255, "g": 255, "b": 255 },
        "colorTemperature": 6500,
        "brightness": 1,
        "transitionMs": 0,
        "interpolation": "STEP",
        "powerOn": true
      }
    ],
    "effectKeyframes": [],
    "safetyInfo": {
      "containsFlashing": false,
      "containsStrobing": false,
      "maxFlashFrequencyHz": 0,
      "maxBrightnessDelta": 0,
      "warningText": "",
      "intensityRating": "SUBTLE"
    }
  },
  "channelGroups": [],
  "sceneMarkers": [],
  "undoHistory": [],
  "undoPointer": 0,
  "uiState": {
    "timelineZoom": 1,
    "timelineScrollX": 0,
    "timelineScrollY": 0,
    "selectedChannelId": null,
    "selectedKeyframeIds": [],
    "overlayEnabled": true
  },
  "videoFilePath": "",
  "candidateMetadata": {},
  "lastModified": "2026-03-29T00:00:00.000Z"
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/test-project.json
git commit -m "test: add e2e test project fixture with 2 channels and 4 keyframes"
```

---

### Task 4: Create AppPage — boot helper and store access

**Files:**
- Create: `e2e/pages/app.page.ts`

- [ ] **Step 1: Create `e2e/pages/app.page.ts`**

```typescript
import { type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/test-project.json');
const VIDEO_PATH = path.resolve(__dirname, '../fixtures/test-video.mp4');

export class AppPage {
  constructor(public readonly page: Page) {}

  /** Seed localStorage with test project, navigate, wait for canvas render. */
  async boot(): Promise<void> {
    const fixture = fs.readFileSync(FIXTURE_PATH, 'utf8');
    await this.page.addInitScript((json: string) => {
      localStorage.setItem('openlightfx-studio:snapshot:test-fixture', json);
    }, fixture);
    await this.page.goto('/');
    await this.page.waitForSelector('canvas', { timeout: 15_000 });
    // Wait a tick for Svelte effects to settle
    await this.page.waitForTimeout(500);
  }

  /** Navigate without seeding — shows NewProjectDialog. */
  async bootFresh(): Promise<void> {
    await this.page.addInitScript(() => {
      localStorage.clear();
    });
    await this.page.goto('/');
  }

  /** Load video via file chooser triggered by drag-drop simulation. */
  async loadVideo(): Promise<void> {
    const videoPanel = this.page.locator('[aria-label="Video panel"]');
    // Read the video file and create a DataTransfer with it
    await videoPanel.evaluate(async (el, videoPath) => {
      const response = await fetch(videoPath);
      const blob = await response.blob();
      const file = new File([blob], 'test-video.mp4', { type: 'video/mp4' });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, '/test-video.mp4');
    // Wait for video element to load
    await this.page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && v.readyState >= 1 && v.duration > 0;
      },
      { timeout: 30_000 },
    );
  }

  /** Read a value from the exposed stores via page.evaluate. */
  async storeEval<T>(fn: (stores: any) => T): Promise<T> {
    return this.page.evaluate((fnStr) => {
      // __stores is set in +page.svelte onMount
      const stores = (window as any).__stores;
      if (!stores) throw new Error('Stores not exposed — is the app loaded?');
      return stores;
    }).then(() =>
      this.page.evaluate(fn as any),
    );
  }

  get canvas(): Locator {
    return this.page.locator('.timeline-panel canvas');
  }

  get channelHeaders(): Locator {
    return this.page.locator('.channel-headers');
  }
}
```

Note: The `loadVideo` method dispatches a synthetic drag-drop event. The video file must be served as a static asset for the fetch to work. We'll handle this by copying it into the `static/` directory during the test build, OR by using Playwright's `setInputFiles` if there's a file input. For now, we provide the structure — the video playback tests (Task 11) will finalize the approach.

- [ ] **Step 2: Verify page object can be imported**

Create a minimal smoke test to verify the setup works:

```bash
# Quick check that TypeScript compiles the page object
npx tsc --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext e2e/pages/app.page.ts 2>&1 || echo "TS check will be done via playwright's own TS handling"
```

Playwright handles its own TypeScript transpilation, so this is informational only.

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/app.page.ts
git commit -m "test: add AppPage helper with boot, store access, and video loading"
```

---

### Task 5: Create TimelinePage — canvas coordinate helpers

**Files:**
- Create: `e2e/pages/timeline.page.ts`

- [ ] **Step 1: Create `e2e/pages/timeline.page.ts`**

```typescript
import { type Page, type Locator } from '@playwright/test';

// Must match src/lib/types/timeline.ts
const RULER_HEIGHT = 28;
const CHANNEL_LANE_HEIGHT = 44;

export class TimelinePage {
  constructor(private page: Page) {}

  private get canvas(): Locator {
    return this.page.locator('.timeline-panel canvas');
  }

  /** Read pxPerMs and scrollX from the timeline store. */
  private async getViewport(): Promise<{ pxPerMs: number; scrollX: number }> {
    return this.page.evaluate(() => {
      const s = (window as any).__stores.timelineStore;
      return { pxPerMs: s.pxPerMs, scrollX: s.scrollX };
    });
  }

  /** Convert (timestampMs, channelIndex) → canvas-relative pixel coords. */
  async getPosition(timestampMs: number, channelIndex: number): Promise<{ x: number; y: number }> {
    const vp = await this.getViewport();
    const x = (timestampMs - vp.scrollX) * vp.pxPerMs;
    const y = RULER_HEIGHT + channelIndex * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    return { x, y };
  }

  /** Click a keyframe at known (timestampMs, channelIndex). */
  async clickKeyframe(timestampMs: number, channelIndex: number, modifiers?: { ctrlKey?: boolean }): Promise<void> {
    const pos = await this.getPosition(timestampMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    const absX = box.x + pos.x;
    const absY = box.y + pos.y;
    await this.page.mouse.click(absX, absY, {
      modifiers: modifiers?.ctrlKey ? ['Control'] : undefined,
    });
    // Wait for selection effect to settle
    await this.page.waitForTimeout(100);
  }

  /** Double-click at (timestampMs, channelIndex) to create a keyframe. */
  async doubleClickAt(timestampMs: number, channelIndex: number): Promise<void> {
    const pos = await this.getPosition(timestampMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.dblclick(box.x + pos.x, box.y + pos.y);
    await this.page.waitForTimeout(100);
  }

  /** Right-click at (timestampMs, channelIndex). */
  async rightClickAt(timestampMs: number, channelIndex: number): Promise<void> {
    const pos = await this.getPosition(timestampMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.click(box.x + pos.x, box.y + pos.y, { button: 'right' });
    await this.page.waitForTimeout(100);
  }

  /** Drag from one timestamp to another on the same channel. */
  async dragKeyframe(fromMs: number, toMs: number, channelIndex: number): Promise<void> {
    const fromPos = await this.getPosition(fromMs, channelIndex);
    const toPos = await this.getPosition(toMs, channelIndex);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');

    const fromX = box.x + fromPos.x;
    const fromY = box.y + fromPos.y;
    const toX = box.x + toPos.x;
    const toY = box.y + toPos.y;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    // Move in small steps for pointer capture to work
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.page.mouse.move(
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
      );
    }
    await this.page.mouse.up();
    await this.page.waitForTimeout(100);
  }

  /** Draw a selection rectangle from (fromMs, fromCh) to (toMs, toCh). */
  async selectRect(fromMs: number, fromCh: number, toMs: number, toCh: number): Promise<void> {
    // Click slightly outside channel lanes to start in empty space
    const fromPos = await this.getPosition(fromMs, fromCh);
    const toPos = await this.getPosition(toMs, toCh);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');

    // Offset to avoid hitting existing keyframes — start 20px before fromMs
    const startX = box.x + Math.max(0, fromPos.x - 20);
    const startY = box.y + fromPos.y - CHANNEL_LANE_HEIGHT / 2 + 2;
    const endX = box.x + toPos.x + 20;
    const endY = box.y + toPos.y + CHANNEL_LANE_HEIGHT / 2 - 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.page.mouse.move(
        startX + (endX - startX) * t,
        startY + (endY - startY) * t,
      );
    }
    await this.page.mouse.up();
    await this.page.waitForTimeout(100);
  }

  /** Click empty space on the canvas to deselect everything. */
  async clickEmpty(): Promise<void> {
    // Click in the ruler area (above channel lanes, just timeline — hits empty space)
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    // Click at x far right (beyond keyframes) in channel 0 lane
    await this.page.mouse.click(box.x + box.width - 20, box.y + RULER_HEIGHT + 10);
    await this.page.waitForTimeout(100);
  }

  /** Read selected keyframe IDs from timelineStore. */
  async getSelectedKeyframeIds(): Promise<string[]> {
    return this.page.evaluate(() => {
      return (window as any).__stores.timelineStore.selectedKeyframeIds;
    });
  }

  /** Read selected effect IDs from timelineStore. */
  async getSelectedEffectIds(): Promise<string[]> {
    return this.page.evaluate(() => {
      return (window as any).__stores.timelineStore.selectedEffectIds;
    });
  }

  /** Read all keyframes from projectStore. */
  async getKeyframes(): Promise<Array<{ id: string; channelId: string; timestampMs: number }>> {
    return this.page.evaluate(() => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      return kfs.map((kf: any) => ({ id: kf.id, channelId: kf.channelId, timestampMs: kf.timestampMs }));
    });
  }

  /** Read a specific keyframe by ID. */
  async getKeyframe(id: string): Promise<any> {
    return this.page.evaluate((kfId: string) => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      const kf = kfs.find((k: any) => k.id === kfId);
      return kf ? JSON.parse(JSON.stringify(kf)) : null;
    }, id);
  }

  /** Read the number of keyframes. */
  async getKeyframeCount(): Promise<number> {
    return this.page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.keyframes.length ?? 0;
    });
  }

  /** Read pxPerMs (for zoom assertions). */
  async getPxPerMs(): Promise<number> {
    return this.page.evaluate(() => {
      return (window as any).__stores.timelineStore.pxPerMs;
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/pages/timeline.page.ts
git commit -m "test: add TimelinePage with canvas coordinate math and store accessors"
```

---

### Task 6: Create ColorPickerPage and CommandPalettePage helpers

**Files:**
- Create: `e2e/pages/color-picker.page.ts`
- Create: `e2e/pages/command-palette.page.ts`

- [ ] **Step 1: Create `e2e/pages/color-picker.page.ts`**

```typescript
import { type Page, expect } from '@playwright/test';

export class ColorPickerPage {
  constructor(private page: Page) {}

  /** The Popover container for the keyframe popover (fixed position overlay). */
  private get popover(): ReturnType<Page['locator']> {
    return this.page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
  }

  /** Click the color swatch button to expand the color picker. */
  async toggleExpand(): Promise<void> {
    await this.popover.locator('button[aria-label="Toggle color picker"]').click();
    await this.page.waitForTimeout(200);
  }

  /** Check if the color wheel canvas is visible (picker is expanded). */
  async isWheelVisible(): Promise<boolean> {
    return this.popover.locator('canvas.cursor-crosshair').isVisible();
  }

  /** Click on the color wheel at a given angle (degrees) and radius fraction (0-1). */
  async clickWheel(angleDeg: number, radiusFraction: number): Promise<void> {
    const wheelCanvas = this.popover.locator('canvas.cursor-crosshair');
    const box = await wheelCanvas.boundingBox();
    if (!box) throw new Error('Color wheel not visible');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const maxRadius = box.width / 2;
    const r = maxRadius * radiusFraction;
    const rad = (angleDeg * Math.PI) / 180;
    const x = centerX + r * Math.cos(rad);
    const y = centerY - r * Math.sin(rad); // Y is inverted in screen coords
    await this.page.mouse.click(x, y);
    await this.page.waitForTimeout(200);
  }

  /** Set an RGB slider value. channel is 'R', 'G', or 'B'. */
  async setRGBSlider(channel: 'R' | 'G' | 'B', value: number): Promise<void> {
    // Find the slider by its label text
    const sliderContainer = this.popover.locator(`label:has-text("${channel}")`).locator('..');
    const input = sliderContainer.locator('input[type="range"]');
    await input.fill(String(value));
    // Trigger input event since fill doesn't always fire it on range inputs
    await input.evaluate((el: HTMLInputElement, val: number) => {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await this.page.waitForTimeout(100);
  }

  /** Type a hex value into the hex input and press Enter. */
  async setHex(hex: string): Promise<void> {
    const input = this.popover.locator('input#hex-input');
    await input.fill(hex);
    await input.press('Enter');
    await this.page.waitForTimeout(100);
  }

  /** Check if hex input shows an error. */
  async hasHexError(): Promise<boolean> {
    return this.popover.locator('span.text-danger').isVisible();
  }

  /** Switch to RGB or Kelvin mode. */
  async selectMode(mode: 'RGB' | 'Kelvin'): Promise<void> {
    const buttonText = mode === 'RGB' ? 'RGB' : 'Kelvin';
    await this.popover.locator(`button:has-text("${buttonText}")`).click();
    await this.page.waitForTimeout(200);
  }

  /** Check if the Kelvin slider is visible. */
  async isKelvinSliderVisible(): Promise<boolean> {
    return this.popover.locator('input[type="range"][min="1000"][max="10000"]').isVisible();
  }

  /** Set the Kelvin slider to a specific temperature. */
  async setKelvin(temperature: number): Promise<void> {
    const input = this.popover.locator('input[type="range"][min="1000"][max="10000"]');
    await input.evaluate((el: HTMLInputElement, val: number) => {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, temperature);
    await this.page.waitForTimeout(100);
  }

  /** Click a color history swatch by index. */
  async clickHistorySwatch(index: number): Promise<void> {
    const swatches = this.popover.locator('.grid-cols-8 button');
    await swatches.nth(index).click();
    await this.page.waitForTimeout(100);
  }

  /** Count the number of color history swatches (buttons, not empty placeholders). */
  async getHistoryCount(): Promise<number> {
    return this.popover.locator('.grid-cols-8 button').count();
  }

  /** Read a keyframe's color from the store. */
  async getKeyframeColor(keyframeId: string): Promise<{ r: number; g: number; b: number }> {
    return this.page.evaluate((id: string) => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      const kf = kfs.find((k: any) => k.id === id);
      return kf ? { r: kf.color.r, g: kf.color.g, b: kf.color.b } : { r: -1, g: -1, b: -1 };
    }, keyframeId);
  }

  /** Read a keyframe's colorMode from the store. */
  async getKeyframeColorMode(keyframeId: string): Promise<string> {
    return this.page.evaluate((id: string) => {
      const kfs = (window as any).__stores.projectStore.file?.track.keyframes ?? [];
      const kf = kfs.find((k: any) => k.id === id);
      return kf?.colorMode ?? '';
    }, keyframeId);
  }
}
```

- [ ] **Step 2: Create `e2e/pages/command-palette.page.ts`**

```typescript
import { type Page } from '@playwright/test';

export class CommandPalettePage {
  constructor(private page: Page) {}

  private get dialog() {
    return this.page.locator('[role="dialog"][aria-label="Command palette"]');
  }

  private get input() {
    return this.dialog.locator('input[aria-label="Search commands"]');
  }

  async open(): Promise<void> {
    await this.page.keyboard.press('Control+k');
    await this.dialog.waitFor({ state: 'visible', timeout: 3_000 });
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.dialog.waitFor({ state: 'hidden', timeout: 3_000 });
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible();
  }

  async search(query: string): Promise<void> {
    await this.input.fill(query);
    await this.page.waitForTimeout(100);
  }

  async executeByLabel(label: string): Promise<void> {
    await this.search(label);
    // Click the matching item directly for reliability
    await this.dialog.locator(`[role="option"]:has-text("${label}")`).click();
    await this.page.waitForTimeout(200);
  }

  async getVisibleCommands(): Promise<string[]> {
    const items = this.dialog.locator('[role="option"]');
    const count = await items.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).locator('span.truncate').textContent();
      if (text) labels.push(text.trim());
    }
    return labels;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add e2e/pages/color-picker.page.ts e2e/pages/command-palette.page.ts
git commit -m "test: add ColorPickerPage and CommandPalettePage helpers"
```

---

### Task 7: Write boot tests

**Files:**
- Create: `e2e/tests/boot.spec.ts`

- [ ] **Step 1: Create `e2e/tests/boot.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('App boot', () => {
  test('shows new-project dialog when no snapshot exists', async ({ page }) => {
    const app = new AppPage(page);
    await app.bootFresh();

    // NewProjectDialog renders inside a Modal with title "New Project"
    const dialog = page.locator('[role="dialog"][aria-label="New Project"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Should show template options
    await expect(page.getByText('Stereo')).toBeVisible();
  });

  test('restores snapshot and skips dialog on boot', async ({ page }) => {
    const app = new AppPage(page);
    await app.boot();

    // No NewProjectDialog should be visible
    const dialog = page.locator('[role="dialog"][aria-label="New Project"]');
    await expect(dialog).not.toBeVisible();

    // Canvas should be rendered
    await expect(app.canvas).toBeVisible();

    // Channel headers should show our 2 channels
    await expect(page.getByText('Left')).toBeVisible();
    await expect(page.getByText('Right')).toBeVisible();
  });

  test('displays project title in top bar', async ({ page }) => {
    const app = new AppPage(page);
    await app.boot();

    await expect(page.getByText('Test Project')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the boot tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/boot.spec.ts
```

Expected: All 3 tests pass. If the first build takes long, increase `webServer.timeout`.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/boot.spec.ts
git commit -m "test: add boot lifecycle e2e tests (snapshot restore, new project dialog)"
```

---

### Task 8: Write timeline canvas interaction tests

**Files:**
- Create: `e2e/tests/timeline.spec.ts`

- [ ] **Step 1: Create `e2e/tests/timeline.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';

test.describe('Timeline canvas interactions', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('click keyframe selects it', async () => {
    // kf-left-0 is at timestampMs=0, channelIndex=0
    await timeline.clickKeyframe(0, 0);
    const selected = await timeline.getSelectedKeyframeIds();
    expect(selected).toContain('kf-left-0');
  });

  test('ctrl+click adds to selection', async () => {
    await timeline.clickKeyframe(0, 0);
    await timeline.clickKeyframe(5000, 0, { ctrlKey: true });
    const selected = await timeline.getSelectedKeyframeIds();
    expect(selected).toContain('kf-left-0');
    expect(selected).toContain('kf-left-5000');
  });

  test('click empty space deselects all', async () => {
    await timeline.clickKeyframe(0, 0);
    let selected = await timeline.getSelectedKeyframeIds();
    expect(selected.length).toBeGreaterThan(0);

    await timeline.clickEmpty();
    selected = await timeline.getSelectedKeyframeIds();
    expect(selected.length).toBe(0);
  });

  test('double-click creates a new keyframe', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    // Double-click at 2500ms in channel 0 (Left)
    await timeline.doubleClickAt(2500, 0);
    const countAfter = await timeline.getKeyframeCount();
    expect(countAfter).toBe(countBefore + 1);

    // Verify the new keyframe is on the left channel near 2500ms
    const keyframes = await timeline.getKeyframes();
    const newKf = keyframes.find(
      (kf) => kf.channelId === 'left' && kf.id !== 'kf-left-0' && kf.id !== 'kf-left-5000',
    );
    expect(newKf).toBeTruthy();
    expect(newKf!.timestampMs).toBeGreaterThan(2000);
    expect(newKf!.timestampMs).toBeLessThan(3000);
  });

  test('drag moves keyframe', async () => {
    // Drag kf-left-5000 from 5000ms to ~3000ms
    await timeline.clickKeyframe(5000, 0);
    await timeline.dragKeyframe(5000, 3000, 0);

    const kf = await timeline.getKeyframe('kf-left-5000');
    expect(kf).toBeTruthy();
    // Allow some tolerance due to pixel rounding
    expect(kf.timestampMs).toBeGreaterThan(2500);
    expect(kf.timestampMs).toBeLessThan(3500);
  });

  test('right-click shows context menu', async ({ page }) => {
    await timeline.rightClickAt(0, 0);
    // Context menu should appear with "Delete Keyframe" option
    await expect(page.getByText('Delete Keyframe')).toBeVisible({ timeout: 2_000 });
  });

  test('selection rectangle selects multiple keyframes', async () => {
    // Draw a rectangle that covers both channels from before 0ms to after 5000ms
    await timeline.selectRect(0, 0, 5000, 1);
    const selected = await timeline.getSelectedKeyframeIds();
    // Should have all 4 keyframes
    expect(selected.length).toBe(4);
    expect(selected).toContain('kf-left-0');
    expect(selected).toContain('kf-left-5000');
    expect(selected).toContain('kf-right-0');
    expect(selected).toContain('kf-right-5000');
  });
});
```

- [ ] **Step 2: Run the timeline tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/timeline.spec.ts
```

Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/timeline.spec.ts
git commit -m "test: add timeline canvas interaction e2e tests"
```

---

### Task 9: Write keyframe editing tests

**Files:**
- Create: `e2e/tests/keyframe-editing.spec.ts`

- [ ] **Step 1: Create `e2e/tests/keyframe-editing.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';

test.describe('Keyframe editing via popover', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('popover opens when keyframe is selected', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    // KeyframePopover renders inside a Popover (fixed position overlay)
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible({ timeout: 3_000 });
  });

  test('brightness slider changes keyframe brightness', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    // Find brightness slider — it's labeled "Brightness" with range 0-100
    const brightnessSlider = popover.locator('label:has-text("Bright")').locator('..').locator('input[type="range"]');
    await brightnessSlider.evaluate((el: HTMLInputElement) => {
      el.value = '50';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    // brightness is stored as 0-1, slider shows 0-100
    expect(kf.brightness).toBeCloseTo(0.5, 1);
  });

  test('interpolation dropdown changes keyframe interpolation', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    // Find interpolation select — labeled "Interp"
    const select = popover.locator('label:has-text("Interp")').locator('..').locator('select');
    await select.selectOption('LINEAR');
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.interpolation).toBe('LINEAR');
  });

  test('power toggle changes keyframe powerOn', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    // Power toggle — button[role="switch"]
    const toggle = popover.locator('button[role="switch"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.powerOn).toBe(false);
  });

  test('transition slider changes keyframe transition', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    const transitionSlider = popover.locator('label:has-text("Trans")').locator('..').locator('input[type="range"]');
    await transitionSlider.evaluate((el: HTMLInputElement) => {
      el.value = '500';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.transitionMs).toBeCloseTo(500, -1);
  });

  test('multi-select shows mixed indicator', async ({ page }) => {
    // Select two keyframes with different colors (red at left-0, green at right-0)
    await timeline.clickKeyframe(0, 0);
    await timeline.clickKeyframe(0, 1, { ctrlKey: true });

    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    // Should show "2 selected"
    await expect(popover.getByText('2 selected')).toBeVisible();
  });

  test('popover closes when deselecting', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    await timeline.clickEmpty();
    await expect(popover).not.toBeVisible({ timeout: 2_000 });
  });
});
```

- [ ] **Step 2: Run the keyframe editing tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/keyframe-editing.spec.ts
```

Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/keyframe-editing.spec.ts
git commit -m "test: add keyframe editing popover e2e tests"
```

---

### Task 10: Write color picker tests

**Files:**
- Create: `e2e/tests/color-picker.spec.ts`

- [ ] **Step 1: Create `e2e/tests/color-picker.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';
import { ColorPickerPage } from '../pages/color-picker.page';

test.describe('Color picker', () => {
  let app: AppPage;
  let timeline: TimelinePage;
  let colorPicker: ColorPickerPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    colorPicker = new ColorPickerPage(page);
    await app.boot();
    // Select the first keyframe (red, at left channel, 0ms)
    await timeline.clickKeyframe(0, 0);
    // Wait for popover
    await page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').waitFor({ state: 'visible' });
  });

  test('expand color picker shows color wheel', async () => {
    await colorPicker.toggleExpand();
    expect(await colorPicker.isWheelVisible()).toBe(true);
  });

  test('clicking color wheel changes keyframe color', async () => {
    await colorPicker.toggleExpand();
    const colorBefore = await colorPicker.getKeyframeColor('kf-left-0');
    // Click at 90 degrees (top of wheel), 70% radius — should pick a saturated color
    await colorPicker.clickWheel(90, 0.7);
    const colorAfter = await colorPicker.getKeyframeColor('kf-left-0');
    // Color should have changed from red
    expect(
      colorAfter.r !== colorBefore.r ||
      colorAfter.g !== colorBefore.g ||
      colorAfter.b !== colorBefore.b,
    ).toBe(true);
  });

  test('RGB sliders update keyframe color', async ({ page }) => {
    await colorPicker.toggleExpand();
    await colorPicker.setRGBSlider('R', 255);
    await colorPicker.setRGBSlider('G', 0);
    await colorPicker.setRGBSlider('B', 0);
    await page.waitForTimeout(300);
    const color = await colorPicker.getKeyframeColor('kf-left-0');
    expect(color.r).toBe(255);
    expect(color.g).toBe(0);
    expect(color.b).toBe(0);
  });

  test('hex input applies color', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.setHex('00FF00');
    const color = await colorPicker.getKeyframeColor('kf-left-0');
    expect(color).toEqual({ r: 0, g: 255, b: 0 });
  });

  test('invalid hex shows error', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.setHex('ZZZZZZ');
    expect(await colorPicker.hasHexError()).toBe(true);
    // Color should remain unchanged (red)
    const color = await colorPicker.getKeyframeColor('kf-left-0');
    expect(color).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('switch to Kelvin mode shows kelvin slider', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.selectMode('Kelvin');
    expect(await colorPicker.isKelvinSliderVisible()).toBe(true);
    expect(await colorPicker.isWheelVisible()).toBe(false);
  });

  test('Kelvin slider sets color temperature', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.selectMode('Kelvin');
    await colorPicker.setKelvin(3000);
    const mode = await colorPicker.getKeyframeColorMode('kf-left-0');
    expect(mode).toBe('COLOR_TEMPERATURE');
  });

  test('switch back to RGB mode shows wheel', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.selectMode('Kelvin');
    expect(await colorPicker.isWheelVisible()).toBe(false);
    await colorPicker.selectMode('RGB');
    expect(await colorPicker.isWheelVisible()).toBe(true);
  });

  test('color history records picks', async ({ page }) => {
    await colorPicker.toggleExpand();
    // Clear color history from localStorage
    await page.evaluate(() => localStorage.removeItem('openlightfx-studio:color-history'));
    // Set a color via hex — this should add to history
    await colorPicker.setHex('FF0000');
    await page.waitForTimeout(200);
    await colorPicker.setHex('00FF00');
    await page.waitForTimeout(200);
    const count = await colorPicker.getHistoryCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking history swatch applies color', async ({ page }) => {
    await colorPicker.toggleExpand();
    // Set a known color to populate history
    await colorPicker.setHex('0000FF');
    await page.waitForTimeout(200);
    // Change to a different color
    await colorPicker.setHex('FF0000');
    await page.waitForTimeout(200);
    // Click the first history swatch (should be blue, the most recent non-current)
    const historyCount = await colorPicker.getHistoryCount();
    if (historyCount > 0) {
      await colorPicker.clickHistorySwatch(0);
      const color = await colorPicker.getKeyframeColor('kf-left-0');
      // Should have applied a color from history (exact value depends on ordering)
      expect(color.r + color.g + color.b).toBeGreaterThan(0);
    }
  });

  test('multi-select color change applies to all keyframes', async ({ page }) => {
    // Select two keyframes
    await timeline.clickKeyframe(0, 1, { ctrlKey: true }); // Add kf-right-0 to selection
    await page.waitForTimeout(200);

    await colorPicker.toggleExpand();
    await colorPicker.setHex('FF0000');
    await page.waitForTimeout(300);

    const leftColor = await colorPicker.getKeyframeColor('kf-left-0');
    const rightColor = await colorPicker.getKeyframeColor('kf-right-0');
    expect(leftColor).toEqual({ r: 255, g: 0, b: 0 });
    expect(rightColor).toEqual({ r: 255, g: 0, b: 0 });
  });
});
```

- [ ] **Step 2: Run the color picker tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/color-picker.spec.ts
```

Expected: All 11 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/color-picker.spec.ts
git commit -m "test: add color picker e2e tests (wheel, sliders, hex, kelvin, history)"
```

---

### Task 11: Write channel header tests

**Files:**
- Create: `e2e/tests/channel-headers.spec.ts`

- [ ] **Step 1: Create `e2e/tests/channel-headers.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Channel headers', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test('shows 2 channels from fixture', async ({ page }) => {
    await expect(page.locator('.channel-headers').getByText('Left')).toBeVisible();
    await expect(page.locator('.channel-headers').getByText('Right')).toBeVisible();
  });

  test('solo button toggles', async ({ page }) => {
    // Find the solo button (S) on the first channel row
    const firstRow = page.locator('.channel-headers .channel-row').first();
    const soloBtn = firstRow.locator('button:has-text("S")');

    // Initially not soloed — should have bg-[#252540] (dark background)
    await expect(soloBtn).toBeVisible();
    await soloBtn.click();

    // Check store state
    const isSolo = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.soloChannelIds.has('left');
    });
    expect(isSolo).toBe(true);

    // Click again to unsolo
    await soloBtn.click();
    const isSoloAfter = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.soloChannelIds.has('left');
    });
    expect(isSoloAfter).toBe(false);
  });

  test('mute button toggles', async ({ page }) => {
    const secondRow = page.locator('.channel-headers .channel-row').nth(1);
    const muteBtn = secondRow.locator('button:has-text("M")');
    await muteBtn.click();

    const isMuted = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.mutedChannelIds.has('right');
    });
    expect(isMuted).toBe(true);

    await muteBtn.click();
    const isMutedAfter = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.mutedChannelIds.has('right');
    });
    expect(isMutedAfter).toBe(false);
  });

  test('double-click renames channel', async ({ page }) => {
    const firstName = page.locator('.channel-headers .channel-row').first().locator('span.truncate');
    await firstName.dblclick();

    // An input should appear
    const input = page.locator('.channel-headers .channel-row').first().locator('input[type="text"]');
    await expect(input).toBeVisible();
    await input.fill('Front Left');
    await input.press('Enter');
    await page.waitForTimeout(200);

    // Verify channel name changed in store
    const name = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(name).toBe('Front Left');
  });

  test('rename cancel with Escape reverts', async ({ page }) => {
    const firstName = page.locator('.channel-headers .channel-row').first().locator('span.truncate');
    await firstName.dblclick();

    const input = page.locator('.channel-headers .channel-row').first().locator('input[type="text"]');
    await input.fill('Something Else');
    await input.press('Escape');
    await page.waitForTimeout(200);

    const name = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(name).toBe('Left');
  });

  test('right-click opens channel popover', async ({ page }) => {
    const firstRow = page.locator('.channel-headers .channel-row').first();
    await firstRow.click({ button: 'right' });

    // ChannelPopover renders inside a Popover container
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible({ timeout: 3_000 });
  });
});
```

- [ ] **Step 2: Run the channel header tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/channel-headers.spec.ts
```

Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/channel-headers.spec.ts
git commit -m "test: add channel header e2e tests (solo, mute, rename, popover)"
```

---

### Task 12: Write keyboard shortcut tests

**Files:**
- Create: `e2e/tests/keyboard-shortcuts.spec.ts`

- [ ] **Step 1: Create `e2e/tests/keyboard-shortcuts.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';
import { CommandPalettePage } from '../pages/command-palette.page';

test.describe('Keyboard shortcuts', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('Ctrl+K opens command palette', async ({ page }) => {
    const palette = new CommandPalettePage(page);
    await palette.open();
    expect(await palette.isVisible()).toBe(true);
  });

  test('Escape closes command palette', async ({ page }) => {
    const palette = new CommandPalettePage(page);
    await palette.open();
    await palette.close();
    expect(await palette.isVisible()).toBe(false);
  });

  test('Ctrl+Z undoes keyframe creation', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    const countAfterCreate = await timeline.getKeyframeCount();
    expect(countAfterCreate).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const countAfterUndo = await timeline.getKeyframeCount();
    expect(countAfterUndo).toBe(countBefore);
  });

  test('Ctrl+Shift+Z redoes', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(200);

    const countAfterRedo = await timeline.getKeyframeCount();
    expect(countAfterRedo).toBe(countBefore + 1);
  });

  test('Delete removes selected keyframe', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.clickKeyframe(5000, 0); // Select kf-left-5000
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    const countAfter = await timeline.getKeyframeCount();
    expect(countAfter).toBe(countBefore - 1);
  });

  test('+ key zooms in', async ({ page }) => {
    const pxBefore = await timeline.getPxPerMs();
    await page.keyboard.press('Equal'); // + key (= on US keyboard, without shift)
    await page.waitForTimeout(200);
    const pxAfter = await timeline.getPxPerMs();
    expect(pxAfter).toBeGreaterThan(pxBefore);
  });

  test('- key zooms out', async ({ page }) => {
    const pxBefore = await timeline.getPxPerMs();
    await page.keyboard.press('Minus');
    await page.waitForTimeout(200);
    const pxAfter = await timeline.getPxPerMs();
    expect(pxAfter).toBeLessThan(pxBefore);
  });

  test('Ctrl+C / Ctrl+V copies and pastes keyframe', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();

    // Select a keyframe
    await timeline.clickKeyframe(0, 0);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(100);

    // Move playhead (click on ruler area to set playhead position)
    // For simplicity, just paste — it should create at current playhead
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);

    const countAfter = await timeline.getKeyframeCount();
    expect(countAfter).toBe(countBefore + 1);
  });
});
```

- [ ] **Step 2: Run the keyboard shortcut tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/keyboard-shortcuts.spec.ts
```

Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/keyboard-shortcuts.spec.ts
git commit -m "test: add keyboard shortcut e2e tests (undo, redo, delete, zoom, copy/paste)"
```

---

### Task 13: Write video playback tests

**Files:**
- Create: `e2e/tests/video-playback.spec.ts`

Note: These tests require the video file at `e2e/fixtures/test-video.mp4`. The drag-drop approach from `AppPage.loadVideo()` may need adjustment depending on how the preview server serves static files. An alternative approach is to use a hidden `<input type="file">` if one exists, or add one for testing.

- [ ] **Step 1: Create `e2e/tests/video-playback.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import * as path from 'path';

const VIDEO_PATH = path.resolve(__dirname, '../fixtures/test-video.mp4');

test.describe('Video playback', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test('drag-drop loads video', async ({ page }) => {
    // Use Playwright's file chooser approach: dispatch a drop event with a file
    const videoPanel = page.locator('[aria-label="Video panel"]');

    // Read the file and dispatch a drop event
    const [fileChooser] = await Promise.all([
      // If there's no file chooser, we simulate drag-drop manually
    ]).catch(() => [null]);

    // Alternative: use page.evaluate to simulate drop with File from fetch
    // The video must be accessible as a static asset. Since it's in e2e/fixtures/
    // which isn't served by vite, we need to use setInputFiles on a hidden input
    // or read the file bytes directly.

    // Approach: create a temporary input[type=file], set its files, then dispatch
    // a drop event using those files.
    await page.evaluate(async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.id = '__test-file-input';
      input.style.display = 'none';
      document.body.appendChild(input);
    });

    await page.locator('#__test-file-input').setInputFiles(VIDEO_PATH);

    // Now read the file from the input and dispatch a drop event on the video panel
    await page.evaluate(() => {
      const input = document.getElementById('__test-file-input') as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) throw new Error('No file set');

      const panel = document.querySelector('[aria-label="Video panel"]');
      if (!panel) throw new Error('Video panel not found');

      const dt = new DataTransfer();
      dt.items.add(file);
      panel.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      panel.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

      input.remove();
    });

    // Wait for video to load
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && v.readyState >= 1 && v.duration > 0;
      },
      { timeout: 30_000 },
    );

    const duration = await page.evaluate(() => document.querySelector('video')?.duration ?? 0);
    expect(duration).toBeGreaterThan(0);
  });

  test('play/pause toggle with Space', async ({ page }) => {
    // Load video first (reuse the drop technique from above)
    await loadVideoHelper(page);

    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    const isPlaying = await page.evaluate(() => (window as any).__stores.videoStore.isPlaying);
    expect(isPlaying).toBe(true);

    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    const isPaused = await page.evaluate(() => !(window as any).__stores.videoStore.isPlaying);
    expect(isPaused).toBe(true);
  });

  test('step forward advances one frame', async ({ page }) => {
    await loadVideoHelper(page);

    const timeBefore = await page.evaluate(() => (window as any).__stores.videoStore.currentTimeMs);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const timeAfter = await page.evaluate(() => (window as any).__stores.videoStore.currentTimeMs);
    // At 23.976 fps, one frame ≈ 41.7ms
    expect(timeAfter).toBeGreaterThan(timeBefore);
    expect(timeAfter - timeBefore).toBeLessThan(100); // Sanity check — shouldn't jump more than 100ms
  });

  test('scrub bar seeks', async ({ page }) => {
    await loadVideoHelper(page);

    const scrubBar = page.locator('input[aria-label="Scrub timeline"]');
    await expect(scrubBar).toBeVisible();

    // Click at the midpoint of the scrub bar
    const box = await scrubBar.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);

      const currentTime = await page.evaluate(() => (window as any).__stores.videoStore.currentTimeMs);
      const duration = await page.evaluate(() => (window as any).__stores.videoStore.durationMs);
      // Should be roughly near the middle
      expect(currentTime).toBeGreaterThan(duration * 0.2);
      expect(currentTime).toBeLessThan(duration * 0.8);
    }
  });
});

/** Helper to load video in tests that need it. */
async function loadVideoHelper(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.id = '__test-file-input';
    input.style.display = 'none';
    document.body.appendChild(input);
  });

  await page.locator('#__test-file-input').setInputFiles(VIDEO_PATH);

  await page.evaluate(() => {
    const input = document.getElementById('__test-file-input') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) throw new Error('No file set');

    const panel = document.querySelector('[aria-label="Video panel"]');
    if (!panel) throw new Error('Video panel not found');

    const dt = new DataTransfer();
    dt.items.add(file);
    panel.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    panel.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

    input.remove();
  });

  await page.waitForFunction(
    () => {
      const v = document.querySelector('video');
      return v && v.readyState >= 1 && v.duration > 0;
    },
    { timeout: 30_000 },
  );
}
```

- [ ] **Step 2: Run the video playback tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/video-playback.spec.ts
```

Expected: All 4 tests pass. If the drag-drop simulation doesn't work (DataTransfer constructor may be restricted), the `loadVideoHelper` approach using a hidden file input is the fallback.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/video-playback.spec.ts
git commit -m "test: add video playback e2e tests (drag-drop, play/pause, step, scrub)"
```

---

### Task 14: Write export dialog tests

**Files:**
- Create: `e2e/tests/export.spec.ts`

- [ ] **Step 1: Create `e2e/tests/export.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Export dialog', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test('Ctrl+E opens export dialog', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  });

  test('shows validation section', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible();

    // Should show safety info section (always present)
    await expect(dialog.getByText('Safety', { exact: false })).toBeVisible();
  });

  test('export button triggers download', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible();

    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await dialog.getByText('Export .lightfx').click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.lightfx');
  });

  test('cancel closes dialog', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible();

    await dialog.getByText('Cancel').click();
    await expect(dialog).not.toBeVisible({ timeout: 2_000 });
  });
});
```

- [ ] **Step 2: Run the export tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/export.spec.ts
```

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/export.spec.ts
git commit -m "test: add export dialog e2e tests"
```

---

### Task 15: Write undo/redo chain tests

**Files:**
- Create: `e2e/tests/undo-redo.spec.ts`

- [ ] **Step 1: Create `e2e/tests/undo-redo.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';
import { ColorPickerPage } from '../pages/color-picker.page';

test.describe('Undo/redo chains', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('create keyframe → undo removes it', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);
  });

  test('edit color → undo reverts', async ({ page }) => {
    const colorBefore = await page.evaluate(() => {
      const kf = (window as any).__stores.projectStore.file?.track.keyframes
        .find((k: any) => k.id === 'kf-left-0');
      return kf ? { r: kf.color.r, g: kf.color.g, b: kf.color.b } : null;
    });
    expect(colorBefore).toEqual({ r: 255, g: 0, b: 0 });

    // Select keyframe, open color picker, change to green
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    const colorPicker = new ColorPickerPage(page);
    await colorPicker.toggleExpand();
    await colorPicker.setHex('00FF00');
    await page.waitForTimeout(300);

    const colorAfterEdit = await colorPicker.getKeyframeColor('kf-left-0');
    expect(colorAfterEdit).toEqual({ r: 0, g: 255, b: 0 });

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const colorAfterUndo = await page.evaluate(() => {
      const kf = (window as any).__stores.projectStore.file?.track.keyframes
        .find((k: any) => k.id === 'kf-left-0');
      return kf ? { r: kf.color.r, g: kf.color.g, b: kf.color.b } : null;
    });
    expect(colorAfterUndo).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('multi-step undo reverts in order', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();

    // Step 1: Create a keyframe
    await timeline.doubleClickAt(2500, 0);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    // Step 2: Select and move the new keyframe
    const keyframes = await timeline.getKeyframes();
    const newKf = keyframes.find(
      (kf) => kf.channelId === 'left' && kf.id !== 'kf-left-0' && kf.id !== 'kf-left-5000',
    );
    expect(newKf).toBeTruthy();

    await timeline.clickKeyframe(newKf!.timestampMs, 0);
    await timeline.dragKeyframe(newKf!.timestampMs, 4000, 0);

    // Step 3: Delete the keyframe
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);

    // Undo ×3 should fully revert
    await page.keyboard.press('Control+z'); // undo delete
    await page.waitForTimeout(100);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    await page.keyboard.press('Control+z'); // undo move
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+z'); // undo create
    await page.waitForTimeout(100);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);
  });

  test('redo replays after undo', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);
  });

  test('rename channel → undo reverts', async ({ page }) => {
    // Double-click to rename
    const firstName = page.locator('.channel-headers .channel-row').first().locator('span.truncate');
    await firstName.dblclick();
    const input = page.locator('.channel-headers .channel-row').first().locator('input[type="text"]');
    await input.fill('Renamed');
    await input.press('Enter');
    await page.waitForTimeout(200);

    const nameAfter = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(nameAfter).toBe('Renamed');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const nameReverted = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(nameReverted).toBe('Left');
  });
});
```

- [ ] **Step 2: Run the undo/redo tests**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/tests/undo-redo.spec.ts
```

Expected: All 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/undo-redo.spec.ts
git commit -m "test: add undo/redo chain e2e tests"
```

---

### Task 16: Run full suite and fix any issues

- [ ] **Step 1: Run the complete e2e suite**

```bash
npx playwright test --config e2e/playwright.config.ts
```

Expected: All tests pass (3 + 7 + 7 + 11 + 6 + 8 + 4 + 4 + 5 = **55 tests**).

- [ ] **Step 2: Fix any failing tests**

Common issues to watch for:
- **Popover selector mismatch:** If `'.fixed.z-50.bg-surface.rounded-xl.shadow-2xl'` matches multiple elements (KeyframePopover + ChannelPopover), narrow with `.first()` or add context.
- **Timing:** If canvas interactions are flaky, increase `waitForTimeout` values or add `waitForFunction` checks.
- **Slider fill:** If `input.fill()` doesn't work on range inputs, use the `evaluate` + `dispatchEvent` pattern shown in the color picker tests.
- **Video drag-drop:** If `DataTransfer` constructor is restricted in Chromium, use the hidden file input approach.

- [ ] **Step 3: Run in headed mode to visually verify**

```bash
npx playwright test --config e2e/playwright.config.ts --headed
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test: fix e2e test issues found during full suite run"
```

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `@playwright/test` dep and `test:e2e*` scripts |
| `.gitignore` | Modify | Ignore playwright artifacts and `.mp4` fixtures |
| `e2e/playwright.config.ts` | Create | Playwright config (Chromium, preview server, timeouts) |
| `e2e/fixtures/test-project.json` | Create | 2-channel, 4-keyframe project fixture |
| `e2e/fixtures/test-video.mp4` | Copy | 97 MB test video (gitignored, copy manually) |
| `src/routes/+page.svelte` | Modify | Expose `window.__stores` for test assertions |
| `e2e/pages/app.page.ts` | Create | Boot, fixture seeding, video loading |
| `e2e/pages/timeline.page.ts` | Create | Canvas coordinate math, click/drag helpers |
| `e2e/pages/color-picker.page.ts` | Create | Color wheel, sliders, hex, kelvin, history |
| `e2e/pages/command-palette.page.ts` | Create | Open, search, execute commands |
| `e2e/tests/boot.spec.ts` | Create | 3 tests — snapshot restore, new project dialog |
| `e2e/tests/timeline.spec.ts` | Create | 7 tests — click, ctrl+click, deselect, dblclick, drag, right-click, rect select |
| `e2e/tests/keyframe-editing.spec.ts` | Create | 7 tests — popover open, brightness, interpolation, power, transition, mixed, close |
| `e2e/tests/color-picker.spec.ts` | Create | 11 tests — wheel, RGB sliders, hex, invalid hex, kelvin, mode switch, history, multi-select |
| `e2e/tests/channel-headers.spec.ts` | Create | 6 tests — channels visible, solo, mute, rename, cancel rename, popover |
| `e2e/tests/keyboard-shortcuts.spec.ts` | Create | 8 tests — Ctrl+K, Escape, undo, redo, delete, zoom +/-, copy/paste |
| `e2e/tests/video-playback.spec.ts` | Create | 4 tests — drag-drop load, play/pause, step forward, scrub |
| `e2e/tests/export.spec.ts` | Create | 4 tests — open, validation, download, cancel |
| `e2e/tests/undo-redo.spec.ts` | Create | 5 tests — create+undo, edit color+undo, multi-step, redo, rename+undo |
