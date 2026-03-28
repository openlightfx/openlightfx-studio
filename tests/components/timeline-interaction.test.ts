import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hitTest,
  handleDoubleClick,
  handlePointerDown,
  handlePointerUp,
  handleWheel,
  maybeAutoFollowPlayhead,
} from '../../src/lib/components/timeline/interaction.js';
import type { TimelineStoreInterface, UndoStoreInterface } from '../../src/lib/components/timeline/interaction.js';
import type { Channel, Keyframe } from '../../src/lib/types/track.js';
import type { RenderViewport } from '../../src/lib/components/timeline/render.js';
import {
  RULER_HEIGHT,
  CHANNEL_LANE_HEIGHT,
  KEYFRAME_HIT_RADIUS,
  PLAYHEAD_AUTO_FOLLOW_THRESHOLD,
} from '../../src/lib/types/timeline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeViewport(overrides: Partial<RenderViewport> = {}): RenderViewport {
  return {
    pxPerMs: 0.1, // 1 px = 10 ms
    scrollX: 0,
    width: 1000,
    height: 600,
    ...overrides,
  };
}

function makeChannel(id: string, displayName = id): Channel {
  return {
    id,
    displayName,
    description: '',
    defaultColor: { r: 255, g: 255, b: 255 },
    defaultBrightness: 1,
    spatialHint: 'SPATIAL_UNSPECIFIED',
    optional: false,
  };
}

function makeKeyframe(id: string, channelId: string, timestampMs: number): Keyframe {
  return {
    id,
    channelId,
    timestampMs,
    colorMode: 'RGB',
    color: { r: 0, g: 0, b: 0 },
    colorTemperature: 6500,
    brightness: 1,
    transitionMs: 0,
    interpolation: 'STEP',
    powerOn: true,
  };
}

function makeTimelineStore(overrides: Partial<TimelineStoreInterface> = {}): TimelineStoreInterface {
  const store: TimelineStoreInterface = {
    pxPerMs: 0.1,
    scrollX: 0,
    scrollY: 0,
    viewportWidth: 1000,
    viewportHeight: 600,
    selectedKeyframeIds: [],
    selectionRect: null,
    activeChannelId: null,
    selectKeyframe: vi.fn((id: string, additive = false) => {
      if (additive) {
        if (!store.selectedKeyframeIds.includes(id)) {
          store.selectedKeyframeIds = [...store.selectedKeyframeIds, id];
        }
      } else {
        store.selectedKeyframeIds = [id];
      }
    }),
    clearSelection: vi.fn(() => {
      store.selectedKeyframeIds = [];
      store.selectionRect = null;
    }),
    zoom: vi.fn(),
    scrollTo: vi.fn(),
    scrollBy: vi.fn(),
    ...overrides,
  };
  return store;
}

function makeKeyframeStore(keyframes: Keyframe[] = []) {
  return {
    getKeyframes: () => keyframes,
    addKeyframe: vi.fn((kf: Keyframe) => keyframes.push(kf)),
    removeKeyframe: vi.fn((id: string) => {
      const idx = keyframes.findIndex((k) => k.id === id);
      if (idx >= 0) keyframes.splice(idx, 1);
    }),
    updateKeyframe: vi.fn((id: string, patch: Partial<Keyframe>) => {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) Object.assign(kf, patch);
    }),
  };
}

function makeUndoStore(): UndoStoreInterface & { lastCommand: unknown } {
  const undoStore = {
    lastCommand: null as unknown,
    execute: vi.fn(function (this: typeof undoStore, cmd: { execute(): void }) {
      undoStore.lastCommand = cmd;
      cmd.execute();
    }),
  };
  return undoStore;
}

// ---------------------------------------------------------------------------
// hitTest tests
// ---------------------------------------------------------------------------

