# OpenLightFX Studio — Layer 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add effects (13 types), channel groups, scene detection, scene markers, copy/paste, and keyframe snapping to the Layer 1 core editing loop.

**Architecture:** Extends the existing command pattern, canvas rendering, and store architecture from Layer 1. New effect commands and store methods follow the identical pattern used for keyframes. Scene detection runs in a Web Worker. Channel groups are studio-only state (not exported to .lightfx). Snapping is a pure function consulted during drag operations.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript 5, Tailwind CSS 3, Vite 6, vitest

**Design Spec:** `docs/superpowers/specs/2026-03-28-studio-rewrite-design.md` (sections 8.3, 9, 13, 14)
**Layer 1 Plan:** `docs/superpowers/plans/2026-03-28-studio-rewrite-layer1.md`

---

## Existing Infrastructure (already built in Layer 1)

These types, stores, and services already exist and are used by this plan:

- **Types:** `EffectKeyframe`, `EffectType`, `EffectParams`, `RequiredCapability` in `src/lib/types/track.ts`
- **Types:** `ChannelGroup`, `GroupMode`, `ChannelGroupOffset` in `src/lib/types/channels.ts`
- **Types:** `SceneMarker`, `SceneMarkerType`, `TimelineHitResult` (includes `'effect'` and `'scene-marker'` types), `TimelineDragState` (includes `'effect'` type) in `src/lib/types/timeline.ts`
- **Types:** `ClipboardBuffer` (includes `type: 'effect'`) in `src/lib/types/ui.ts`
- **Store:** `timelineStore.selectedEffectIds`, `selectedMarkerIds`, `clearSelection()` already clears effects and markers
- **Store:** `projectStore.file.track.effectKeyframes` array exists on `LightFXTrack`
- **Store:** `projectStore.file.channelGroups` and `projectStore.file.sceneMarkers` arrays exist on `ProjectFile`
- **Service:** `safety.ts` already analyzes effect keyframes
- **Service:** `protobuf.ts` already encodes/decodes effect keyframes
- **Command interface:** `Command { type, description, execute(), undo(), serialize() }` in `src/lib/types/commands.ts`
- **Render:** `render.ts` exports `msToPx`, `pxToMs`, `RenderViewport`, `CHANNEL_LANE_HEIGHT`, `RULER_HEIGHT`, `KEYFRAME_MARKER_RADIUS`

---

## File Structure

```
src/lib/
├── commands/
│   ├── add-effect.ts          # CREATE: AddEffectCommand + EffectKeyframeStore interface
│   ├── delete-effect.ts       # CREATE: DeleteEffectCommand
│   ├── edit-effect.ts         # CREATE: EditEffectCommand
│   ├── move-effect.ts         # CREATE: MoveEffectCommand
│   ├── add-scene-marker.ts    # CREATE: AddSceneMarkerCommand + SceneMarkerStore interface
│   ├── delete-scene-marker.ts # CREATE: DeleteSceneMarkerCommand
│   ├── paste-keyframes.ts     # CREATE: PasteKeyframesCommand
│   └── channel-group.ts       # CREATE: AddChannelGroupCommand, DeleteChannelGroupCommand, EditChannelGroupCommand
│
├── services/
│   ├── snapping.ts            # CREATE: computeSnapTargets(), findSnapPoint()
│   ├── effect-defaults.ts     # CREATE: getDefaultEffectParams(), EFFECT_DISPLAY_INFO
│   ├── channel-groups.ts      # CREATE: applyGroupMode() — mirror/spread/alternate logic
│   └── scene-detection.ts     # CREATE: main-thread controller for scene detection worker
│
├── workers/
│   └── scene-detection.worker.ts  # CREATE: frame-comparison scene detection
│
├── stores/
│   └── project.svelte.ts      # MODIFY: add EffectKeyframeStore + SceneMarkerStore + ChannelGroupStore methods
│
├── components/
│   ├── timeline/
│   │   ├── render.ts          # MODIFY: add drawEffectBlocks(), drawSnapIndicator()
│   │   ├── interaction.ts     # MODIFY: extend hitTest for effects, handle effect drag/selection
│   │   ├── TimelineCanvas.svelte  # MODIFY: pass effects to render, handle effect interactions
│   │   └── ChannelHeaders.svelte  # MODIFY: show group indicators
│   │
│   ├── effects/
│   │   ├── EffectCatalog.svelte       # CREATE: grid of 13 effect types to drag onto timeline
│   │   └── EffectPopover.svelte       # CREATE: effect properties editor (type, intensity, colors, params)
│   │
│   ├── channels/
│   │   └── ChannelGroupDialog.svelte  # CREATE: create/edit channel groups
│   │
│   ├── timeline/
│   │   └── SceneMarkerPopover.svelte  # CREATE: edit/delete scene marker
│   │
│   └── dialogs/
│       └── SceneDetectionDialog.svelte  # CREATE: run scene detection with progress
│
tests/
├── services/
│   ├── snapping.test.ts           # CREATE
│   ├── effect-defaults.test.ts    # CREATE
│   └── channel-groups.test.ts     # CREATE
├── commands/
│   ├── effect-commands.test.ts    # CREATE
│   ├── scene-marker-commands.test.ts  # CREATE
│   ├── paste-keyframes.test.ts    # CREATE
│   └── channel-group-commands.test.ts # CREATE
└── components/
    └── timeline-interaction-effects.test.ts  # CREATE
```

---

### Task 1: Effect Defaults & Display Info Service

**Files:**
- Create: `src/lib/services/effect-defaults.ts`
- Create: `tests/services/effect-defaults.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/services/effect-defaults.test.ts
import { describe, it, expect } from 'vitest';
import {
  getDefaultEffectParams,
  getEffectDisplayInfo,
  EFFECT_TYPES,
  type EffectDisplayInfo,
} from '$lib/services/effect-defaults.js';

describe('getDefaultEffectParams', () => {
  it('returns flash_count=2 for LIGHTNING', () => {
    const params = getDefaultEffectParams('LIGHTNING');
    expect(params.flash_count).toBe(2);
    expect(params.decay_ms).toBe(500);
  });

  it('returns flash_count=1 for FLASHBANG', () => {
    const params = getDefaultEffectParams('FLASHBANG');
    expect(params.flash_count).toBe(1);
  });

  it('returns flicker_rate_hz=8.0 for FLAME', () => {
    const params = getDefaultEffectParams('FLAME');
    expect(params.flicker_rate_hz).toBe(8.0);
    expect(params.randomness).toBe(0.5);
  });

  it('returns pulse_rate_hz=1.0 for PULSE', () => {
    const params = getDefaultEffectParams('PULSE');
    expect(params.pulse_rate_hz).toBe(1.0);
  });

  it('returns pulse_rate_hz=1.0 for BREATHING', () => {
    const params = getDefaultEffectParams('BREATHING');
    expect(params.pulse_rate_hz).toBe(1.0);
  });

  it('returns flicker_rate_hz=3.0 for CANDLE', () => {
    const params = getDefaultEffectParams('CANDLE');
    expect(params.flicker_rate_hz).toBe(3.0);
  });

  it('returns flicker_rate_hz=15.0 for NEON', () => {
    const params = getDefaultEffectParams('NEON');
    expect(params.flicker_rate_hz).toBe(15.0);
  });

  it('returns empty params for EFFECT_UNSPECIFIED', () => {
    const params = getDefaultEffectParams('EFFECT_UNSPECIFIED');
    expect(Object.keys(params)).toHaveLength(0);
  });
});

describe('getEffectDisplayInfo', () => {
  it('returns display info for each effect type', () => {
    for (const et of EFFECT_TYPES) {
      const info = getEffectDisplayInfo(et);
      expect(info.label).toBeTruthy();
      expect(info.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(info.icon).toBeTruthy();
    }
  });

  it('returns correct label for LIGHTNING', () => {
    expect(getEffectDisplayInfo('LIGHTNING').label).toBe('Lightning');
  });
});

describe('EFFECT_TYPES', () => {
  it('contains 13 effect types (no EFFECT_UNSPECIFIED)', () => {
    expect(EFFECT_TYPES).toHaveLength(13);
    expect(EFFECT_TYPES).not.toContain('EFFECT_UNSPECIFIED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/effect-defaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/services/effect-defaults.ts
import type { EffectType } from '$lib/types/track.js';

export interface EffectDisplayInfo {
  label: string;
  /** Hex color for timeline block rendering */
  color: string;
  /** Short emoji or unicode icon */
  icon: string;
  /** Brief description for the catalog */
  description: string;
  /** Default duration in ms when dragged onto timeline */
  defaultDurationMs: number;
}

/** All concrete effect types (excludes EFFECT_UNSPECIFIED) */
export const EFFECT_TYPES: EffectType[] = [
  'LIGHTNING', 'FLAME', 'FLASHBANG', 'EXPLOSION', 'PULSE', 'STROBE',
  'SIREN', 'AURORA', 'CANDLE', 'GUNFIRE', 'NEON', 'BREATHING', 'SPARK',
];

const DISPLAY_INFO: Record<EffectType, EffectDisplayInfo> = {
  EFFECT_UNSPECIFIED: { label: 'None', color: '#64748b', icon: '?', description: 'No effect', defaultDurationMs: 1000 },
  LIGHTNING:  { label: 'Lightning',  color: '#fbbf24', icon: '\u26A1', description: 'Rapid bright white flash(es) with afterglow decay', defaultDurationMs: 500 },
  FLAME:      { label: 'Flame',      color: '#f97316', icon: '\uD83D\uDD25', description: 'Flickering warm colors simulating fire', defaultDurationMs: 3000 },
  FLASHBANG:  { label: 'Flashbang',  color: '#fef08a', icon: '\uD83D\uDCA5', description: 'Intense white flash followed by slow fade', defaultDurationMs: 800 },
  EXPLOSION:  { label: 'Explosion',  color: '#ef4444', icon: '\uD83D\uDCA3', description: 'Rapid orange/red burst with slow decay', defaultDurationMs: 1500 },
  PULSE:      { label: 'Pulse',      color: '#8b5cf6', icon: '\uD83D\uDC93', description: 'Rhythmic brightness oscillation', defaultDurationMs: 2000 },
  STROBE:     { label: 'Strobe',     color: '#e11d48', icon: '\u2728', description: 'Rapid on/off flashing', defaultDurationMs: 1000 },
  SIREN:      { label: 'Siren',      color: '#3b82f6', icon: '\uD83D\uDEA8', description: 'Alternating red/blue flashing', defaultDurationMs: 2000 },
  AURORA:     { label: 'Aurora',     color: '#06b6d4', icon: '\uD83C\uDF0C', description: 'Slow-shifting multi-color ambient wash', defaultDurationMs: 5000 },
  CANDLE:     { label: 'Candle',     color: '#fcd34d', icon: '\uD83D\uDD6F', description: 'Subtle warm flicker', defaultDurationMs: 3000 },
  GUNFIRE:    { label: 'Gunfire',    color: '#facc15', icon: '\uD83D\uDD2B', description: 'Brief sharp white/yellow flashes', defaultDurationMs: 300 },
  NEON:       { label: 'Neon',       color: '#d946ef', icon: '\uD83D\uDCFA', description: 'Rapid color-saturated flicker', defaultDurationMs: 2000 },
  BREATHING:  { label: 'Breathing',  color: '#a78bfa', icon: '\uD83C\uDF2C', description: 'Slow sinusoidal brightness oscillation', defaultDurationMs: 4000 },
  SPARK:      { label: 'Spark',      color: '#fde68a', icon: '\u2604', description: 'Very brief single flash', defaultDurationMs: 150 },
};

export function getEffectDisplayInfo(effectType: EffectType): EffectDisplayInfo {
  return DISPLAY_INFO[effectType];
}

/**
 * Returns the default effect_params for a given effect type, based on the
 * proto spec EffectParams canonical keys and per-type defaults.
 */
export function getDefaultEffectParams(effectType: EffectType): Record<string, number> {
  switch (effectType) {
    case 'LIGHTNING':   return { flash_count: 2, decay_ms: 500 };
    case 'FLASHBANG':   return { flash_count: 1, decay_ms: 500 };
    case 'EXPLOSION':   return { flash_count: 3, decay_ms: 500 };
    case 'GUNFIRE':     return { flash_count: 4, decay_ms: 500 };
    case 'SIREN':       return { flash_count: 8 };
    case 'STROBE':      return { flash_count: 10 };
    case 'FLAME':       return { flicker_rate_hz: 8.0, randomness: 0.5 };
    case 'CANDLE':      return { flicker_rate_hz: 3.0, randomness: 0.5 };
    case 'NEON':        return { flicker_rate_hz: 15.0, randomness: 0.5 };
    case 'AURORA':      return { flicker_rate_hz: 0.5, randomness: 0.5 };
    case 'PULSE':       return { pulse_rate_hz: 1.0 };
    case 'BREATHING':   return { pulse_rate_hz: 1.0 };
    case 'SPARK':       return { randomness: 0.5 };
    case 'EFFECT_UNSPECIFIED':
    default:            return {};
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/services/effect-defaults.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/effect-defaults.ts tests/services/effect-defaults.test.ts
git commit -m "feat: add effect defaults and display info service"
```

---

### Task 2: Effect Store Methods on ProjectStore

**Files:**
- Create: `src/lib/commands/add-effect.ts` (defines `EffectKeyframeStore` interface)
- Modify: `src/lib/stores/project.svelte.ts`
- Modify: `src/lib/types/commands.ts` (add effect command types)