describe('hitTest — ruler', () => {
  const vp = makeViewport();
  const channels = [makeChannel('ch1'), makeChannel('ch2')];
  const keyframes: Keyframe[] = [];

  it('returns "ruler" when y is 0', () => {
    const result = hitTest(100, 0, vp, channels, keyframes);
    expect(result.type).toBe('ruler');
  });

  it('returns "ruler" when y is exactly RULER_HEIGHT - 1', () => {
    const result = hitTest(100, RULER_HEIGHT - 1, vp, channels, keyframes);
    expect(result.type).toBe('ruler');
  });

  it('includes correct timestampMs for ruler hit', () => {
    // x=200, pxPerMs=0.1, scrollX=0 → timestampMs = 200/0.1 + 0 = 2000
    const result = hitTest(200, 10, vp, channels, keyframes);
    expect(result.type).toBe('ruler');
    expect(result.timestampMs).toBeCloseTo(2000);
  });
});

describe('hitTest — empty lane', () => {
  const vp = makeViewport();
  const channels = [makeChannel('ch1'), makeChannel('ch2')];
  const keyframes: Keyframe[] = [];

  it('returns "empty" with correct channelId when clicking in lane 0', () => {
    // y = RULER_HEIGHT + CHANNEL_LANE_HEIGHT/2 → center of first lane
    const y = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(50, y, vp, channels, keyframes);
    expect(result.type).toBe('empty');
    expect(result.channelId).toBe('ch1');
  });

  it('returns "empty" with correct channelId when clicking in lane 1', () => {
    const y = RULER_HEIGHT + CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(50, y, vp, channels, keyframes);
    expect(result.type).toBe('empty');
    expect(result.channelId).toBe('ch2');
  });

  it('returns correct timestampMs for empty hit', () => {
    // x=500, pxPerMs=0.1, scrollX=0 → 5000 ms
    const y = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(500, y, vp, channels, keyframes);
    expect(result.type).toBe('empty');
    expect(result.timestampMs).toBeCloseTo(5000);
  });

  it('accounts for scrollX in timestampMs calculation', () => {
    const vpScrolled = makeViewport({ scrollX: 1000 });
    // x=100 → (100 / 0.1) + 1000 = 2000 ms
    const y = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(100, y, vpScrolled, channels, keyframes);
    expect(result.type).toBe('empty');
    expect(result.timestampMs).toBeCloseTo(2000);
  });
});

describe('hitTest — keyframe', () => {
  const vp = makeViewport(); // pxPerMs=0.1
  const channels = [makeChannel('ch1'), makeChannel('ch2')];

  it('returns "keyframe" when clicking directly on a keyframe', () => {
    // kf at 1000ms → x = 1000*0.1 = 100
    const kf = makeKeyframe('kf1', 'ch1', 1000);
    const lane0CenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(100, lane0CenterY, vp, channels, [kf]);
    expect(result.type).toBe('keyframe');
    expect(result.keyframeId).toBe('kf1');
    expect(result.channelId).toBe('ch1');
  });

  it('returns "keyframe" when clicking within KEYFRAME_HIT_RADIUS', () => {
    const kf = makeKeyframe('kf1', 'ch1', 1000);
    const kfX = 100;
    const lane0CenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    // Click just inside the hit radius
    const result = hitTest(kfX + KEYFRAME_HIT_RADIUS - 1, lane0CenterY, vp, channels, [kf]);
    expect(result.type).toBe('keyframe');
    expect(result.keyframeId).toBe('kf1');
  });

  it('returns "empty" when clicking just outside KEYFRAME_HIT_RADIUS', () => {
    const kf = makeKeyframe('kf1', 'ch1', 1000);
    const kfX = 100;
    const lane0CenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    // Click just outside
    const result = hitTest(kfX + KEYFRAME_HIT_RADIUS + 2, lane0CenterY, vp, channels, [kf]);
    expect(result.type).toBe('empty');
  });

  it('picks the closest keyframe when two are near', () => {
    // Two keyframes: at 990ms (x=99) and 1010ms (x=101). Click at x=102.
    const kf1 = makeKeyframe('kf1', 'ch1', 990);
    const kf2 = makeKeyframe('kf2', 'ch1', 1010);
    const lane0CenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(102, lane0CenterY, vp, channels, [kf1, kf2]);
    expect(result.type).toBe('keyframe');
    expect(result.keyframeId).toBe('kf2');
  });

  it('ignores keyframes in a different channel lane', () => {
    // kf in ch2 (lane 1), but click is in lane 0 area
    const kf = makeKeyframe('kf1', 'ch2', 1000);
    const lane0CenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const result = hitTest(100, lane0CenterY, vp, channels, [kf]);
    expect(result.type).toBe('empty');
    expect(result.channelId).toBe('ch1');
  });
});

// ---------------------------------------------------------------------------
// handleDoubleClick tests
// ---------------------------------------------------------------------------

describe('handleDoubleClick', () => {
  it('adds a keyframe on empty space via undoStore', () => {
    const keyframes: Keyframe[] = [];
    const store = makeKeyframeStore(keyframes);
    const undoStore = makeUndoStore();
    const hitResult = {
      type: 'empty' as const,
      channelId: 'ch1',
      timestampMs: 3000,
      y: 50,
    };
    const e = new MouseEvent('dblclick');
    handleDoubleClick(e, hitResult, undoStore, store);
    expect(undoStore.execute).toHaveBeenCalledOnce();
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0].channelId).toBe('ch1');
    expect(keyframes[0].timestampMs).toBe(3000);
    expect(keyframes[0].powerOn).toBe(true);
    expect(keyframes[0].brightness).toBe(1.0);
  });

  it('does nothing when hitResult is not "empty"', () => {
    const keyframes: Keyframe[] = [];
    const store = makeKeyframeStore(keyframes);
    const undoStore = makeUndoStore();
    const hitResult = {
      type: 'ruler' as const,
      timestampMs: 1000,
      y: 10,
    };
    const e = new MouseEvent('dblclick');
    handleDoubleClick(e, hitResult, undoStore, store);
    expect(undoStore.execute).not.toHaveBeenCalled();
    expect(keyframes).toHaveLength(0);
  });

  it('does nothing when channelId is missing', () => {
    const keyframes: Keyframe[] = [];
    const store = makeKeyframeStore(keyframes);
    const undoStore = makeUndoStore();
    const hitResult = {
      type: 'empty' as const,
      channelId: undefined,
      timestampMs: 1000,
      y: 50,
    };
    const e = new MouseEvent('dblclick');
    handleDoubleClick(e, hitResult, undoStore, store);
    expect(undoStore.execute).not.toHaveBeenCalled();
  });

  it('generates a unique id for each keyframe', () => {
    const keyframes: Keyframe[] = [];
    const store = makeKeyframeStore(keyframes);
    const undoStore = makeUndoStore();
    const hitResult = { type: 'empty' as const, channelId: 'ch1', timestampMs: 1000, y: 50 };
    const e = new MouseEvent('dblclick');
    handleDoubleClick(e, hitResult, undoStore, store);
    handleDoubleClick(e, { ...hitResult, timestampMs: 2000 }, undoStore, store);
    expect(keyframes[0].id).not.toBe(keyframes[1].id);
  });
});

// ---------------------------------------------------------------------------
// handlePointerDown tests
// ---------------------------------------------------------------------------

describe('handlePointerDown', () => {
  it('returns keyframe drag state when hitting a keyframe', () => {
    const kf = makeKeyframe('kf1', 'ch1', 1000);
    const store = makeTimelineStore();
    const hitResult = {
      type: 'keyframe' as const,
      channelId: 'ch1',
      keyframeId: 'kf1',
      timestampMs: 1000,
      y: 50,
    };
    const e = new PointerEvent('pointerdown', { offsetX: 100, offsetY: 50 } as PointerEventInit);
    const drag = handlePointerDown(e, hitResult, store, [kf]);
    expect(drag).not.toBeNull();
    expect(drag?.type).toBe('keyframe');
    expect(drag?.targetIds).toContain('kf1');
  });

  it('returns selection-rect drag state when clicking empty space', () => {
    const store = makeTimelineStore();
    const hitResult = {
      type: 'empty' as const,
      channelId: 'ch1',
      timestampMs: 500,
      y: 80,
    };
    const e = new PointerEvent('pointerdown', { offsetX: 50, offsetY: 80 } as PointerEventInit);
    const drag = handlePointerDown(e, hitResult, store, []);
    expect(drag?.type).toBe('selection-rect');
    expect(store.clearSelection).toHaveBeenCalled();
  });

  it('sets activeChannelId when clicking in a lane', () => {
    const store = makeTimelineStore();
    const hitResult = {
      type: 'empty' as const,
      channelId: 'ch2',
      timestampMs: 500,
      y: 80,
    };
    const e = new PointerEvent('pointerdown', { offsetX: 50, offsetY: 80 } as PointerEventInit);
    handlePointerDown(e, hitResult, store, []);
    expect(store.activeChannelId).toBe('ch2');
  });

  it('Ctrl+click toggles keyframe selection additively', () => {
    const kf1 = makeKeyframe('kf1', 'ch1', 1000);
    const store = makeTimelineStore();
    store.selectedKeyframeIds = ['kf1'];
    const hitResult = {
      type: 'keyframe' as const,
      channelId: 'ch1',
      keyframeId: 'kf2',
      timestampMs: 2000,
      y: 50,
    };
    const kf2 = makeKeyframe('kf2', 'ch1', 2000);
    const e = new PointerEvent('pointerdown', { offsetX: 200, offsetY: 50, ctrlKey: true } as PointerEventInit);
    handlePointerDown(e, hitResult, store, [kf1, kf2]);
    expect(store.selectKeyframe).toHaveBeenCalledWith('kf2', true);
  });
});