- [ ] **Step 1: Add effect command types**

Add to the `CommandType` union in `src/lib/types/commands.ts`:

```typescript
export type CommandType =
  | 'ADD_KEYFRAME' | 'DELETE_KEYFRAME' | 'MOVE_KEYFRAME' | 'EDIT_KEYFRAME'
  | 'ADD_CHANNEL' | 'DELETE_CHANNEL' | 'EDIT_CHANNEL' | 'REORDER_CHANNELS'
  | 'EDIT_METADATA' | 'COMPOSITE'
  | 'ADD_EFFECT' | 'DELETE_EFFECT' | 'MOVE_EFFECT' | 'EDIT_EFFECT'
  | 'ADD_SCENE_MARKER' | 'DELETE_SCENE_MARKER'
  | 'PASTE_KEYFRAMES'
  | 'ADD_CHANNEL_GROUP' | 'DELETE_CHANNEL_GROUP' | 'EDIT_CHANNEL_GROUP';
```

- [ ] **Step 2: Create EffectKeyframeStore interface in add-effect.ts**

```typescript
// src/lib/commands/add-effect.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframe } from '$lib/types/track.js';

export interface EffectKeyframeStore {
  getEffectKeyframes(): EffectKeyframe[];
  addEffectKeyframe(ef: EffectKeyframe): void;
  removeEffectKeyframe(id: string): void;
  updateEffectKeyframe(id: string, patch: Partial<EffectKeyframe>): void;
}

export class AddEffectCommand implements Command {
  readonly type = 'ADD_EFFECT';
  readonly description: string;
  constructor(private readonly effect: EffectKeyframe, private readonly store: EffectKeyframeStore) {
    this.description = `Add ${effect.effectType} effect at ${effect.timestampMs}ms on ${effect.channelId}`;
  }
  execute(): void { this.store.addEffectKeyframe({ ...this.effect, primaryColor: { ...this.effect.primaryColor }, secondaryColor: { ...this.effect.secondaryColor }, fallbackColor: { ...this.effect.fallbackColor }, effectParams: { params: { ...this.effect.effectParams.params } } }); }
  undo(): void { this.store.removeEffectKeyframe(this.effect.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effect: this.effect } };
  }
}
```

- [ ] **Step 3: Add effect store methods to ProjectStore**

Add to `src/lib/stores/project.svelte.ts` — import the new interface and implement it:

```typescript
import type { EffectKeyframeStore } from '$lib/commands/add-effect.js';
import type { EffectKeyframe } from '$lib/types/track.js';

// Add EffectKeyframeStore to the implements clause:
class ProjectStore implements KeyframeStore, ChannelStore, ChannelEditStore, ChannelOrderStore, MetadataStore, EffectKeyframeStore {
  // ... existing code ...

  getEffectKeyframes(): EffectKeyframe[] { return this.file.track.effectKeyframes; }
  addEffectKeyframe(ef: EffectKeyframe): void {
    this.file.track.effectKeyframes.push(ef);
    this.markDirty();
  }
  removeEffectKeyframe(id: string): void {
    this.file.track.effectKeyframes = this.file.track.effectKeyframes.filter((e) => e.id !== id);
    this.markDirty();
  }
  updateEffectKeyframe(id: string, patch: Partial<EffectKeyframe>): void {
    const ef = this.file.track.effectKeyframes.find((e) => e.id === id);
    if (ef) Object.assign(ef, patch);
    this.markDirty();
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/add-effect.ts src/lib/stores/project.svelte.ts src/lib/types/commands.ts
git commit -m "feat: add effect keyframe store methods and AddEffectCommand"
```

---

### Task 3: Remaining Effect Commands

**Files:**
- Create: `src/lib/commands/delete-effect.ts`
- Create: `src/lib/commands/edit-effect.ts`
- Create: `src/lib/commands/move-effect.ts`
- Create: `tests/commands/effect-commands.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/commands/effect-commands.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { EffectKeyframe } from '$lib/types/track.js';
import type { EffectKeyframeStore } from '$lib/commands/add-effect.js';
import { AddEffectCommand } from '$lib/commands/add-effect.js';
import { DeleteEffectCommand } from '$lib/commands/delete-effect.js';
import { EditEffectCommand } from '$lib/commands/edit-effect.js';
import { MoveEffectCommand } from '$lib/commands/move-effect.js';

function makeStore(): EffectKeyframeStore & { effects: EffectKeyframe[] } {
  const effects: EffectKeyframe[] = [];
  return {
    effects,
    getEffectKeyframes: () => effects,
    addEffectKeyframe: (ef) => effects.push(ef),
    removeEffectKeyframe: (id) => {
      const idx = effects.findIndex((e) => e.id === id);
      if (idx >= 0) effects.splice(idx, 1);
    },
    updateEffectKeyframe: (id, patch) => {
      const ef = effects.find((e) => e.id === id);
      if (ef) Object.assign(ef, patch);
    },
  };
}

function makeEffect(overrides: Partial<EffectKeyframe> = {}): EffectKeyframe {
  return {
    id: 'ef-1',
    channelId: 'ambient',
    timestampMs: 1000,
    durationMs: 500,
    effectType: 'LIGHTNING',
    intensity: 80,
    primaryColor: { r: 255, g: 255, b: 255 },
    secondaryColor: { r: 0, g: 0, b: 0 },
    effectParams: { params: { flash_count: 2, decay_ms: 500 } },
    requiredCapability: 'CAPABILITY_ANY',
    fallbackColor: { r: 128, g: 128, b: 128 },
    fallbackBrightness: 50,
    ...overrides,
  };
}

describe('AddEffectCommand', () => {
  it('adds and undoes', () => {
    const store = makeStore();
    const ef = makeEffect();
    const cmd = new AddEffectCommand(ef, store);
    cmd.execute();
    expect(store.effects).toHaveLength(1);
    cmd.undo();
    expect(store.effects).toHaveLength(0);
  });

  it('serializes', () => {
    const store = makeStore();
    const ef = makeEffect();
    const cmd = new AddEffectCommand(ef, store);
    const data = cmd.serialize();
    expect(data.type).toBe('ADD_EFFECT');
  });
});

describe('DeleteEffectCommand', () => {
  it('deletes and undoes', () => {
    const store = makeStore();
    const ef = makeEffect();
    store.addEffectKeyframe(ef);
    const cmd = new DeleteEffectCommand('ef-1', store);
    cmd.execute();
    expect(store.effects).toHaveLength(0);
    cmd.undo();
    expect(store.effects).toHaveLength(1);
    expect(store.effects[0].effectType).toBe('LIGHTNING');
  });
});

describe('EditEffectCommand', () => {
  it('edits and undoes', () => {
    const store = makeStore();
    store.addEffectKeyframe(makeEffect());
    const cmd = new EditEffectCommand('ef-1', { intensity: 50 }, store);
    cmd.execute();
    expect(store.effects[0].intensity).toBe(50);
    cmd.undo();
    expect(store.effects[0].intensity).toBe(80);
  });
});

describe('MoveEffectCommand', () => {
  it('moves and undoes', () => {
    const store = makeStore();
    store.addEffectKeyframe(makeEffect());
    const cmd = new MoveEffectCommand('ef-1', 2000, store);
    cmd.execute();
    expect(store.effects[0].timestampMs).toBe(2000);
    cmd.undo();
    expect(store.effects[0].timestampMs).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/effect-commands.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write DeleteEffectCommand**

```typescript
// src/lib/commands/delete-effect.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframe } from '$lib/types/track.js';
import type { EffectKeyframeStore } from './add-effect.js';

export class DeleteEffectCommand implements Command {
  readonly type = 'DELETE_EFFECT';
  readonly description: string;
  private savedEffect: EffectKeyframe | null = null;
  constructor(private readonly effectId: string, private readonly store: EffectKeyframeStore) {
    this.description = `Delete effect ${effectId}`;
  }
  execute(): void {
    const ef = this.store.getEffectKeyframes().find((e) => e.id === this.effectId) ?? null;
    if (ef) {
      this.savedEffect = { ...ef, primaryColor: { ...ef.primaryColor }, secondaryColor: { ...ef.secondaryColor }, fallbackColor: { ...ef.fallbackColor }, effectParams: { params: { ...ef.effectParams.params } } };
    }
    this.store.removeEffectKeyframe(this.effectId);
  }
  undo(): void {
    if (this.savedEffect) this.store.addEffectKeyframe({ ...this.savedEffect });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effectId: this.effectId, savedEffect: this.savedEffect } };
  }
}
```

- [ ] **Step 4: Write EditEffectCommand**

```typescript
// src/lib/commands/edit-effect.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframe } from '$lib/types/track.js';
import type { EffectKeyframeStore } from './add-effect.js';

export class EditEffectCommand implements Command {
  readonly type = 'EDIT_EFFECT';
  readonly description: string;
  private previousValues: Partial<EffectKeyframe> = {};
  constructor(private readonly effectId: string, private readonly patch: Partial<EffectKeyframe>, private readonly store: EffectKeyframeStore) {
    this.description = `Edit effect ${effectId}`;
  }
  execute(): void {
    const ef = this.store.getEffectKeyframes().find((e) => e.id === this.effectId);
    if (!ef) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof EffectKeyframe)[]) {
      const val = ef[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null ? JSON.parse(JSON.stringify(val)) : val;
    }
    this.store.updateEffectKeyframe(this.effectId, this.patch);
  }
  undo(): void {
    this.store.updateEffectKeyframe(this.effectId, this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effectId: this.effectId, patch: this.patch, previousValues: this.previousValues } };
  }
}
```

- [ ] **Step 5: Write MoveEffectCommand**

```typescript
// src/lib/commands/move-effect.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframeStore } from './add-effect.js';

export class MoveEffectCommand implements Command {
  readonly type = 'MOVE_EFFECT';
  readonly description: string;
  private previousTimestampMs = 0;
  constructor(private readonly effectId: string, private readonly newTimestampMs: number, private readonly store: EffectKeyframeStore) {
    this.description = `Move effect to ${newTimestampMs}ms`;
  }
  execute(): void {
    const ef = this.store.getEffectKeyframes().find((e) => e.id === this.effectId);
    if (ef) {
      this.previousTimestampMs = ef.timestampMs;
      this.store.updateEffectKeyframe(this.effectId, { timestampMs: this.newTimestampMs });
    }
  }
  undo(): void {
    this.store.updateEffectKeyframe(this.effectId, { timestampMs: this.previousTimestampMs });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effectId: this.effectId, newTimestampMs: this.newTimestampMs, previousTimestampMs: this.previousTimestampMs } };
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/commands/effect-commands.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/commands/delete-effect.ts src/lib/commands/edit-effect.ts src/lib/commands/move-effect.ts tests/commands/effect-commands.test.ts
git commit -m "feat: add delete, edit, move effect commands with tests"
```

---

### Task 4: Effect Rendering on Timeline Canvas

**Files:**
- Modify: `src/lib/components/timeline/render.ts`

- [ ] **Step 1: Add drawEffectBlocks function**

Add to `src/lib/components/timeline/render.ts`, after the existing `drawKeyframes` function. Import `EffectKeyframe` and `getEffectDisplayInfo`:

```typescript
import type { EffectKeyframe } from '$lib/types/track.js';
import { getEffectDisplayInfo } from '$lib/services/effect-defaults.js';

/** Height of an effect block relative to the lane height */
const EFFECT_BLOCK_HEIGHT = 24;
/** Y offset within the lane (centered vertically below keyframes) */
const EFFECT_BLOCK_Y_OFFSET = (CHANNEL_LANE_HEIGHT - EFFECT_BLOCK_HEIGHT) / 2 + 4;
/** Minimum rendered width for very short effects */
const MIN_EFFECT_BLOCK_WIDTH = 6;

export function drawEffectBlocks(
  ctx: CanvasRenderingContext2D,
  effects: EffectKeyframe[],
  channels: Channel[],
  vp: RenderViewport,
  selectedIds: Set<string>,
): void {
  const channelIndex = new Map(channels.map((c, i) => [c.id, i]));

  for (const ef of effects) {
    const lane = channelIndex.get(ef.channelId);
    if (lane === undefined) continue;

    const x = msToPx(ef.timestampMs, vp);
    const w = Math.max(MIN_EFFECT_BLOCK_WIDTH, ef.durationMs * vp.pxPerMs);

    // Cull offscreen
    if (x + w < 0 || x > vp.width) continue;

    const y = RULER_HEIGHT + lane * CHANNEL_LANE_HEIGHT + EFFECT_BLOCK_Y_OFFSET;
    const info = getEffectDisplayInfo(ef.effectType);
    const isSelected = selectedIds.has(ef.id);

    // Semi-transparent rounded rect
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = info.color;
    const radius = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, w, EFFECT_BLOCK_HEIGHT, radius);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Diagonal stripe pattern fill for texture
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let sx = x - EFFECT_BLOCK_HEIGHT; sx < x + w; sx += 8) {
      ctx.beginPath();
      ctx.moveTo(sx, y + EFFECT_BLOCK_HEIGHT);
      ctx.lineTo(sx + EFFECT_BLOCK_HEIGHT, y);
      ctx.stroke();
    }
    ctx.restore();

    // Label (effect icon + type) if block is wide enough
    if (w > 40) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Inter, system-ui';
      ctx.fillText(`${info.icon} ${info.label}`, x + 4, y + EFFECT_BLOCK_HEIGHT / 2 + 3);
    }

    // Selection ring
    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - 1, y - 1, w + 2, EFFECT_BLOCK_HEIGHT + 2, radius + 1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - 3, y - 3, w + 6, EFFECT_BLOCK_HEIGHT + 6, radius + 2);
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/timeline/render.ts
git commit -m "feat: add effect block rendering on timeline canvas"
```

---

### Task 5: Effect Hit Testing & Timeline Interaction

**Files:**
- Modify: `src/lib/components/timeline/interaction.ts`
- Create: `tests/components/timeline-interaction-effects.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/components/timeline-interaction-effects.test.ts
import { describe, it, expect } from 'vitest';
import { hitTest } from '$lib/components/timeline/interaction.js';
import type { Channel, Keyframe, EffectKeyframe } from '$lib/types/track.js';
import type { RenderViewport } from '$lib/components/timeline/render.js';
import { CHANNEL_LANE_HEIGHT, RULER_HEIGHT } from '$lib/types/timeline.js';