// ---------------------------------------------------------------------------
// handleWheel tests
// ---------------------------------------------------------------------------

describe('handleWheel', () => {
  it('zooms in on Ctrl+wheel up', () => {
    const store = makeTimelineStore();
    const e = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true });
    handleWheel(e, store);
    expect(store.zoom).toHaveBeenCalledWith(1.1, expect.any(Number));
  });

  it('zooms out on Ctrl+wheel down', () => {
    const store = makeTimelineStore();
    const e = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true });
    handleWheel(e, store);
    expect(store.zoom).toHaveBeenCalledWith(0.9, expect.any(Number));
  });

  it('scrolls horizontally on Shift+wheel', () => {
    const store = makeTimelineStore();
    const e = new WheelEvent('wheel', { deltaY: 100, shiftKey: true });
    handleWheel(e, store);
    expect(store.scrollBy).toHaveBeenCalledWith(expect.any(Number));
    expect(store.zoom).not.toHaveBeenCalled();
  });

  it('does not call zoom or scrollBy for plain wheel', () => {
    const store = makeTimelineStore();
    const e = new WheelEvent('wheel', { deltaY: 100 });
    handleWheel(e, store);
    expect(store.zoom).not.toHaveBeenCalled();
    expect(store.scrollBy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// maybeAutoFollowPlayhead tests
// ---------------------------------------------------------------------------

describe('maybeAutoFollowPlayhead', () => {
  it('does not advance viewport when playhead is at 50% of viewport', () => {
    const store = makeTimelineStore({ pxPerMs: 0.1, scrollX: 0, viewportWidth: 1000 });
    // viewportDurationMs = 1000 / 0.1 = 10000ms, playhead at 5000ms → 50%
    maybeAutoFollowPlayhead(5000, store);
    expect(store.scrollTo).not.toHaveBeenCalled();
  });

  it('advances viewport when playhead exceeds PLAYHEAD_AUTO_FOLLOW_THRESHOLD', () => {
    const store = makeTimelineStore({ pxPerMs: 0.1, scrollX: 0, viewportWidth: 1000 });
    // viewportDurationMs = 10000ms, threshold at 75% → 7500ms
    // playhead at 8000ms → 80% → should advance
    maybeAutoFollowPlayhead(8000, store);
    expect(store.scrollTo).toHaveBeenCalled();
    const scrollArg = (store.scrollTo as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(scrollArg).toBeGreaterThan(0);
  });

  it('does not advance viewport when playhead is exactly at threshold', () => {
    const store = makeTimelineStore({ pxPerMs: 0.1, scrollX: 0, viewportWidth: 1000 });
    // threshold = 0.75, viewportDurationMs = 10000ms → threshold at 7500ms
    maybeAutoFollowPlayhead(7500, store);
    // 7500 / 10000 = 0.75, not > threshold (equal), so no advance
    expect(store.scrollTo).not.toHaveBeenCalled();
  });

  it('accounts for scrollX when computing playhead position', () => {
    // scrollX=5000, viewportDuration=10000ms → visible range [5000, 15000]
    // playhead at 12000ms → (12000-5000)/10000 = 70% → below threshold
    const store = makeTimelineStore({ pxPerMs: 0.1, scrollX: 5000, viewportWidth: 1000 });
    maybeAutoFollowPlayhead(12000, store);
    expect(store.scrollTo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handlePointerUp tests
// ---------------------------------------------------------------------------

describe('handlePointerUp', () => {
  it('commits a MoveKeyframeCommand via undoStore when keyframe is moved', () => {
    const kf = makeKeyframe('kf1', 'ch1', 1000);
    const kfStore = makeKeyframeStore([kf]);
    const undoStore = makeUndoStore();
    const tStore = makeTimelineStore({ pxPerMs: 0.1, scrollX: 0 });

    const dragState = {
      type: 'keyframe' as const,
      startX: 100,
      startY: 50,
      startTimestampMs: 1000,
      targetIds: ['kf1'],
      originalTimestamps: new Map([['kf1', 1000]]),
    };

    // Simulate pointer up at x=200 → timestampMs = 200/0.1 = 2000
    const e = new PointerEvent('pointerup');
    Object.defineProperty(e, 'offsetX', { value: 200, configurable: true });
    Object.defineProperty(e, 'offsetY', { value: 50, configurable: true });
    handlePointerUp(e, dragState, tStore, undoStore, kfStore, [makeChannel('ch1')], [kf]);

    expect(undoStore.execute).toHaveBeenCalledOnce();
    expect(kf.timestampMs).toBe(2000);
  });

  it('does not commit a command when no meaningful movement occurred', () => {
    const kf = makeKeyframe('kf1', 'ch1', 1000);
    const kfStore = makeKeyframeStore([kf]);
    const undoStore = makeUndoStore();
    const tStore = makeTimelineStore({ pxPerMs: 0.1, scrollX: 0 });

    const dragState = {
      type: 'keyframe' as const,
      startX: 100,
      startY: 50,
      startTimestampMs: 1000,
      targetIds: ['kf1'],
      originalTimestamps: new Map([['kf1', 1000]]),
    };

    // Same x position as start → deltaMs ≈ 0
    const e = new PointerEvent('pointerup');
    Object.defineProperty(e, 'offsetX', { value: 100, configurable: true });
    Object.defineProperty(e, 'offsetY', { value: 50, configurable: true });
    handlePointerUp(e, dragState, tStore, undoStore, kfStore, [makeChannel('ch1')], [kf]);

    expect(undoStore.execute).not.toHaveBeenCalled();
  });

  it('finalizes selection rect and selects keyframes in bounds', () => {
    const channels = [makeChannel('ch1')];
    const kf = makeKeyframe('kf1', 'ch1', 1000); // x=100 with pxPerMs=0.1
    const kfStore = makeKeyframeStore([kf]);
    const undoStore = makeUndoStore();
    const lane0CenterY = RULER_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    const tStore = makeTimelineStore({
      pxPerMs: 0.1,
      scrollX: 0,
      selectionRect: { startX: 80, startY: lane0CenterY - 10, endX: 80, endY: lane0CenterY - 10 },
    });

    const dragState = {
      type: 'selection-rect' as const,
      startX: 80,
      startY: lane0CenterY - 10,
      startTimestampMs: 800,
      targetIds: [],
      originalTimestamps: new Map<string, number>(),
    };

    // Pointer up at x=120, y=lane0CenterY+10 — kf at x=100 is inside rect
    tStore.selectionRect = {
      startX: 80,
      startY: lane0CenterY - 10,
      endX: 120,
      endY: lane0CenterY + 10,
    };
    const e = new PointerEvent('pointerup');
    Object.defineProperty(e, 'offsetX', { value: 120, configurable: true });
    Object.defineProperty(e, 'offsetY', { value: lane0CenterY + 10, configurable: true });
    handlePointerUp(e, dragState, tStore, undoStore, kfStore, channels, [kf]);

    expect(tStore.selectKeyframe).toHaveBeenCalledWith('kf1', true);
    expect(tStore.selectionRect).toBeNull();
  });
});