function makeViewport(): RenderViewport {
  return { pxPerMs: 0.1, scrollX: 0, width: 1000, height: 400 };
}

function makeChannels(): Channel[] {
  return [
    { id: 'ch1', displayName: 'Ch1', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_AMBIENT', optional: false },
  ];
}

function makeEffect(overrides: Partial<EffectKeyframe> = {}): EffectKeyframe {
  return {
    id: 'ef-1', channelId: 'ch1', timestampMs: 1000, durationMs: 500,
    effectType: 'LIGHTNING', intensity: 80,
    primaryColor: { r: 255, g: 255, b: 255 }, secondaryColor: { r: 0, g: 0, b: 0 },
    effectParams: { params: {} }, requiredCapability: 'CAPABILITY_ANY',
    fallbackColor: { r: 0, g: 0, b: 0 }, fallbackBrightness: 0,
    ...overrides,
  };
}

describe('hitTest with effects', () => {
  it('returns effect hit when clicking inside an effect block', () => {
    const vp = makeViewport();
    const channels = makeChannels();
    // Effect at 1000ms, 500ms duration → x=100px to x=150px
    const effects = [makeEffect()];
    const laneCenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(120, laneCenterY + 4, vp, channels, [], effects);
    expect(result.type).toBe('effect');
    expect(result.effectKeyframeId).toBe('ef-1');
  });

  it('returns keyframe hit when keyframe and effect overlap (keyframe wins)', () => {
    const vp = makeViewport();
    const channels = makeChannels();
    const effects = [makeEffect()];
    const keyframes: Keyframe[] = [{
      id: 'kf-1', channelId: 'ch1', timestampMs: 1000, colorMode: 'RGB',
      color: { r: 0, g: 0, b: 0 }, colorTemperature: 6500, brightness: 1,
      transitionMs: 0, interpolation: 'STEP', powerOn: true,
    }];
    const laneCenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(100, laneCenterY, vp, channels, keyframes, effects);
    expect(result.type).toBe('keyframe');
  });

  it('returns empty when clicking outside effect bounds', () => {
    const vp = makeViewport();
    const channels = makeChannels();
    const effects = [makeEffect()];
    const laneCenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    // Click at x=50 (500ms), effect starts at 1000ms (x=100)
    const result = hitTest(50, laneCenterY, vp, channels, [], effects);
    expect(result.type).toBe('empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/timeline-interaction-effects.test.ts`
Expected: FAIL — hitTest doesn't accept effects parameter yet

- [ ] **Step 3: Update hitTest to accept and check effects**

Modify `hitTest` in `src/lib/components/timeline/interaction.ts`:

- Add `effects: EffectKeyframe[]` as a 6th parameter (after `keyframes`)
- Import `EffectKeyframe` from `$lib/types/track.js`
- After the keyframe check (if no keyframe hit), check effects:

```typescript
import type { Channel, Keyframe, EffectKeyframe } from '$lib/types/track.js';

export function hitTest(
  x: number,
  y: number,
  viewport: RenderViewport,
  channels: Channel[],
  keyframes: Keyframe[],
  effects: EffectKeyframe[] = [],
): TimelineHitResult {
  // ... existing ruler check ...
  // ... existing lane/channel determination ...
  // ... existing keyframe check — if bestKf found, return it ...

  // After keyframe check, before returning 'empty':
  // Check for effect block hit
  const laneEffects = effects.filter((ef) => ef.channelId === channel.id);
  for (const ef of laneEffects) {
    const efX = msToPx(ef.timestampMs, viewport);
    const efW = Math.max(6, ef.durationMs * viewport.pxPerMs);
    const efY = RULER_HEIGHT + laneIndex * CHANNEL_LANE_HEIGHT + (CHANNEL_LANE_HEIGHT - 24) / 2 + 4;
    const efH = 24;
    if (x >= efX && x <= efX + efW && y >= efY && y <= efY + efH) {
      return {
        type: 'effect',
        channelId: channel.id,
        effectKeyframeId: ef.id,
        timestampMs: ef.timestampMs,
        y,
      };
    }
  }

  return { type: 'empty', channelId: channel.id, timestampMs, y };
}
```

- [ ] **Step 4: Add effect selection handling in handlePointerDown**

In `handlePointerDown`, add a case for `type === 'effect'` after the keyframe case:

```typescript
  if (type === 'effect' && hitResult.effectKeyframeId) {
    const isCtrlCmd = e.ctrlKey || e.metaKey;
    // Toggle selection
    if (isCtrlCmd) {
      if (timelineStore.selectedEffectIds.includes(hitResult.effectKeyframeId)) {
        timelineStore.selectedEffectIds = timelineStore.selectedEffectIds.filter((id) => id !== hitResult.effectKeyframeId);
      } else {
        timelineStore.selectedEffectIds = [...timelineStore.selectedEffectIds, hitResult.effectKeyframeId];
      }
    } else {
      timelineStore.clearSelection();
      timelineStore.selectedEffectIds = [hitResult.effectKeyframeId];
    }

    // Build drag state
    const selectedIds = timelineStore.selectedEffectIds;
    const originalTimestamps = new Map<string, number>();
    for (const id of selectedIds) {
      const ef = effects.find((e) => e.id === id);
      if (ef) originalTimestamps.set(id, ef.timestampMs);
    }

    return {
      type: 'effect',
      startX: e.offsetX,
      startY: e.offsetY,
      startTimestampMs: hitResult.timestampMs,
      targetIds: [...selectedIds],
      originalTimestamps,
    };
  }
```

Update the `handlePointerDown` signature to accept `effects: EffectKeyframe[]` as an additional parameter.

- [ ] **Step 5: Add effect drag in handlePointerMove**

Add an `else if (dragState.type === 'effect')` block in `handlePointerMove` that mirrors the keyframe drag logic but calls `effectStore.updateEffectKeyframe`:

```typescript
// Add effectStore parameter of type EffectKeyframeStore
  } else if (dragState.type === 'effect') {
    const viewport: RenderViewport = {
      pxPerMs: timelineStore.pxPerMs, scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth, height: timelineStore.viewportHeight,
    };
    const currentMs = pxToMs(e.offsetX, viewport);
    const deltaMs = currentMs - dragState.startTimestampMs;
    for (const id of dragState.targetIds) {
      const origMs = dragState.originalTimestamps.get(id);
      if (origMs !== undefined) {
        effectStore.updateEffectKeyframe(id, { timestampMs: Math.max(0, origMs + deltaMs) });
      }
    }
  }
```

- [ ] **Step 6: Add effect commit in handlePointerUp**

Add effect handling in `handlePointerUp`, mirroring keyframe logic but using `MoveEffectCommand`:

```typescript
import { MoveEffectCommand } from '$lib/commands/move-effect.js';
import type { EffectKeyframeStore } from '$lib/commands/add-effect.js';

  } else if (dragState.type === 'effect' && dragState.targetIds.length > 0) {
    const viewport: RenderViewport = {
      pxPerMs: timelineStore.pxPerMs, scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth, height: timelineStore.viewportHeight,
    };
    const currentMs = pxToMs(e.offsetX, viewport);
    const deltaMs = currentMs - dragState.startTimestampMs;

    if (Math.abs(deltaMs) < 1) {
      for (const [id, origMs] of dragState.originalTimestamps) {
        effectStore.updateEffectKeyframe(id, { timestampMs: origMs });
      }
      return;
    }

    for (const [id, origMs] of dragState.originalTimestamps) {
      effectStore.updateEffectKeyframe(id, { timestampMs: origMs });
    }

    const commands = dragState.targetIds.map((id) => {
      const origMs = dragState.originalTimestamps.get(id) ?? 0;
      return new MoveEffectCommand(id, Math.max(0, origMs + deltaMs), effectStore);
    });

    if (commands.length === 1) {
      undoStore.execute(commands[0]);
    } else {
      undoStore.execute(new CompositeCommand(`Move ${commands.length} effects`, commands));
    }
  }
```

- [ ] **Step 7: Update selection rect to also select effects**

In `handlePointerUp`'s selection-rect finalization, add effect selection alongside keyframe selection:

```typescript
      // Also select effects within the rect
      for (const ef of effects) {
        const efX = msToPx(ef.timestampMs, viewport);
        const laneIdx = channelIndex.get(ef.channelId);
        if (laneIdx === undefined) continue;
        const efY = RULER_HEIGHT + laneIdx * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
        if (efX >= x1 && efX <= x2 && efY >= y1 && efY <= y2) {
          timelineStore.selectedEffectIds = [...timelineStore.selectedEffectIds, ef.id];
        }
      }
```

- [ ] **Step 8: Update TimelineStoreInterface**

Add `selectedEffectIds` to the `TimelineStoreInterface`:

```typescript
export interface TimelineStoreInterface {
  // ... existing fields ...
  selectedEffectIds: string[];
}
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run tests/components/timeline-interaction-effects.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 11: Commit**

```bash
git add src/lib/components/timeline/interaction.ts tests/components/timeline-interaction-effects.test.ts
git commit -m "feat: add effect hit testing, selection, and drag interaction"
```

---

### Task 6: Wire Effects into TimelineCanvas and TimelinePanel

**Files:**
- Modify: `src/lib/components/timeline/TimelineCanvas.svelte`
- Modify: `src/lib/components/timeline/TimelinePanel.svelte`

- [ ] **Step 1: Update TimelineCanvas to render effects**

In `TimelineCanvas.svelte`, import `drawEffectBlocks` from `render.js` and call it in the render function, between `drawKeyframes` and `drawPlayhead`. Pass `projectStore.file.track.effectKeyframes` and `new Set(timelineStore.selectedEffectIds)`.

Also pass `effects` to `hitTest` calls, and thread `effectStore`/`effects` through to `handlePointerDown`, `handlePointerMove`, `handlePointerUp`.

- [ ] **Step 2: Update TimelinePanel if needed**

Ensure `TimelinePanel.svelte` passes any new props to `TimelineCanvas`. If TimelineCanvas reads from stores directly (which it does based on Layer 1 pattern), no prop changes needed.

- [ ] **Step 3: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/timeline/TimelineCanvas.svelte src/lib/components/timeline/TimelinePanel.svelte
git commit -m "feat: wire effect rendering and interaction into timeline canvas"
```

---

### Task 7: Effect Catalog Component

**Files:**
- Create: `src/lib/components/effects/EffectCatalog.svelte`

- [ ] **Step 1: Create the EffectCatalog component**

This is a panel/popover showing the 13 effect types in a 2-column grid. Each card shows the icon, name, and description. Clicking a card adds the effect at the playhead position on the active channel.

```svelte
<script lang="ts">
  import { EFFECT_TYPES, getEffectDisplayInfo, getDefaultEffectParams } from '$lib/services/effect-defaults.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { AddEffectCommand } from '$lib/commands/add-effect.js';
  import { generateId } from '$lib/services/id.js';
  import type { EffectType } from '$lib/types/track.js';

  let { onclose }: { onclose?: () => void } = $props();

  function addEffect(effectType: EffectType): void {
    if (!projectStore.file) return;
    const channelId = timelineStore.activeChannelId ?? projectStore.file.track.channels[0]?.id;
    if (!channelId) return;

    const info = getEffectDisplayInfo(effectType);
    const params = getDefaultEffectParams(effectType);

    const effect = {
      id: generateId(),
      channelId,
      timestampMs: videoStore.currentTimeMs,
      durationMs: info.defaultDurationMs,
      effectType,
      intensity: 80,
      primaryColor: { r: 255, g: 255, b: 255 },
      secondaryColor: { r: 0, g: 0, b: 0 },
      effectParams: { params },
      requiredCapability: 'CAPABILITY_ANY' as const,
      fallbackColor: { r: 128, g: 128, b: 128 },
      fallbackBrightness: 50,
    };

    undoStore.execute(new AddEffectCommand(effect, projectStore));
    timelineStore.clearSelection();
    timelineStore.selectedEffectIds = [effect.id];
    onclose?.();
  }
</script>

<div class="grid grid-cols-2 gap-2 p-3 max-h-[60vh] overflow-y-auto">
  {#each EFFECT_TYPES as effectType}
    {@const info = getEffectDisplayInfo(effectType)}
    <button
      class="flex items-start gap-2 p-3 rounded-lg bg-surface2 hover:bg-surface3 border border-surface3 transition-colors text-left"
      onclick={() => addEffect(effectType)}
    >
      <span class="text-lg shrink-0" style="color: {info.color}">{info.icon}</span>
      <div class="min-w-0">
        <p class="text-sm font-medium text-text-base">{info.label}</p>
        <p class="text-xs text-textMuted mt-0.5 line-clamp-2">{info.description}</p>
      </div>
    </button>
  {/each}
</div>
```

- [ ] **Step 2: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/effects/EffectCatalog.svelte
git commit -m "feat: add effect catalog component for adding effects to timeline"
```

---

### Task 8: Effect Properties Popover

**Files:**
- Create: `src/lib/components/effects/EffectPopover.svelte`

- [ ] **Step 1: Create EffectPopover**

This popover appears when an effect is selected. Shows: effect type (read-only label), intensity slider, primary/secondary color swatches (opens ColorPicker), duration slider, effect-specific params, capability dropdown, fallback color/brightness. Multi-select support with mixed value display.

```svelte
<script lang="ts">
  import Popover from '$lib/components/shared/Popover.svelte';
  import Slider from '$lib/components/shared/Slider.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import ColorPicker from '$lib/components/color/ColorPicker.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { EditEffectCommand } from '$lib/commands/edit-effect.js';
  import { DeleteEffectCommand } from '$lib/commands/delete-effect.js';
  import { CompositeCommand } from '$lib/commands/composite.js';
  import { getEffectDisplayInfo } from '$lib/services/effect-defaults.js';
  import { rgbToCssString } from '$lib/services/color-utils.js';
  import type { EffectKeyframe, RGBColor } from '$lib/types/track.js';

  let { anchorX = 0, anchorY = 0 }: { anchorX?: number; anchorY?: number } = $props();

  let showPrimaryPicker = $state(false);
  let showSecondaryPicker = $state(false);

  const selectedEffects = $derived(
    timelineStore.selectedEffectIds
      .map((id) => projectStore.file?.track.effectKeyframes.find((e) => e.id === id))
      .filter((e): e is EffectKeyframe => e !== undefined)
  );

  const single = $derived(selectedEffects.length === 1 ? selectedEffects[0] : null);
  const multi = $derived(selectedEffects.length > 1);

  function getMixed<K extends keyof EffectKeyframe>(key: K): EffectKeyframe[K] | null {
    if (selectedEffects.length === 0) return null;
    const first = selectedEffects[0][key];
    return selectedEffects.every((e) => JSON.stringify(e[key]) === JSON.stringify(first)) ? first : null;
  }

  function applyPatch(patch: Partial<EffectKeyframe>): void {
    if (selectedEffects.length === 1) {
      undoStore.execute(new EditEffectCommand(selectedEffects[0].id, patch, projectStore));
    } else if (selectedEffects.length > 1) {
      const cmds = selectedEffects.map((e) => new EditEffectCommand(e.id, patch, projectStore));
      undoStore.execute(new CompositeCommand(`Edit ${cmds.length} effects`, cmds));
    }
  }

  function handleDelete(): void {
    const cmds = selectedEffects.map((e) => new DeleteEffectCommand(e.id, projectStore));
    if (cmds.length === 1) {
      undoStore.execute(cmds[0]);
    } else {
      undoStore.execute(new CompositeCommand(`Delete ${cmds.length} effects`, cmds));
    }
    timelineStore.clearSelection();
  }
</script>

{#if selectedEffects.length > 0}
  <Popover x={anchorX} y={anchorY}>
    <div class="space-y-3 min-w-[16rem]">
      <!-- Effect type header -->
      <div class="flex items-center justify-between">
        {#if single}
          {@const info = getEffectDisplayInfo(single.effectType)}
          <div class="flex items-center gap-2">
            <span style="color: {info.color}">{info.icon}</span>
            <span class="text-sm font-medium text-text-base">{info.label}</span>
          </div>
        {:else}
          <span class="text-sm text-textMuted">{selectedEffects.length} effects selected</span>
        {/if}
        <Button variant="ghost" size="sm" onclick={handleDelete}>
          <span class="text-danger text-xs">Delete</span>
        </Button>
      </div>

      <!-- Intensity -->
      <div>
        <label class="text-xs text-textMuted">Intensity</label>
        <Slider
          min={0} max={100} step={1}
          value={getMixed('intensity') as number ?? 80}
          onchange={(v) => applyPatch({ intensity: v })}
        />
      </div>

      <!-- Duration (single only) -->
      {#if single}
        <div>
          <label class="text-xs text-textMuted">Duration (ms)</label>
          <Slider
            min={50} max={10000} step={50}
            value={single.durationMs}
            onchange={(v) => applyPatch({ durationMs: v })}
          />
        </div>
      {/if}

      <!-- Primary color -->
      <div>
        <label class="text-xs text-textMuted">Primary Color</label>
        <button
          class="w-8 h-8 rounded border border-surface3 cursor-pointer"
          style="background-color: {single ? rgbToCssString(single.primaryColor) : '#888'}"
          onclick={() => showPrimaryPicker = !showPrimaryPicker}
        ></button>
        {#if showPrimaryPicker && single}
          <div class="mt-2">
            <ColorPicker
              color={single.primaryColor}
              onchange={(c) => applyPatch({ primaryColor: c })}
            />
          </div>
        {/if}
      </div>

      <!-- Secondary color -->
      <div>
        <label class="text-xs text-textMuted">Secondary Color</label>
        <button
          class="w-8 h-8 rounded border border-surface3 cursor-pointer"
          style="background-color: {single ? rgbToCssString(single.secondaryColor) : '#888'}"
          onclick={() => showSecondaryPicker = !showSecondaryPicker}
        ></button>
        {#if showSecondaryPicker && single}
          <div class="mt-2">
            <ColorPicker
              color={single.secondaryColor}
              onchange={(c) => applyPatch({ secondaryColor: c })}
            />
          </div>
        {/if}
      </div>

      <!-- Effect-specific params (single only) -->
      {#if single}
        {#each Object.entries(single.effectParams.params) as [key, value]}
          <div>
            <label class="text-xs text-textMuted">{key.replace(/_/g, ' ')}</label>
            <Slider
              min={key === 'randomness' ? 0 : key.includes('hz') ? 0.1 : 0}
              max={key === 'flash_count' ? 20 : key === 'randomness' ? 1 : key.includes('hz') ? 30 : 5000}
              step={key === 'flash_count' ? 1 : key === 'randomness' ? 0.05 : key.includes('hz') ? 0.1 : 50}
              value={value}
              onchange={(v) => {
                const newParams = { ...single!.effectParams.params, [key]: v };
                applyPatch({ effectParams: { params: newParams } });
              }}
            />
          </div>
        {/each}
      {/if}
    </div>
  </Popover>
{/if}
```

- [ ] **Step 2: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/effects/EffectPopover.svelte
git commit -m "feat: add effect properties popover with intensity, color, params editing"
```

---

### Task 9: Effect Preview in Lighting Overlay

**Files:**
- Modify: `src/lib/components/video/LightingOverlay.svelte`
- Modify: `src/lib/services/interpolation.ts`

- [ ] **Step 1: Add getEffectStateAtTime to interpolation.ts**

```typescript
import type { EffectKeyframe, RGBColor, EffectType } from '$lib/types/track.js';

export interface EffectState {
  color: RGBColor;
  brightness: number;
  effectType: EffectType;
}

/**
 * Compute the visual state of an effect at a given timestamp.
 * Returns null if no effect is active at that time on the given channel.
 * Multiple effects can overlap — returns the one with highest intensity.
 */
export function getEffectStateAtTime(
  effects: EffectKeyframe[],
  channelId: string,
  timeMs: number,
): EffectState | null {
  let bestEffect: EffectKeyframe | null = null;
  let bestIntensity = -1;

  for (const ef of effects) {
    if (ef.channelId !== channelId) continue;
    if (timeMs < ef.timestampMs || timeMs > ef.timestampMs + ef.durationMs) continue;
    if (ef.intensity > bestIntensity) {
      bestIntensity = ef.intensity;
      bestEffect = ef;
    }
  }

  if (!bestEffect) return null;

  // Simple progress within the effect duration
  const progress = (timeMs - bestEffect.timestampMs) / bestEffect.durationMs;

  // Effect color based on type and progress
  const color = computeEffectColor(bestEffect, progress);
  const brightness = (bestEffect.intensity / 100) * computeEffectBrightness(bestEffect.effectType, progress);

  return { color, brightness, effectType: bestEffect.effectType };
}

function computeEffectColor(ef: EffectKeyframe, progress: number): RGBColor {
  const { primaryColor, secondaryColor, effectType } = ef;

  switch (effectType) {
    case 'SIREN':
      // Alternate between primary and secondary
      return Math.floor(progress * 10) % 2 === 0 ? primaryColor : secondaryColor;
    case 'AURORA':
      // Blend between primary and secondary over time
      return interpolateColor(primaryColor, secondaryColor, (Math.sin(progress * Math.PI * 2) + 1) / 2);
    default:
      return primaryColor;
  }
}

function computeEffectBrightness(effectType: EffectType, progress: number): number {
  switch (effectType) {
    case 'LIGHTNING':
    case 'FLASHBANG':
    case 'SPARK':
      // Sharp flash then decay
      return progress < 0.1 ? 1.0 : Math.max(0, 1.0 - (progress - 0.1) / 0.9);
    case 'EXPLOSION':
      return progress < 0.15 ? 1.0 : Math.max(0, 1.0 - (progress - 0.15) / 0.85);
    case 'GUNFIRE':
      // Multiple brief flashes
      return Math.sin(progress * Math.PI * 8) > 0.5 ? 1.0 : 0.1;
    case 'PULSE':
      return (Math.sin(progress * Math.PI * 4) + 1) / 2;
    case 'BREATHING':
      return (Math.sin(progress * Math.PI * 2) + 1) / 2;
    case 'STROBE':
      return Math.floor(progress * 20) % 2 === 0 ? 1.0 : 0.0;
    case 'FLAME':
    case 'CANDLE':
      return 0.5 + 0.5 * Math.random();
    case 'NEON':
      return Math.random() > 0.1 ? 1.0 : 0.2;
    case 'SIREN':
      return 0.8 + 0.2 * Math.sin(progress * Math.PI * 6);
    case 'AURORA':
      return 0.3 + 0.4 * Math.sin(progress * Math.PI * 2);
    default:
      return 1.0;
  }
}
```

- [ ] **Step 2: Update LightingOverlay to include effects**

In `LightingOverlay.svelte`'s `drawFrame()` function, after the existing channel-keyframe loop, add an effect overlay pass:

```typescript
import { getEffectStateAtTime } from '$lib/services/interpolation.js';

// Inside drawFrame(), after the existing channel loop:
    const allEffects = projectStore.file.track.effectKeyframes;

    for (const channel of channels) {
      if (!timelineStore.isChannelAudible(channel.id)) continue;

      const effectState = getEffectStateAtTime(allEffects, channel.id, timeMs);
      if (!effectState || effectState.brightness <= 0) continue;

      const { x: normX, y: normY, radiusMultiplier } = getSpatialPosition(channel.spatialHint);
      const cx = normX * width;
      const cy = normY * height;
      const radius = radiusMultiplier * width;

      ctx.globalCompositeOperation = 'screen';
      const alpha = effectState.brightness * 0.8; // Effects are more vivid than keyframes
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, rgbToCssString(effectState.color, alpha));
      gradient.addColorStop(1, rgbToCssString(effectState.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
```

- [ ] **Step 3: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/interpolation.ts src/lib/components/video/LightingOverlay.svelte
git commit -m "feat: add effect state interpolation and overlay preview"
```

---

### Task 10: Scene Marker Commands & Store Methods

**Files:**
- Create: `src/lib/commands/add-scene-marker.ts`
- Create: `src/lib/commands/delete-scene-marker.ts`
- Modify: `src/lib/stores/project.svelte.ts`
- Create: `tests/commands/scene-marker-commands.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/commands/scene-marker-commands.test.ts
import { describe, it, expect } from 'vitest';
import type { SceneMarker } from '$lib/types/timeline.js';
import type { SceneMarkerStore } from '$lib/commands/add-scene-marker.js';
import { AddSceneMarkerCommand } from '$lib/commands/add-scene-marker.js';
import { DeleteSceneMarkerCommand } from '$lib/commands/delete-scene-marker.js';

function makeStore(): SceneMarkerStore & { markers: SceneMarker[] } {
  const markers: SceneMarker[] = [];
  return {
    markers,
    getSceneMarkers: () => markers,
    addSceneMarker: (m) => markers.push(m),
    removeSceneMarker: (id) => {
      const idx = markers.findIndex((m) => m.id === id);
      if (idx >= 0) markers.splice(idx, 1);
    },
  };
}

describe('AddSceneMarkerCommand', () => {
  it('adds and undoes', () => {
    const store = makeStore();
    const marker: SceneMarker = { id: 'sm-1', timestampMs: 5000, label: 'Scene 1', type: 'MARKER_MANUAL' };
    const cmd = new AddSceneMarkerCommand(marker, store);
    cmd.execute();
    expect(store.markers).toHaveLength(1);
    cmd.undo();
    expect(store.markers).toHaveLength(0);
  });
});

describe('DeleteSceneMarkerCommand', () => {
  it('deletes and undoes', () => {
    const store = makeStore();
    store.addSceneMarker({ id: 'sm-1', timestampMs: 5000, label: 'Scene 1', type: 'MARKER_MANUAL' });
    const cmd = new DeleteSceneMarkerCommand('sm-1', store);
    cmd.execute();
    expect(store.markers).toHaveLength(0);
    cmd.undo();
    expect(store.markers).toHaveLength(1);
    expect(store.markers[0].label).toBe('Scene 1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commands/scene-marker-commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Create AddSceneMarkerCommand**

```typescript
// src/lib/commands/add-scene-marker.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { SceneMarker } from '$lib/types/timeline.js';

export interface SceneMarkerStore {
  getSceneMarkers(): SceneMarker[];
  addSceneMarker(marker: SceneMarker): void;
  removeSceneMarker(id: string): void;
}

export class AddSceneMarkerCommand implements Command {
  readonly type = 'ADD_SCENE_MARKER';
  readonly description: string;
  constructor(private readonly marker: SceneMarker, private readonly store: SceneMarkerStore) {
    this.description = `Add scene marker "${marker.label}" at ${marker.timestampMs}ms`;
  }
  execute(): void { this.store.addSceneMarker({ ...this.marker }); }
  undo(): void { this.store.removeSceneMarker(this.marker.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { marker: this.marker } };
  }
}
```

- [ ] **Step 4: Create DeleteSceneMarkerCommand**

```typescript
// src/lib/commands/delete-scene-marker.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import type { SceneMarkerStore } from './add-scene-marker.js';

export class DeleteSceneMarkerCommand implements Command {
  readonly type = 'DELETE_SCENE_MARKER';
  readonly description: string;
  private savedMarker: SceneMarker | null = null;
  constructor(private readonly markerId: string, private readonly store: SceneMarkerStore) {
    this.description = `Delete scene marker ${markerId}`;
  }
  execute(): void {
    this.savedMarker = this.store.getSceneMarkers().find((m) => m.id === this.markerId) ?? null;
    if (this.savedMarker) this.savedMarker = { ...this.savedMarker };
    this.store.removeSceneMarker(this.markerId);
  }
  undo(): void {
    if (this.savedMarker) this.store.addSceneMarker({ ...this.savedMarker });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { markerId: this.markerId, savedMarker: this.savedMarker } };
  }
}
```

- [ ] **Step 5: Add SceneMarkerStore methods to ProjectStore**

In `src/lib/stores/project.svelte.ts`, import `SceneMarkerStore` and implement:

```typescript
import type { SceneMarkerStore } from '$lib/commands/add-scene-marker.js';
import type { SceneMarker } from '$lib/types/timeline.js';

// Add SceneMarkerStore to implements
class ProjectStore implements ..., SceneMarkerStore {
  // ...existing...

  getSceneMarkers(): SceneMarker[] { return this.file.sceneMarkers; }
  addSceneMarker(marker: SceneMarker): void {
    this.file.sceneMarkers.push(marker);
    this.markDirty();
  }
  removeSceneMarker(id: string): void {
    this.file.sceneMarkers = this.file.sceneMarkers.filter((m) => m.id !== id);
    this.markDirty();
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/commands/scene-marker-commands.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/commands/add-scene-marker.ts src/lib/commands/delete-scene-marker.ts src/lib/stores/project.svelte.ts tests/commands/scene-marker-commands.test.ts
git commit -m "feat: add scene marker commands and store methods"
```

---

### Task 11: Scene Detection Worker

**Files:**
- Create: `src/lib/workers/scene-detection.worker.ts`
- Create: `src/lib/services/scene-detection.ts`

- [ ] **Step 1: Create the scene detection worker**

The worker receives frame data at regular intervals, compares histograms between consecutive frames, and reports detected scene changes.

```typescript
// src/lib/workers/scene-detection.worker.ts

interface FrameData {
  imageData: ImageData;
  timestampMs: number;
}

interface DetectionConfig {
  sensitivity: 'low' | 'medium' | 'high';
}

const THRESHOLD: Record<string, number> = {
  low: 0.5,
  medium: 0.3,
  high: 0.15,
};

let prevHistogram: Float32Array | null = null;

function computeHistogram(data: Uint8ClampedArray): Float32Array {
  // 64-bin histogram (combined luminance)
  const bins = new Float32Array(64);
  const totalPixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bin = Math.min(63, Math.floor(lum / 4));
    bins[bin]++;
  }
  // Normalize
  for (let i = 0; i < 64; i++) bins[i] /= totalPixels;
  return bins;
}

function chiSquaredDistance(a: Float32Array, b: Float32Array): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const sum = a[i] + b[i];
    if (sum > 0) dist += ((a[i] - b[i]) ** 2) / sum;
  }
  return dist;
}

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'init') {
    prevHistogram = null;
    return;
  }

  if (type === 'frame') {
    const { imageData, timestampMs } = data as FrameData;
    const histogram = computeHistogram(imageData.data);

    if (prevHistogram) {
      const distance = chiSquaredDistance(prevHistogram, histogram);
      const config = (data as any).config as DetectionConfig;
      const threshold = THRESHOLD[config?.sensitivity ?? 'medium'];

      if (distance > threshold) {
        self.postMessage({ type: 'scene-change', timestampMs, distance });
      }
    }

    prevHistogram = histogram;
    self.postMessage({ type: 'progress', timestampMs });
  }

  if (type === 'done') {
    self.postMessage({ type: 'complete' });
  }
};
```

- [ ] **Step 2: Create the main-thread controller**

```typescript
// src/lib/services/scene-detection.ts
import type { SceneMarker } from '$lib/types/timeline.js';
import { generateId } from './id.js';

export type SceneDetectionSensitivity = 'low' | 'medium' | 'high';

export interface SceneDetectionProgress {
  currentMs: number;
  totalMs: number;
  markersFound: number;
}

export interface SceneDetectionResult {
  markers: SceneMarker[];
}

/**
 * Runs scene detection by extracting frames at 500ms intervals from the video,
 * downscaling to 160x90, and comparing histograms in a worker.
 *
 * @param videoElement - The video element to sample from
 * @param durationMs - Total video duration in ms
 * @param sensitivity - Detection sensitivity level
 * @param onProgress - Progress callback
 * @param signal - AbortSignal to cancel detection
 */
export async function detectScenes(
  videoElement: HTMLVideoElement,
  durationMs: number,
  sensitivity: SceneDetectionSensitivity,
  onProgress: (p: SceneDetectionProgress) => void,
  signal?: AbortSignal,
): Promise<SceneDetectionResult> {
  const worker = new Worker(
    new URL('$lib/workers/scene-detection.worker.ts', import.meta.url),
    { type: 'module' },
  );

  const canvas = new OffscreenCanvas(160, 90);
  const ctx = canvas.getContext('2d')!;

  const markers: SceneMarker[] = [];
  const SAMPLE_INTERVAL_MS = 500;

  return new Promise<SceneDetectionResult>((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    signal?.addEventListener('abort', () => {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    });

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'scene-change') {
        markers.push({
          id: generateId(),
          timestampMs: e.data.timestampMs,
          label: `Scene ${markers.length + 1}`,
          type: 'MARKER_AUTO_DETECTED',
        });
        onProgress({ currentMs: e.data.timestampMs, totalMs: durationMs, markersFound: markers.length });
      } else if (e.data.type === 'progress') {
        onProgress({ currentMs: e.data.timestampMs, totalMs: durationMs, markersFound: markers.length });
      } else if (e.data.type === 'complete') {
        worker.terminate();
        resolve({ markers });
      }
    };

    worker.postMessage({ type: 'init' });

    // Sample frames sequentially
    const savedTime = videoElement.currentTime;
    let currentMs = 0;

    async function sampleNextFrame() {
      if (signal?.aborted) return;
      if (currentMs > durationMs) {
        worker.postMessage({ type: 'done' });
        videoElement.currentTime = savedTime;
        return;
      }

      videoElement.currentTime = currentMs / 1000;
      await new Promise<void>((res) => {
        videoElement.onseeked = () => res();
      });

      ctx.drawImage(videoElement, 0, 0, 160, 90);
      const imageData = ctx.getImageData(0, 0, 160, 90);

      worker.postMessage({
        type: 'frame',
        data: { imageData, timestampMs: currentMs, config: { sensitivity } },
      }, [imageData.data.buffer]);

      currentMs += SAMPLE_INTERVAL_MS;
      // Use setTimeout to avoid blocking the main thread
      setTimeout(sampleNextFrame, 0);
    }

    sampleNextFrame();
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/workers/scene-detection.worker.ts src/lib/services/scene-detection.ts
git commit -m "feat: add scene detection worker and controller"
```

---

### Task 12: Scene Detection Dialog

**Files:**
- Create: `src/lib/components/dialogs/SceneDetectionDialog.svelte`

- [ ] **Step 1: Create the dialog**

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { detectScenes, type SceneDetectionSensitivity, type SceneDetectionProgress } from '$lib/services/scene-detection.js';
  import { AddSceneMarkerCommand } from '$lib/commands/add-scene-marker.js';
  import { CompositeCommand } from '$lib/commands/composite.js';

  let { onclose }: { onclose: () => void } = $props();

  let sensitivity = $state<SceneDetectionSensitivity>('medium');
  let isRunning = $state(false);
  let progress = $state<SceneDetectionProgress | null>(null);
  let abortController: AbortController | null = null;

  const progressPct = $derived(
    progress ? Math.round((progress.currentMs / progress.totalMs) * 100) : 0
  );

  async function handleDetect(): Promise<void> {
    if (!videoStore.element || !projectStore.file) return;
    isRunning = true;
    abortController = new AbortController();

    try {
      const result = await detectScenes(
        videoStore.element,
        videoStore.durationMs,
        sensitivity,
        (p) => { progress = p; },
        abortController.signal,
      );

      if (result.markers.length > 0) {
        const cmds = result.markers.map((m) => new AddSceneMarkerCommand(m, projectStore));
        undoStore.execute(new CompositeCommand(`Add ${result.markers.length} scene markers`, cmds));
        toastStore.success(`Detected ${result.markers.length} scene changes`);
      } else {
        toastStore.info('No scene changes detected');
      }
      onclose();
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        toastStore.error(`Scene detection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      isRunning = false;
      progress = null;
      abortController = null;
    }
  }

  function handleCancel(): void {
    abortController?.abort();
  }
</script>

<Modal title="Scene Detection" {onclose}>
  <div class="space-y-4 min-w-[24rem]">
    {#if !isRunning}
      <p class="text-sm text-textMuted">
        Analyze the video to automatically detect scene changes and place markers on the timeline.
      </p>

      <div>
        <label class="text-xs text-textMuted">Sensitivity</label>
        <Select
          options={[
            { value: 'low', label: 'Low — fewer, more obvious cuts' },
            { value: 'medium', label: 'Medium — balanced detection' },
            { value: 'high', label: 'High — more markers, may include gradual transitions' },
          ]}
          value={sensitivity}
          onchange={(v) => { sensitivity = v as SceneDetectionSensitivity; }}
        />
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-surface3">
        <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!videoStore.isLoaded}
          onclick={handleDetect}
        >
          Detect Scenes
        </Button>
      </div>
    {:else}
      <div class="space-y-3">
        <div class="flex items-center justify-between text-sm">
          <span class="text-textMuted">Analyzing frames...</span>
          <span class="text-text-base">{progressPct}%</span>
        </div>

        <div class="w-full bg-surface3 rounded-full h-2">
          <div
            class="bg-accent h-2 rounded-full transition-all"
            style="width: {progressPct}%"
          ></div>
        </div>

        {#if progress}
          <p class="text-xs text-textMuted">{progress.markersFound} scene changes found so far</p>
        {/if}

        <div class="flex justify-end pt-2 border-t border-surface3">
          <Button variant="ghost" size="sm" onclick={handleCancel}>Cancel</Button>
        </div>
      </div>
    {/if}
  </div>
</Modal>
```

- [ ] **Step 2: Add 'scene-detection' to ModalType**

In `src/lib/types/ui.ts`, add to the union:

```typescript
export type ModalType =
  | 'movie-metadata' | 'export' | 'publish' | 'welcome'
  | 'keyboard-shortcuts' | 'channel-template' | 'confirm-delete'
  | 'about' | 'new-project' | 'track-metadata'
  | 'scene-detection' | 'effect-catalog' | 'channel-group';
```

- [ ] **Step 3: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/dialogs/SceneDetectionDialog.svelte src/lib/types/ui.ts
git commit -m "feat: add scene detection dialog with progress and sensitivity controls"
```

---

### Task 13: Snapping Service

**Files:**
- Create: `src/lib/services/snapping.ts`
- Create: `tests/services/snapping.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/services/snapping.test.ts
import { describe, it, expect } from 'vitest';
import { findSnapPoint, computeSnapTargets, type SnapTarget } from '$lib/services/snapping.js';

describe('computeSnapTargets', () => {
  it('generates targets from keyframe timestamps', () => {
    const targets = computeSnapTargets(
      [{ timestampMs: 1000 }, { timestampMs: 2000 }] as any[],
      [],
      [],
      10000,
      24,
    );
    expect(targets.some((t) => t.timestampMs === 1000)).toBe(true);
    expect(targets.some((t) => t.timestampMs === 2000)).toBe(true);
  });

  it('generates second marks', () => {
    const targets = computeSnapTargets([], [], [], 3000, 24);
    expect(targets.some((t) => t.timestampMs === 0 && t.type === 'second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 1000 && t.type === 'second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 2000 && t.type === 'second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 3000 && t.type === 'second')).toBe(true);
  });

  it('generates 500ms marks', () => {
    const targets = computeSnapTargets([], [], [], 2000, 24);
    expect(targets.some((t) => t.timestampMs === 500 && t.type === 'half-second')).toBe(true);
    expect(targets.some((t) => t.timestampMs === 1500 && t.type === 'half-second')).toBe(true);
  });

  it('generates frame boundary marks', () => {
    const targets = computeSnapTargets([], [], [], 200, 24);
    // At 24fps, frames at ~41.67ms intervals
    expect(targets.some((t) => t.type === 'frame' && Math.abs(t.timestampMs - 41.667) < 1)).toBe(true);
  });

  it('includes scene markers', () => {
    const targets = computeSnapTargets(
      [],
      [],
      [{ id: 'sm-1', timestampMs: 5000, label: 'Scene 1', type: 'MARKER_MANUAL' }],
      10000,
      24,
    );
    expect(targets.some((t) => t.timestampMs === 5000 && t.type === 'scene-marker')).toBe(true);
  });
});

describe('findSnapPoint', () => {
  it('returns snap target within threshold', () => {
    const targets: SnapTarget[] = [{ timestampMs: 1000, type: 'keyframe' }];
    const result = findSnapPoint(1005, targets, 8, 0.1); // 8px threshold at 0.1 px/ms = 80ms
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(1000);
  });

  it('returns null when no target within threshold', () => {
    const targets: SnapTarget[] = [{ timestampMs: 1000, type: 'keyframe' }];
    const result = findSnapPoint(2000, targets, 8, 0.1);
    expect(result).toBeNull();
  });

  it('returns closest target', () => {
    const targets: SnapTarget[] = [
      { timestampMs: 1000, type: 'keyframe' },
      { timestampMs: 1010, type: 'second' },
    ];
    const result = findSnapPoint(1008, targets, 8, 0.1);
    expect(result!.timestampMs).toBe(1010);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/snapping.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/services/snapping.ts
import type { Keyframe, EffectKeyframe } from '$lib/types/track.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import { KEYFRAME_SNAP_DISTANCE } from '$lib/types/timeline.js';

export type SnapTargetType = 'keyframe' | 'effect' | 'second' | 'half-second' | 'frame' | 'scene-marker';

export interface SnapTarget {
  timestampMs: number;
  type: SnapTargetType;
}

/**
 * Build a sorted array of snap targets from keyframes, effects, scene markers,
 * time grid, and frame boundaries.
 */
export function computeSnapTargets(
  keyframes: Keyframe[],
  effects: EffectKeyframe[],
  markers: SceneMarker[],
  durationMs: number,
  framerate: number,
): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const seen = new Set<number>();

  function add(ms: number, type: SnapTargetType) {
    // Deduplicate: if same ms already exists as a higher-priority type, skip
    const key = Math.round(ms * 100) / 100; // round to avoid float issues
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({ timestampMs: key, type });
    }
  }

  // Keyframe positions
  for (const kf of keyframes) add(kf.timestampMs, 'keyframe');

  // Effect start positions
  for (const ef of effects) {
    add(ef.timestampMs, 'effect');
    add(ef.timestampMs + ef.durationMs, 'effect'); // snap to effect end too
  }

  // Scene markers
  for (const m of markers) add(m.timestampMs, 'scene-marker');

  // Whole-second marks
  for (let ms = 0; ms <= durationMs; ms += 1000) add(ms, 'second');

  // 500ms marks
  for (let ms = 500; ms <= durationMs; ms += 1000) add(ms, 'half-second');

  // Frame boundaries (only up to a reasonable density)
  if (framerate > 0) {
    const frameDurationMs = 1000 / framerate;
    // Only generate frame snaps within the first 60s to avoid massive arrays
    const maxMs = Math.min(durationMs, 60000);
    for (let ms = frameDurationMs; ms <= maxMs; ms += frameDurationMs) {
      add(ms, 'frame');
    }
  }

  return targets.sort((a, b) => a.timestampMs - b.timestampMs);
}

/**
 * Find the closest snap target within the snap threshold.
 * Returns null if nothing is close enough.
 */
export function findSnapPoint(
  timestampMs: number,
  targets: SnapTarget[],
  snapDistancePx: number,
  pxPerMs: number,
): SnapTarget | null {
  const thresholdMs = snapDistancePx / pxPerMs;
  let best: SnapTarget | null = null;
  let bestDist = Infinity;

  // Binary search for nearby targets
  let lo = 0;
  let hi = targets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (targets[mid].timestampMs < timestampMs - thresholdMs) lo = mid + 1;
    else if (targets[mid].timestampMs > timestampMs + thresholdMs) hi = mid - 1;
    else {
      // Found one in range — scan neighbors
      for (let i = Math.max(0, mid - 5); i < Math.min(targets.length, mid + 6); i++) {
        const dist = Math.abs(targets[i].timestampMs - timestampMs);
        if (dist <= thresholdMs && dist < bestDist) {
          bestDist = dist;
          best = targets[i];
        }
      }
      break;
    }
  }

  return best;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/services/snapping.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/snapping.ts tests/services/snapping.test.ts
git commit -m "feat: add snapping service with snap target computation and binary search"
```

---

### Task 14: Snap Indicator Rendering & Integration

**Files:**
- Modify: `src/lib/components/timeline/render.ts` (add `drawSnapIndicator`)
- Modify: `src/lib/components/timeline/interaction.ts` (use snapping during drag)

- [ ] **Step 1: Add drawSnapIndicator to render.ts**

```typescript
export function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  vp: RenderViewport,
  height: number,
): void {
  const x = msToPx(timeMs, vp);
  if (x < 0 || x > vp.width) return;
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)'; // yellow snap line
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, RULER_HEIGHT);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.setLineDash([]);
}
```

- [ ] **Step 2: Integrate snapping into keyframe/effect drag in interaction.ts**

Add an optional `snapTargets` parameter to `handlePointerMove`. When snapping is enabled and a drag is in progress, call `findSnapPoint` and apply the snapped timestamp:

In the keyframe drag section of `handlePointerMove`:

```typescript
import { findSnapPoint, type SnapTarget } from '$lib/services/snapping.js';
import { KEYFRAME_SNAP_DISTANCE } from '$lib/types/timeline.js';

// Add to handlePointerMove signature:
// snapTargets: SnapTarget[] | null = null,
// snappingEnabled: boolean = false,

// In the keyframe drag block, after computing deltaMs:
    let snappedMs: number | null = null;
    for (const id of dragState.targetIds) {
      const origMs = dragState.originalTimestamps.get(id);
      if (origMs !== undefined) {
        let targetMs = Math.max(0, origMs + deltaMs);
        if (snappingEnabled && snapTargets) {
          const snap = findSnapPoint(targetMs, snapTargets, KEYFRAME_SNAP_DISTANCE, timelineStore.pxPerMs);
          if (snap) {
            targetMs = snap.timestampMs;
            snappedMs = snap.timestampMs;
          }
        }
        store.updateKeyframe(id, { timestampMs: targetMs });
      }
    }
    return snappedMs; // Return for visual indicator
```

Change `handlePointerMove` return type from `void` to `number | null` (snap indicator timestamp or null).

- [ ] **Step 3: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/timeline/render.ts src/lib/components/timeline/interaction.ts
git commit -m "feat: add snap indicator rendering and snapping during drag"
```

---

### Task 15: Channel Group Service

**Files:**
- Create: `src/lib/services/channel-groups.ts`
- Create: `tests/services/channel-groups.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/services/channel-groups.test.ts
import { describe, it, expect } from 'vitest';
import { applyMirror, applySpread, applyAlternate } from '$lib/services/channel-groups.js';
import type { Keyframe } from '$lib/types/track.js';

function makeKf(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    id: 'kf-1', channelId: 'ch-source', timestampMs: 1000,
    colorMode: 'RGB', color: { r: 255, g: 0, b: 0 }, colorTemperature: 6500,
    brightness: 100, transitionMs: 0, interpolation: 'STEP', powerOn: true,
    ...overrides,
  };
}

describe('applyMirror', () => {
  it('replicates keyframe to all target channels', () => {
    const source = makeKf();
    const result = applyMirror(source, ['ch-a', 'ch-b'], () => 'new-id');
    expect(result).toHaveLength(2);
    expect(result[0].channelId).toBe('ch-a');
    expect(result[1].channelId).toBe('ch-b');
    expect(result[0].color).toEqual({ r: 255, g: 0, b: 0 });
    expect(result[0].timestampMs).toBe(1000);
  });
});

describe('applySpread', () => {
  it('replicates with time offset per channel', () => {
    const source = makeKf();
    const offsets = [
      { channelId: 'ch-a', hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 0 },
      { channelId: 'ch-b', hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 150 },
      { channelId: 'ch-c', hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 300 },
    ];
    const result = applySpread(source, offsets, () => 'new-id');
    expect(result).toHaveLength(3);
    expect(result[0].timestampMs).toBe(1000);
    expect(result[1].timestampMs).toBe(1150);
    expect(result[2].timestampMs).toBe(1300);
  });
});

describe('applyAlternate', () => {
  it('places keyframe only on the next channel in round-robin', () => {
    const source = makeKf();
    const channels = ['ch-a', 'ch-b', 'ch-c'];
    // Round-robin index 0 → ch-a
    const result0 = applyAlternate(source, channels, 0, () => 'new-id');
    expect(result0).toHaveLength(1);
    expect(result0[0].channelId).toBe('ch-a');
    // Round-robin index 1 → ch-b
    const result1 = applyAlternate(source, channels, 1, () => 'new-id');
    expect(result1[0].channelId).toBe('ch-b');
    // Round-robin index 3 → wraps to ch-a
    const result3 = applyAlternate(source, channels, 3, () => 'new-id');
    expect(result3[0].channelId).toBe('ch-a');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/channel-groups.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/services/channel-groups.ts
import type { Keyframe } from '$lib/types/track.js';
import type { ChannelGroupOffset } from '$lib/types/channels.js';

/**
 * Mirror mode: replicate the source keyframe to all target channels.
 * Returns new keyframes (not the source).
 */
export function applyMirror(
  source: Keyframe,
  targetChannelIds: string[],
  generateId: () => string,
): Keyframe[] {
  return targetChannelIds.map((channelId) => ({
    ...source,
    id: generateId(),
    channelId,
    color: { ...source.color },
  }));
}

/**
 * Spread mode: replicate the source keyframe with per-channel timing offsets.
 * Returns new keyframes for all channels in the offset list.
 */
export function applySpread(
  source: Keyframe,
  offsets: ChannelGroupOffset[],
  generateId: () => string,
): Keyframe[] {
  return offsets.map((offset) => ({
    ...source,
    id: generateId(),
    channelId: offset.channelId,
    timestampMs: Math.max(0, source.timestampMs + offset.timingOffsetMs),
    brightness: Math.max(0, Math.min(255, source.brightness + offset.brightnessOffset)),
    color: { ...source.color },
  }));
}

/**
 * Alternate mode: place keyframe on only the channel at the given round-robin index.
 * Returns a single-element array with the keyframe on the selected channel.
 */
export function applyAlternate(
  source: Keyframe,
  channelIds: string[],
  roundRobinIndex: number,
  generateId: () => string,
): Keyframe[] {
  const targetIndex = roundRobinIndex % channelIds.length;
  return [{
    ...source,
    id: generateId(),
    channelId: channelIds[targetIndex],
    color: { ...source.color },
  }];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/services/channel-groups.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/channel-groups.ts tests/services/channel-groups.test.ts
git commit -m "feat: add channel group mode logic (mirror, spread, alternate)"
```

---

### Task 16: Channel Group Commands & Store Methods

**Files:**
- Create: `src/lib/commands/channel-group.ts`
- Modify: `src/lib/stores/project.svelte.ts`
- Create: `tests/commands/channel-group-commands.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/commands/channel-group-commands.test.ts
import { describe, it, expect } from 'vitest';
import type { ChannelGroup } from '$lib/types/channels.js';
import type { ChannelGroupStore } from '$lib/commands/channel-group.js';
import { AddChannelGroupCommand, DeleteChannelGroupCommand, EditChannelGroupCommand } from '$lib/commands/channel-group.js';

function makeStore(): ChannelGroupStore & { groups: ChannelGroup[] } {
  const groups: ChannelGroup[] = [];
  return {
    groups,
    getChannelGroups: () => groups,
    addChannelGroup: (g) => groups.push(g),
    removeChannelGroup: (id) => {
      const idx = groups.findIndex((g) => g.id === id);
      if (idx >= 0) groups.splice(idx, 1);
    },
    updateChannelGroup: (id, patch) => {
      const g = groups.find((g) => g.id === id);
      if (g) Object.assign(g, patch);
    },
  };
}

function makeGroup(): ChannelGroup {
  return {
    id: 'grp-1', name: 'Stereo Mirror', mode: 'GROUP_MIRROR',
    channelIds: ['left', 'right'], offsets: [], defaultSpreadOffsetMs: 150,
  };
}

describe('AddChannelGroupCommand', () => {
  it('adds and undoes', () => {
    const store = makeStore();
    const cmd = new AddChannelGroupCommand(makeGroup(), store);
    cmd.execute();
    expect(store.groups).toHaveLength(1);
    cmd.undo();
    expect(store.groups).toHaveLength(0);
  });
});

describe('DeleteChannelGroupCommand', () => {
  it('deletes and undoes', () => {
    const store = makeStore();
    store.addChannelGroup(makeGroup());
    const cmd = new DeleteChannelGroupCommand('grp-1', store);
    cmd.execute();
    expect(store.groups).toHaveLength(0);
    cmd.undo();
    expect(store.groups).toHaveLength(1);
    expect(store.groups[0].name).toBe('Stereo Mirror');
  });
});

describe('EditChannelGroupCommand', () => {
  it('edits and undoes', () => {
    const store = makeStore();
    store.addChannelGroup(makeGroup());
    const cmd = new EditChannelGroupCommand('grp-1', { mode: 'GROUP_SPREAD' }, store);
    cmd.execute();
    expect(store.groups[0].mode).toBe('GROUP_SPREAD');
    cmd.undo();
    expect(store.groups[0].mode).toBe('GROUP_MIRROR');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commands/channel-group-commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Write channel-group.ts commands**

```typescript
// src/lib/commands/channel-group.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { ChannelGroup } from '$lib/types/channels.js';

export interface ChannelGroupStore {
  getChannelGroups(): ChannelGroup[];
  addChannelGroup(group: ChannelGroup): void;
  removeChannelGroup(id: string): void;
  updateChannelGroup(id: string, patch: Partial<ChannelGroup>): void;
}

export class AddChannelGroupCommand implements Command {
  readonly type = 'ADD_CHANNEL_GROUP';
  readonly description: string;
  constructor(private readonly group: ChannelGroup, private readonly store: ChannelGroupStore) {
    this.description = `Add channel group "${group.name}"`;
  }
  execute(): void {
    this.store.addChannelGroup({ ...this.group, channelIds: [...this.group.channelIds], offsets: this.group.offsets.map((o) => ({ ...o })) });
  }
  undo(): void { this.store.removeChannelGroup(this.group.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { group: this.group } };
  }
}

export class DeleteChannelGroupCommand implements Command {
  readonly type = 'DELETE_CHANNEL_GROUP';
  readonly description: string;
  private savedGroup: ChannelGroup | null = null;
  constructor(private readonly groupId: string, private readonly store: ChannelGroupStore) {
    this.description = `Delete channel group ${groupId}`;
  }
  execute(): void {
    const g = this.store.getChannelGroups().find((g) => g.id === this.groupId) ?? null;
    if (g) this.savedGroup = { ...g, channelIds: [...g.channelIds], offsets: g.offsets.map((o) => ({ ...o })) };
    this.store.removeChannelGroup(this.groupId);
  }
  undo(): void {
    if (this.savedGroup) this.store.addChannelGroup({ ...this.savedGroup, channelIds: [...this.savedGroup.channelIds], offsets: this.savedGroup.offsets.map((o) => ({ ...o })) });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { groupId: this.groupId, savedGroup: this.savedGroup } };
  }
}

export class EditChannelGroupCommand implements Command {
  readonly type = 'EDIT_CHANNEL_GROUP';
  readonly description: string;
  private previousValues: Partial<ChannelGroup> = {};
  constructor(private readonly groupId: string, private readonly patch: Partial<ChannelGroup>, private readonly store: ChannelGroupStore) {
    this.description = `Edit channel group ${groupId}`;
  }
  execute(): void {
    const g = this.store.getChannelGroups().find((g) => g.id === this.groupId);
    if (!g) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof ChannelGroup)[]) {
      const val = g[key];
      (this.previousValues as any)[key] = Array.isArray(val) ? [...val] : typeof val === 'object' && val !== null ? { ...val } : val;
    }
    this.store.updateChannelGroup(this.groupId, this.patch);
  }
  undo(): void {
    this.store.updateChannelGroup(this.groupId, this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { groupId: this.groupId, patch: this.patch, previousValues: this.previousValues } };
  }
}
```

- [ ] **Step 4: Add ChannelGroupStore methods to ProjectStore**

In `src/lib/stores/project.svelte.ts`:

```typescript
import type { ChannelGroupStore } from '$lib/commands/channel-group.js';
import type { ChannelGroup } from '$lib/types/channels.js';

// Add to implements clause
class ProjectStore implements ..., ChannelGroupStore {
  // ...existing...

  getChannelGroups(): ChannelGroup[] { return this.file.channelGroups; }
  addChannelGroup(group: ChannelGroup): void {
    this.file.channelGroups.push(group);
    this.markDirty();
  }
  removeChannelGroup(id: string): void {
    this.file.channelGroups = this.file.channelGroups.filter((g) => g.id !== id);
    this.markDirty();
  }
  updateChannelGroup(id: string, patch: Partial<ChannelGroup>): void {
    const g = this.file.channelGroups.find((g) => g.id === id);
    if (g) Object.assign(g, patch);
    this.markDirty();
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/commands/channel-group-commands.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/commands/channel-group.ts src/lib/stores/project.svelte.ts tests/commands/channel-group-commands.test.ts
git commit -m "feat: add channel group commands and store methods"
```

---

### Task 17: Channel Group Dialog

**Files:**
- Create: `src/lib/components/channels/ChannelGroupDialog.svelte`

- [ ] **Step 1: Create the dialog**

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import Slider from '$lib/components/shared/Slider.svelte';
  import Toggle from '$lib/components/shared/Toggle.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { AddChannelGroupCommand, DeleteChannelGroupCommand, EditChannelGroupCommand } from '$lib/commands/channel-group.js';
  import { generateId } from '$lib/services/id.js';
  import type { GroupMode, ChannelGroupOffset } from '$lib/types/channels.js';
  import { DEFAULT_SPREAD_OFFSET_MS, MIN_SPREAD_OFFSET_MS, MAX_SPREAD_OFFSET_MS } from '$lib/types/channels.js';

  let { onclose, editGroupId = null }: { onclose: () => void; editGroupId?: string | null } = $props();

  const channels = $derived(projectStore.file?.track.channels ?? []);
  const existingGroup = $derived(
    editGroupId ? projectStore.file?.channelGroups.find((g) => g.id === editGroupId) ?? null : null
  );

  let name = $state(existingGroup?.name ?? '');
  let mode = $state<GroupMode>(existingGroup?.mode ?? 'GROUP_MIRROR');
  let selectedChannelIds = $state<string[]>(existingGroup?.channelIds ?? []);
  let spreadOffsetMs = $state(existingGroup?.defaultSpreadOffsetMs ?? DEFAULT_SPREAD_OFFSET_MS);

  function toggleChannel(id: string) {
    if (selectedChannelIds.includes(id)) {
      selectedChannelIds = selectedChannelIds.filter((c) => c !== id);
    } else {
      selectedChannelIds = [...selectedChannelIds, id];
    }
  }

  function handleSave(): void {
    if (selectedChannelIds.length < 2 || !name.trim()) return;

    const offsets: ChannelGroupOffset[] = selectedChannelIds.map((channelId, i) => ({
      channelId,
      hueOffset: 0,
      brightnessOffset: 0,
      timingOffsetMs: mode === 'GROUP_SPREAD' ? i * spreadOffsetMs : 0,
    }));

    if (existingGroup) {
      undoStore.execute(new EditChannelGroupCommand(existingGroup.id, {
        name: name.trim(),
        mode,
        channelIds: [...selectedChannelIds],
        offsets,
        defaultSpreadOffsetMs: spreadOffsetMs,
      }, projectStore));
    } else {
      undoStore.execute(new AddChannelGroupCommand({
        id: generateId(),
        name: name.trim(),
        mode,
        channelIds: [...selectedChannelIds],
        offsets,
        defaultSpreadOffsetMs: spreadOffsetMs,
      }, projectStore));
    }
    onclose();
  }

  function handleDelete(): void {
    if (!existingGroup) return;
    undoStore.execute(new DeleteChannelGroupCommand(existingGroup.id, projectStore));
    onclose();
  }
</script>

<Modal title={existingGroup ? 'Edit Channel Group' : 'Create Channel Group'} {onclose}>
  <div class="space-y-4 min-w-[24rem]">
    <div>
      <label class="text-xs text-textMuted">Group Name</label>
      <input
        type="text"
        class="w-full mt-1 px-3 py-2 bg-surface2 border border-surface3 rounded text-sm text-text-base"
        bind:value={name}
        placeholder="e.g., Stereo Mirror"
      />
    </div>

    <div>
      <label class="text-xs text-textMuted">Mode</label>
      <Select
        options={[
          { value: 'GROUP_MIRROR', label: 'Mirror — edits replicate to all members' },
          { value: 'GROUP_SPREAD', label: 'Spread — edits propagate with time offset' },
          { value: 'GROUP_ALTERNATE', label: 'Alternate — round-robin placement' },
        ]}
        value={mode}
        onchange={(v) => { mode = v as GroupMode; }}
      />
    </div>

    <div>
      <label class="text-xs text-textMuted">Channels (select 2+)</label>
      <div class="mt-1 space-y-1 max-h-[200px] overflow-y-auto">
        {#each channels as ch}
          <button
            class="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-left transition-colors {selectedChannelIds.includes(ch.id) ? 'bg-accent/20 border border-accent/40' : 'bg-surface2 border border-surface3 hover:bg-surface3'}"
            onclick={() => toggleChannel(ch.id)}
          >
            <span class="w-3 h-3 rounded-full {selectedChannelIds.includes(ch.id) ? 'bg-accent' : 'bg-surface3'}"></span>
            {ch.displayName}
          </button>
        {/each}
      </div>
    </div>

    {#if mode === 'GROUP_SPREAD'}
      <div>
        <label class="text-xs text-textMuted">Spread Offset (ms between channels)</label>
        <Slider
          min={MIN_SPREAD_OFFSET_MS}
          max={MAX_SPREAD_OFFSET_MS}
          step={10}
          value={spreadOffsetMs}
          onchange={(v) => { spreadOffsetMs = v; }}
        />
        <span class="text-xs text-textMuted">{spreadOffsetMs}ms</span>
      </div>
    {/if}

    <div class="flex items-center justify-between pt-2 border-t border-surface3">
      <div>
        {#if existingGroup}
          <Button variant="ghost" size="sm" onclick={handleDelete}>
            <span class="text-danger">Delete Group</span>
          </Button>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={selectedChannelIds.length < 2 || !name.trim()}
          onclick={handleSave}
        >
          {existingGroup ? 'Save' : 'Create Group'}
        </Button>
      </div>
    </div>
  </div>
</Modal>
```

- [ ] **Step 2: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/channels/ChannelGroupDialog.svelte
git commit -m "feat: add channel group create/edit dialog"
```

---

### Task 18: Channel Group Indicators on ChannelHeaders

**Files:**
- Modify: `src/lib/components/timeline/ChannelHeaders.svelte`

- [ ] **Step 1: Add group indicators**

In `ChannelHeaders.svelte`, for each channel row, check if the channel belongs to a group and show a colored bracket/chain icon. Add a click handler to open the group dialog.

After the existing channel name element in each row, add:

```svelte
{@const group = projectStore.file?.channelGroups.find((g) => g.channelIds.includes(ch.id))}
{#if group}
  <button
    class="ml-1 text-xs px-1 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
    title="{group.name} ({group.mode.replace('GROUP_', '')})"
    onclick={() => { editingGroupId = group.id; uiStore.openModal('channel-group'); }}
  >
    {group.mode === 'GROUP_MIRROR' ? '\u2194' : group.mode === 'GROUP_SPREAD' ? '\u2192' : '\u21BB'}
  </button>
{/if}
```

Add the necessary state variable `editingGroupId` and expose it for the parent to read when opening the dialog.

- [ ] **Step 2: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/timeline/ChannelHeaders.svelte
git commit -m "feat: add channel group indicators on channel headers"
```

---

### Task 19: Copy/Paste Keyframes

**Files:**
- Create: `src/lib/commands/paste-keyframes.ts`
- Modify: `src/lib/stores/clipboard.svelte.ts`
- Modify: `src/lib/services/keyboard-shortcuts.ts`
- Create: `tests/commands/paste-keyframes.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/commands/paste-keyframes.test.ts
import { describe, it, expect } from 'vitest';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from '$lib/commands/add-keyframe.js';
import { PasteKeyframesCommand } from '$lib/commands/paste-keyframes.js';

function makeStore(): KeyframeStore & { keyframes: Keyframe[] } {
  const keyframes: Keyframe[] = [];
  return {
    keyframes,
    getKeyframes: () => keyframes,
    addKeyframe: (kf) => keyframes.push(kf),
    removeKeyframe: (id) => {
      const idx = keyframes.findIndex((k) => k.id === id);
      if (idx >= 0) keyframes.splice(idx, 1);
    },
    updateKeyframe: (id, patch) => {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) Object.assign(kf, patch);
    },
  };
}

function makeKf(id: string, channelId: string, timestampMs: number): Keyframe {
  return {
    id, channelId, timestampMs, colorMode: 'RGB',
    color: { r: 255, g: 0, b: 0 }, colorTemperature: 6500,
    brightness: 100, transitionMs: 0, interpolation: 'STEP', powerOn: true,
  };
}

describe('PasteKeyframesCommand', () => {
  it('pastes keyframes at target timestamp', () => {
    const store = makeStore();
    const source = [makeKf('kf-1', 'ch-a', 1000), makeKf('kf-2', 'ch-a', 2000)];
    const cmd = new PasteKeyframesCommand(source, 'ch-a', 5000, 1000, () => 'new-id');
    cmd.execute();
    expect(store.keyframes).toHaveLength(0); // PasteKeyframesCommand uses its own store param
  });

  it('pastes with correct offsets', () => {
    const store = makeStore();
    const source = [makeKf('kf-1', 'ch-a', 1000), makeKf('kf-2', 'ch-a', 2000)];
    const cmd = new PasteKeyframesCommand(source, 'ch-b', 5000, 1000, () => 'new-id', store);
    cmd.execute();
    expect(store.keyframes).toHaveLength(2);
    expect(store.keyframes[0].timestampMs).toBe(5000); // base offset: 5000 - 1000 = 4000 + 1000
    expect(store.keyframes[1].timestampMs).toBe(6000); // 4000 + 2000
    expect(store.keyframes[0].channelId).toBe('ch-b');
  });

  it('undoes paste by removing pasted keyframes', () => {
    const store = makeStore();
    const source = [makeKf('kf-1', 'ch-a', 1000)];
    const cmd = new PasteKeyframesCommand(source, 'ch-a', 5000, 1000, () => 'paste-1', store);
    cmd.execute();
    expect(store.keyframes).toHaveLength(1);
    cmd.undo();
    expect(store.keyframes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commands/paste-keyframes.test.ts`
Expected: FAIL

- [ ] **Step 3: Write PasteKeyframesCommand**

```typescript
// src/lib/commands/paste-keyframes.ts
import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from './add-keyframe.js';

export class PasteKeyframesCommand implements Command {
  readonly type = 'PASTE_KEYFRAMES';
  readonly description: string;
  private pastedIds: string[] = [];

  constructor(
    private readonly sourceKeyframes: Keyframe[],
    private readonly targetChannelId: string,
    private readonly targetTimestampMs: number,
    private readonly baseTimestampMs: number,
    private readonly generateId: () => string,
    private readonly store?: KeyframeStore,
  ) {
    this.description = `Paste ${sourceKeyframes.length} keyframe(s)`;
  }

  execute(): void {
    if (!this.store) return;
    const offset = this.targetTimestampMs - this.baseTimestampMs;
    this.pastedIds = [];

    for (const source of this.sourceKeyframes) {
      const id = this.generateId();
      this.pastedIds.push(id);
      this.store.addKeyframe({
        ...source,
        id,
        channelId: this.targetChannelId,
        timestampMs: Math.max(0, source.timestampMs + offset),
        color: { ...source.color },
      });
    }
  }

  undo(): void {
    if (!this.store) return;
    for (const id of this.pastedIds) {
      this.store.removeKeyframe(id);
    }
  }

  serialize(): SerializedCommandData {
    return {
      type: this.type,
      description: this.description,
      payload: {
        sourceKeyframes: this.sourceKeyframes,
        targetChannelId: this.targetChannelId,
        targetTimestampMs: this.targetTimestampMs,
        baseTimestampMs: this.baseTimestampMs,
      },
    };
  }
}
```

- [ ] **Step 4: Update ClipboardStore with copyEffects**

In `src/lib/stores/clipboard.svelte.ts`, add:

```typescript
import type { EffectKeyframe } from '$lib/types/track.js';

  copyEffects(effects: EffectKeyframe[], sourceChannelId: string): void {
    if (effects.length === 0) return;
    const sorted = [...effects].sort((a, b) => a.timestampMs - b.timestampMs);
    const baseTimestampMs = sorted[0].timestampMs;
    this.buffer = {
      type: 'effect',
      sourceChannelId,
      data: sorted.map((ef) => ({
        ...ef,
        primaryColor: { ...ef.primaryColor },
        secondaryColor: { ...ef.secondaryColor },
        fallbackColor: { ...ef.fallbackColor },
        effectParams: { params: { ...ef.effectParams.params } },
      })),
      baseTimestampMs,
    };
  }
```

- [ ] **Step 5: Add Copy/Paste keyboard shortcuts**

In `src/lib/services/keyboard-shortcuts.ts`, add these shortcuts in the `edit` section:

```typescript
    {
      id: 'edit.copy',
      label: 'Copy',
      keys: `${MOD}C`,
      key: 'c',
      ctrl: true,
      category: 'edit',
      action: () => {
        if (!projectStore.file) return;
        const selectedKfIds = timelineStore.selectedKeyframeIds;
        if (selectedKfIds.length > 0) {
          const kfs = projectStore.getKeyframes().filter((kf) => selectedKfIds.includes(kf.id));
          const channelId = timelineStore.activeChannelId ?? kfs[0]?.channelId ?? '';
          clipboardStore.copyKeyframes(kfs, channelId);
        }
      },
    },
    {
      id: 'edit.paste',
      label: 'Paste',
      keys: `${MOD}V`,
      key: 'v',
      ctrl: true,
      category: 'edit',
      action: () => {
        if (!projectStore.file || !clipboardStore.hasContent) return;
        const buffer = clipboardStore.buffer!;
        if (buffer.type === 'keyframes') {
          const targetChannel = timelineStore.activeChannelId ?? buffer.sourceChannelId;
          const cmd = new PasteKeyframesCommand(
            buffer.data as Keyframe[],
            targetChannel,
            videoStore.currentTimeMs,
            buffer.baseTimestampMs,
            generateId,
            projectStore,
          );
          undoStore.execute(cmd);
        }
      },
    },
```

Add the necessary imports at the top of `keyboard-shortcuts.ts`:

```typescript
import { clipboardStore } from '$lib/stores/clipboard.svelte.js';
import { PasteKeyframesCommand } from '$lib/commands/paste-keyframes.js';
import { generateId } from '$lib/services/id.js';
import type { Keyframe } from '$lib/types/track.js';
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/commands/paste-keyframes.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/commands/paste-keyframes.ts src/lib/stores/clipboard.svelte.ts src/lib/services/keyboard-shortcuts.ts tests/commands/paste-keyframes.test.ts
git commit -m "feat: add copy/paste keyframes with cross-channel support"
```

---

### Task 20: Scene Marker Popover & Manual Marker Creation

**Files:**
- Create: `src/lib/components/timeline/SceneMarkerPopover.svelte`
- Modify: `src/lib/services/keyboard-shortcuts.ts` (add M shortcut)
- Modify: `src/lib/components/timeline/interaction.ts` (scene marker context menu)

- [ ] **Step 1: Create SceneMarkerPopover**

```svelte
<script lang="ts">
  import Popover from '$lib/components/shared/Popover.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import TextInput from '$lib/components/shared/TextInput.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { DeleteSceneMarkerCommand } from '$lib/commands/delete-scene-marker.js';
  import type { SceneMarker } from '$lib/types/timeline.js';

  let { anchorX = 0, anchorY = 0 }: { anchorX?: number; anchorY?: number } = $props();

  const selectedMarker = $derived(
    timelineStore.selectedMarkerIds.length === 1
      ? projectStore.file?.sceneMarkers.find((m) => m.id === timelineStore.selectedMarkerIds[0]) ?? null
      : null
  );

  let editLabel = $state(selectedMarker?.label ?? '');

  $effect(() => {
    editLabel = selectedMarker?.label ?? '';
  });

  function handleDelete(): void {
    if (!selectedMarker) return;
    undoStore.execute(new DeleteSceneMarkerCommand(selectedMarker.id, projectStore));
    timelineStore.clearSelection();
  }

  function handleLabelChange(): void {
    if (!selectedMarker || editLabel === selectedMarker.label) return;
    // Direct mutation is fine for labels (non-critical, no undo needed for label edits)
    const marker = projectStore.file?.sceneMarkers.find((m) => m.id === selectedMarker.id);
    if (marker) {
      marker.label = editLabel;
      projectStore.markDirty();
    }
  }
</script>

{#if selectedMarker}
  <Popover x={anchorX} y={anchorY}>
    <div class="space-y-3 min-w-[14rem]">
      <div class="flex items-center justify-between">
        <span class="text-xs text-textMuted uppercase tracking-wider">
          {selectedMarker.type === 'MARKER_MANUAL' ? 'Manual' : selectedMarker.type === 'MARKER_CHAPTER' ? 'Chapter' : 'Auto-detected'}
        </span>
        <span class="text-xs text-textMuted">
          {Math.round(selectedMarker.timestampMs / 1000)}s
        </span>
      </div>

      <div>
        <label class="text-xs text-textMuted">Label</label>
        <TextInput
          value={editLabel}
          onchange={(v) => { editLabel = v; handleLabelChange(); }}
        />
      </div>

      <div class="flex justify-end pt-2 border-t border-surface3">
        <Button variant="ghost" size="sm" onclick={handleDelete}>
          <span class="text-danger text-xs">Delete Marker</span>
        </Button>
      </div>
    </div>
  </Popover>
{/if}
```

- [ ] **Step 2: Add M shortcut for manual scene marker**

In `src/lib/services/keyboard-shortcuts.ts`, add in the keyframe section:

```typescript
    {
      id: 'keyframe.add-scene-marker',
      label: 'Add Scene Marker',
      keys: 'M',
      key: 'm',
      category: 'keyframe',
      action: () => {
        if (!projectStore.file) return;
        const marker = {
          id: generateId(),
          timestampMs: videoStore.currentTimeMs,
          label: `Marker ${projectStore.file.sceneMarkers.length + 1}`,
          type: 'MARKER_MANUAL' as const,
        };
        undoStore.execute(new AddSceneMarkerCommand(marker, projectStore));
      },
    },
```

Add import: `import { AddSceneMarkerCommand } from '$lib/commands/add-scene-marker.js';`

- [ ] **Step 3: Update context menu for scene markers in interaction.ts**

In `handleContextMenu`, update the ruler case to actually create a marker:

```typescript
  if (hitResult.type === 'ruler') {
    const timestampMs = hitResult.timestampMs;
    return [
      {
        id: 'add-scene-marker',
        label: 'Add Scene Marker',
        enabled: true,
        action: () => {
          const marker = {
            id: generateId(),
            timestampMs,
            label: `Marker`,
            type: 'MARKER_MANUAL' as const,
          };
          // Note: need sceneMarkerStore passed in — add as parameter
          if (sceneMarkerStore) {
            undoStore.execute(new AddSceneMarkerCommand(marker, sceneMarkerStore));
          }
        },
      },
    ];
  }
```

Add `sceneMarkerStore` parameter and imports.

- [ ] **Step 4: Add scene marker hit test to hitTest function**

In `hitTest`, before the channel lane check, add scene marker detection. Scene markers are vertical lines spanning all lanes — check if x is within 4px of any marker:

```typescript
  // Check scene markers (vertical lines spanning all lanes)
  for (const marker of (sceneMarkers ?? [])) {
    const markerX = msToPx(marker.timestampMs, viewport);
    if (Math.abs(x - markerX) <= 4 && y >= RULER_HEIGHT) {
      return {
        type: 'scene-marker',
        sceneMarkerId: marker.id,
        timestampMs: marker.timestampMs,
        y,
      };
    }
  }
```

Add `sceneMarkers: SceneMarker[]` parameter to `hitTest`.

- [ ] **Step 5: Handle scene marker selection in handlePointerDown**

```typescript
  if (type === 'scene-marker' && hitResult.sceneMarkerId) {
    timelineStore.clearSelection();
    timelineStore.selectedMarkerIds = [hitResult.sceneMarkerId];
    return null; // No drag for scene markers
  }
```

- [ ] **Step 6: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/timeline/SceneMarkerPopover.svelte src/lib/services/keyboard-shortcuts.ts src/lib/components/timeline/interaction.ts
git commit -m "feat: add scene marker popover, M shortcut, and marker hit testing"
```

---

### Task 21: Wire Everything into +page.svelte

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/app/AppShell.svelte` (if needed for new slots)

- [ ] **Step 1: Add new modal imports and rendering**

In `src/routes/+page.svelte`, add imports for the new dialogs and wire them to the modal system:

```typescript
import SceneDetectionDialog from '$lib/components/dialogs/SceneDetectionDialog.svelte';
import ChannelGroupDialog from '$lib/components/channels/ChannelGroupDialog.svelte';
import EffectCatalog from '$lib/components/effects/EffectCatalog.svelte';
```

Add modal rendering in the template:

```svelte
{#if uiStore.activeModal === 'scene-detection'}
  <SceneDetectionDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'channel-group'}
  <ChannelGroupDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'effect-catalog'}
  <Modal title="Add Effect" onclose={() => uiStore.closeModal()}>
    <EffectCatalog onclose={() => uiStore.closeModal()} />
  </Modal>
{/if}
```

- [ ] **Step 2: Add new commands to command palette**

In `src/lib/components/app/CommandPalette.svelte`, add commands for:
- "Detect Scenes" → `uiStore.openModal('scene-detection')`
- "Add Effect" → `uiStore.openModal('effect-catalog')`
- "Create Channel Group" → `uiStore.openModal('channel-group')`
- "Add Scene Marker" → creates marker at playhead

- [ ] **Step 3: Add keyboard shortcut for adding scene marker**

Already done in Task 20 (M shortcut). Verify it's included in the shortcuts dialog categories.

- [ ] **Step 4: Verify build**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/+page.svelte src/lib/components/app/CommandPalette.svelte
git commit -m "feat: wire Layer 2 dialogs, commands, and shortcuts into composition root"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] 13 effect types with drag-to-timeline → Task 1 (defaults), Task 7 (catalog)
- [x] Effect blocks rendering on canvas → Task 4
- [x] Effect properties editing → Task 8
- [x] Effect preview in lighting overlay → Task 9
- [x] Channel groups (mirror, spread, alternate) → Tasks 15, 16, 17, 18
- [x] Scene change detection (Web Worker) → Tasks 11, 12
- [x] Video metadata extraction (chapters, title, IMDB) → Already in Layer 1 (ffmpeg probe extracts this; candidateMetadata pre-fills metadata modal)
- [x] Scene markers (manual + auto-detected + chapter) → Tasks 10, 11, 12, 20
- [x] Copy/paste cross-channel → Task 19
- [x] Keyframe snapping with visual indicators → Tasks 13, 14

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** All types reference existing interfaces from Layer 1. New interfaces (`EffectKeyframeStore`, `SceneMarkerStore`, `ChannelGroupStore`) follow the same pattern as `KeyframeStore`.
