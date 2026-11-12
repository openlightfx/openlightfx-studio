import type { BulbInfo, LibraryItem, TrackSummary } from '$lib/api/types';
import { connectStudio, type BackendMode, type StudioSession } from '$lib/api/session';
import { resolveStreamUrl } from '$lib/api/urls';
import { displayRgb, rgbToHex } from '$lib/engine/color';
import { frameDurationMs } from '$lib/engine/time';
import { previewIntervalMs, sampleChannel, withDrag, framesForBulbs } from '$lib/engine/sample';
import type { DragOverride } from '$lib/engine/sample';
import {
  addChannel,
  addEffect,
  addKeyframe,
  copySelection,
  nudgeItems,
  pasteClipboard,
  patchChannel,
  patchEffects,
  patchKeyframes,
  placeItems,
  removeChannel,
  removeItems,
  slugId,
  type Clipboard,
  type EffectPatch,
  type ItemPlacement,
  type KeyframePatch
} from '$lib/model/edit';
import { createHistory, historyPush, historyRedo, historyUndo, type HistoryStack } from '$lib/model/history';
import { createSampleTrack, sampleMarkers } from '$lib/model/sample';
import {
  CHANNEL_PRESETS,
  cloneTrack,
  createId,
  plainClone,
  makeChannel,
  makeEffect,
  makeKeyframe,
  type Channel,
  type EffectType,
  type LightFXTrack,
  type Marker,
  type TrackMetadata
} from '$lib/model/types';
import { contentEndMs, validateTrack, type ValidationIssue } from '$lib/model/validate';
import { FramePump } from '$lib/preview/pump';
import { decodeTrack, encodeTrack, fileNameFor } from '$lib/proto/codec';
import { loadAutosave } from '$lib/storage/autosave';
import { placeFromTrack, type Placed } from '$lib/timeline/hit';
import {
  MAX_PX_PER_MS,
  contentHeight,
  fitAll,
  minPixelsPerMs,
  panBy,
  timeToX,
  zoomAround,
  type View
} from '$lib/timeline/geometry';

interface Hist {
  track: LightFXTrack;
  markers: Marker[];
  mapping: Record<string, string[]>;
}

interface Persisted {
  track: LightFXTrack;
  markers?: Marker[];
  mapping?: Record<string, string[]>;
  itemId?: string | null;
  trackId?: string | null;
  fps?: number;
  viewStartMs?: number;
  pixelsPerMs?: number;
  scrollY?: number;
  playheadMs?: number;
  snap?: boolean;
  muted?: string[];
  solo?: string[];
}

export interface Selection {
  keyframes: string[];
  effects: string[];
  markers: string[];
  channelId: string | null;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface LightLamp {
  id: string;
  name: string;
  color: string;
  brightness: number;
}

const emptySelection = (): Selection => ({
  keyframes: [],
  effects: [],
  markers: [],
  channelId: null
});

export class Editor {
  loaded = $state(false);
  loadError = $state('');
  track = $state<LightFXTrack>(createSampleTrack());
  markers = $state<Marker[]>(sampleMarkers());
  selection = $state<Selection>({
    keyframes: ['kf_center_70000'],
    effects: [],
    markers: [],
    channelId: 'center'
  });
  playheadMs = $state(72_000);
  playing = $state(false);
  snapEnabled = $state(true);
  fps = $state(24);
  viewStartMs = $state(0);
  pixelsPerMs = $state(0);
  scrollY = $state(0);
  viewportW = $state(1);
  viewportH = $state(1);
  drag = $state<{ items: ItemPlacement[]; guideMs: number | null } | null>(null);
  marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  clipboard = $state<Clipboard | null>(null);
  mapping = $state<Record<string, string[]>>({});
  muted = $state<string[]>([]);
  solo = $state<string[]>([]);
  hardwarePreview = $state(false);
  backend = $state<BackendMode>('mock');
  backendMessage = $state('Starting…');
  bulbs = $state<BulbInfo[]>([]);
  itemId = $state<string | null>(null);
  trackId = $state<string | null>(null);
  videoUrl = $state<string | null>(null);
  videoName = $state('');
  videoDurationMs = $state(0);
  modal = $state<null | 'new' | 'library' | 'settings' | 'mapping' | 'shortcuts'>(null);
  toasts = $state<Toast[]>([]);
  lightBar = $state<LightLamp[]>([]);
  libraryItems = $state<LibraryItem[]>([]);
  libraryTracks = $state<TrackSummary[]>([]);
  docRev = $state(0);
  undoCount = $state(0);
  redoCount = $state(0);
  lastAction = $state('');
  pendingSpan: number | null = 180_000;

  private history: HistoryStack<Hist> = createHistory<Hist>(100);
  private gesture: { label: string; before: Hist } | null = null;
  private session: StudioSession | null = null;
  private pump: FramePump | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private videoObjectUrl: string | null = null;
  private raf = 0;
  private playAnchorMs = 72_000;
  private playAnchorPerf = 0;
  private lastSaveTick = 0;
  private nudgeTimer = 0;
  private toastSeq = 1;
  private importInput: HTMLInputElement | null = null;
  private videoInput: HTMLInputElement | null = null;

  get issues(): ValidationIssue[] {
    return validateTrack(this.track);
  }

  async init(): Promise<void> {
    try {
      this.session = await connectStudio(import.meta.env.DEV);
      this.backend = this.session.mode;
      this.backendMessage = this.session.message;
      this.bulbs = this.session.bulbs;
      const saved = await loadAutosave().catch(() => null);
      if (saved) {
        try {
          this.restore(saved.payload);
        } catch {
          this.applySample();
        }
      } else {
        this.applySample();
      }
      if (!Object.values(this.mapping).some((ids) => ids.length > 0)) this.autoMap();
      this.pump = new FramePump(async (states) => {
        if (!this.hardwarePreview || !this.session || this.session.mode === 'offline') return;
        await this.session.api.previewFrame({ states });
      });
      window.addEventListener('pagehide', () => {
        this.pump?.markStopped();
        void this.session?.api.previewStop().catch(() => undefined);
      });
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : 'Failed to start';
      this.applySample();
    } finally {
      this.loaded = true;
      this.startLoop();
    }
  }

  persisted(): Persisted {
    return {
      track: $state.snapshot(this.track) as LightFXTrack,
      markers: $state.snapshot(this.markers) as Marker[],
      mapping: $state.snapshot(this.mapping) as Record<string, string[]>,
      itemId: this.itemId,
      trackId: this.trackId,
      fps: this.fps,
      viewStartMs: this.viewStartMs,
      pixelsPerMs: this.pixelsPerMs,
      scrollY: this.scrollY,
      playheadMs: this.playheadMs,
      snap: this.snapEnabled,
      muted: this.muted.slice(),
      solo: this.solo.slice()
    };
  }

  bindVideo(el: HTMLVideoElement | null): void {
    this.videoEl = el;
  }

  registerPickers(pickers: { importFile: HTMLInputElement | null; videoFile: HTMLInputElement | null }): void {
    this.importInput = pickers.importFile;
    this.videoInput = pickers.videoFile;
  }

  pickImport(): void {
    this.importInput?.click();
  }

  pickVideo(): void {
    this.videoInput?.click();
  }

  view(): View {
    return {
      viewStartMs: this.viewStartMs,
      pixelsPerMs: Math.max(this.pixelsPerMs, 1e-9),
      widthPx: this.viewportW,
      heightPx: this.viewportH,
      scrollY: this.scrollY,
      durationMs: Math.max(1000, this.track.metadata.durationMs)
    };
  }

  placed(): Placed[] {
    const overrides = new Map<
      string,
      { channelId: string; timestampMs: number; durationMs: number; transitionMs: number }
    >();
    for (const item of this.drag?.items ?? []) {
      overrides.set(`${item.kind}:${item.id}`, item);
    }
    return placeFromTrack(
      this.track.channels,
      this.track.keyframes,
      this.track.effectKeyframes,
      overrides
    );
  }

  selectedIds(): Set<string> {
    return new Set([...this.selection.keyframes, ...this.selection.effects, ...this.selection.markers]);
  }

  activeChannelId(): string | null {
    if (this.selection.channelId && this.track.channels.some((c) => c.id === this.selection.channelId)) {
      return this.selection.channelId;
    }
    const kf = this.track.keyframes.find((k) => this.selection.keyframes.includes(k.id));
    if (kf) return kf.channelId;
    const fx = this.track.effectKeyframes.find((e) => this.selection.effects.includes(e.id));
    if (fx) return fx.channelId;
    return this.track.channels[0]?.id ?? null;
  }

  setViewport(width: number, height: number): void {
    this.viewportW = Math.max(1, width);
    this.viewportH = Math.max(1, height);
    const maxScroll = Math.max(0, contentHeight(this.track.channels.length) - this.viewportH);
    if (this.scrollY > maxScroll) this.scrollY = maxScroll;
    if (this.pixelsPerMs > 0) return;
    if (this.pendingSpan && this.pendingSpan > 0) {
      const span = this.pendingSpan;
      this.pendingSpan = null;
      const min = minPixelsPerMs(this.viewportW, this.track.metadata.durationMs);
      this.pixelsPerMs = Math.min(MAX_PX_PER_MS, Math.max(min, this.viewportW / span));
      this.viewStartMs = Math.max(0, this.playheadMs - span * 0.35);
      return;
    }
    this.fit(false);
  }

  fit(record = true): void {
    const next = fitAll(this.viewportW, Math.max(1000, this.track.metadata.durationMs));
    this.viewStartMs = next.viewStartMs;
    this.pixelsPerMs = next.pixelsPerMs;
    if (record) this.docRev++;
  }

  zoomAt(cursorX: number, factor: number): void {
    const next = zoomAround(this.view(), cursorX, factor);
    this.viewStartMs = next.viewStartMs;
    this.pixelsPerMs = next.pixelsPerMs;
    this.docRev++;
  }

  zoomPlayhead(factor: number): void {
    const x = timeToX(this.view(), this.playheadMs);
    const cursor = x < 0 || x > this.viewportW ? this.viewportW / 2 : x;
    this.zoomAt(cursor, factor);
  }

  panPixels(dx: number): void {
    this.viewStartMs = panBy(this.view(), dx);
    this.docRev++;
  }

  scrollBy(dy: number): void {
    const maxScroll = Math.max(0, contentHeight(this.track.channels.length) - this.viewportH);
    this.scrollY = Math.min(maxScroll, Math.max(0, this.scrollY + dy));
  }

  setPlayhead(ms: number): void {
    const dur = Math.max(0, this.track.metadata.durationMs);
    this.playheadMs = Math.min(dur, Math.max(0, ms));
    this.playAnchorMs = this.playheadMs;
    this.playAnchorPerf = performance.now();
    const video = this.videoEl;
    if (video && Number.isFinite(video.duration)) {
      const target = this.playheadMs / 1000;
      if (Math.abs(video.currentTime - target) > 0.03) video.currentTime = Math.min(video.duration, target);
    }
  }

  async togglePlay(): Promise<void> {
    this.playing = !this.playing;
    if (!this.playing) {
      this.videoEl?.pause();
      this.docRev++;
      return;
    }
    this.playAnchorMs = this.playheadMs;
    this.playAnchorPerf = performance.now();
    if (!this.videoEl) return;
    try {
      this.videoEl.currentTime = this.playheadMs / 1000;
      await this.videoEl.play();
    } catch {
      this.playing = false;
      this.toast('Playback was blocked by the browser');
    }
  }

  noteVideoDuration(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.videoDurationMs = Math.round(seconds * 1000);
  }

  useVideoDuration(): void {
    if (this.videoDurationMs <= 0) return;
    this.patchMeta({ durationMs: this.videoDurationMs });
  }

  setLocalVideo(file: File): void {
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    this.videoObjectUrl = URL.createObjectURL(file);
    this.videoUrl = this.videoObjectUrl;
    this.videoName = file.name;
    this.toast(`Video: ${file.name}`);
  }

  begin(label: string): void {
    if (this.gesture?.label === label) return;
    if (this.gesture) this.end();
    this.gesture = { label, before: this.capture() };
  }

  end(): void {
    clearTimeout(this.nudgeTimer);
    if (!this.gesture) return;
    const before = this.gesture.before;
    this.gesture = null;
    const after = this.capture();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    historyPush(this.history, before);
    this.syncHist();
    this.lastAction = 'Edit';
    this.prune();
    this.docRev++;
  }

  transact(label: string, fn: () => void): void {
    this.end();
    const before = this.capture();
    fn();
    const after = this.capture();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    historyPush(this.history, before);
    this.syncHist();
    this.lastAction = label;
    this.prune();
    this.docRev++;
  }

  undo(): void {
    this.end();
    const prev = historyUndo(this.history, this.capture());
    if (!prev) return;
    this.restoreHist(prev);
    this.lastAction = 'Undo';
  }

  redo(): void {
    this.end();
    const next = historyRedo(this.history, this.capture());
    if (!next) return;
    this.restoreHist(next);
    this.lastAction = 'Redo';
  }

  setSelection(next: {
    keyframes?: string[];
    effects?: string[];
    markers?: string[];
    channelId?: string | null;
  }): void {
    this.selection = {
      keyframes: next.keyframes ?? this.selection.keyframes,
      effects: next.effects ?? this.selection.effects,
      markers: next.markers ?? this.selection.markers,
      channelId: next.channelId === undefined ? this.selection.channelId : next.channelId
    };
  }

  selectChannel(id: string): void {
    this.selection = { keyframes: [], effects: [], markers: [], channelId: id };
  }

  clearSelection(): void {
    this.selection = { ...emptySelection(), channelId: this.activeChannelId() };
  }

  selectAll(): void {
    this.selection = {
      keyframes: this.track.keyframes.map((k) => k.id),
      effects: this.track.effectKeyframes.map((e) => e.id),
      markers: this.markers.map((m) => m.id),
      channelId: this.activeChannelId()
    };
  }

  selectChannelItems(channelId: string): void {
    this.selection = {
      keyframes: this.track.keyframes.filter((k) => k.channelId === channelId).map((k) => k.id),
      effects: this.track.effectKeyframes.filter((e) => e.channelId === channelId).map((e) => e.id),
      markers: [],
      channelId
    };
  }

  setDrag(items: ItemPlacement[] | null, guideMs: number | null): void {
    this.drag = items ? { items, guideMs } : null;
  }

  commitDrag(): void {
    const drag = this.drag;
    this.drag = null;
    this.marquee = null;
    if (!drag) return;
    this.transact('Move', () => {
      const placed = placeItems(this.track, this.markers, drag.items);
      this.track = placed.track;
      this.markers = placed.markers;
    });
  }

  cancelDrag(): void {
    this.drag = null;
    this.marquee = null;
  }

  addKeyframeAt(channelId: string, timeMs: number): void {
    const frame = frameDurationMs(this.fps);
    const time = Math.max(0, Math.round(timeMs));
    const existing = this.track.keyframes.find(
      (k) => k.channelId === channelId && Math.abs(k.timestampMs - time) <= frame / 2
    );
    if (existing) {
      this.selection = { keyframes: [existing.id], effects: [], markers: [], channelId };
      return;
    }
    const state = sampleChannel(this.track, channelId, time);
    const id = createId('kf');
    const kf = makeKeyframe({
      id,
      channelId,
      timestampMs: time,
      color: { r: state.r, g: state.g, b: state.b },
      brightness: Math.max(state.brightness, 20),
      transitionMs: Math.min(600, time),
      interpolation: 'LINEAR',
      powerOn: true
    });
    this.transact('Add keyframe', () => {
      this.track = addKeyframe(this.track, kf);
    });
    this.selection = { keyframes: [id], effects: [], markers: [], channelId };
  }

  addEffectAt(channelId: string, timeMs: number, effectType: EffectType = 'LIGHTNING'): void {
    const id = createId('fx');
    const fx = makeEffect({
      id,
      channelId,
      timestampMs: Math.max(0, Math.round(timeMs)),
      effectType,
      durationMs: 2000,
      intensity: 80
    });
    this.transact('Add effect', () => {
      this.track = addEffect(this.track, fx);
    });
    this.selection = { keyframes: [], effects: [id], markers: [], channelId };
  }

  addMarkerAt(timeMs: number): void {
    const id = createId('mk');
    const marker: Marker = { id, timestampMs: Math.max(0, Math.round(timeMs)), label: 'Marker' };
    this.transact('Add marker', () => {
      this.markers = [...this.markers, marker].sort((a, b) => a.timestampMs - b.timestampMs);
    });
    this.selection = { keyframes: [], effects: [], markers: [id], channelId: this.activeChannelId() };
  }

  patchSelectedKeyframes(patch: KeyframePatch): void {
    const ids = this.selection.keyframes;
    if (ids.length === 0) return;
    const apply = () => {
      this.track = patchKeyframes(this.track, ids, patch);
    };
    if (this.gesture) apply();
    else this.transact('Edit keyframe', apply);
  }

  patchSelectedEffects(patch: EffectPatch): void {
    const ids = this.selection.effects;
    if (ids.length === 0) return;
    const apply = () => {
      this.track = patchEffects(this.track, ids, patch);
    };
    if (this.gesture) apply();
    else this.transact('Edit effect', apply);
  }

  patchMarker(id: string, patch: Partial<Pick<Marker, 'label' | 'timestampMs'>>): void {
    const apply = () => {
      this.markers = this.markers
        .map((m) =>
          m.id === id
            ? {
                ...m,
                label: patch.label ?? m.label,
                timestampMs: Math.max(0, Math.round(patch.timestampMs ?? m.timestampMs))
              }
            : m
        )
        .sort((a, b) => a.timestampMs - b.timestampMs);
    };
    if (this.gesture) apply();
    else this.transact('Edit marker', apply);
  }

  patchMeta(patch: Partial<TrackMetadata>): void {
    const apply = () => {
      const track = cloneTrack(this.track);
      track.metadata = { ...track.metadata, ...patch };
      if (patch.movieReference) {
        track.metadata.movieReference = {
          ...track.metadata.movieReference,
          ...patch.movieReference
        };
      }
      if (patch.durationMs !== undefined) {
        track.metadata.durationMs = Math.max(contentEndMs(track), Math.round(patch.durationMs));
      }
      this.track = track;
    };
    if (this.gesture) apply();
    else this.transact('Edit track', apply);
  }

  patchSafety(patch: Partial<LightFXTrack['safetyInfo']>): void {
    const apply = () => {
      const track = cloneTrack(this.track);
      track.safetyInfo = { ...track.safetyInfo, ...patch };
      this.track = track;
    };
    if (this.gesture) apply();
    else this.transact('Edit safety', apply);
  }

  updateChannel(id: string, patch: Partial<Channel> & { id?: string }): void {
    const apply = () => {
      this.track = patchChannel(this.track, id, patch);
      const stillThere = this.track.channels.some((c) => c.id === id);
      const nextId =
        patch.id && !stillThere && this.track.channels.some((c) => c.id === patch.id) ? patch.id : undefined;
      if (nextId && nextId !== id && this.mapping[id]) {
        const mapping = { ...this.mapping, [nextId]: this.mapping[id] };
        delete mapping[id];
        this.mapping = mapping;
      }
      if (nextId && this.selection.channelId === id) this.selection = { ...this.selection, channelId: nextId };
    };
    if (this.gesture) apply();
    else this.transact('Edit channel', apply);
  }

  addChannelFromName(name: string): void {
    const id = slugId(name, 'channel');
    const channel = makeChannel(id, name.trim() || 'Channel', 'SPATIAL_UNSPECIFIED');
    this.transact('Add channel', () => {
      this.track = addChannel(this.track, channel);
    });
    const created = this.track.channels[this.track.channels.length - 1];
    this.selectChannel(created.id);
  }

  deleteChannel(id: string): void {
    if (this.track.channels.length <= 1) {
      this.toast('A track needs at least one channel');
      return;
    }
    this.transact('Delete channel', () => {
      const next = removeChannel(this.track, this.markers, id);
      this.track = next.track;
      const mapping = { ...this.mapping };
      delete mapping[id];
      this.mapping = mapping;
      this.muted = this.muted.filter((x) => x !== id);
      this.solo = this.solo.filter((x) => x !== id);
    });
  }

  deleteSelected(): void {
    if (
      this.selection.keyframes.length + this.selection.effects.length + this.selection.markers.length ===
      0
    ) {
      return;
    }
    this.transact('Delete', () => {
      const next = removeItems(
        this.track,
        this.markers,
        this.selection.keyframes,
        this.selection.effects,
        this.selection.markers
      );
      this.track = next.track;
      this.markers = next.markers;
    });
  }

  nudge(deltaMs: number): void {
    const count =
      this.selection.keyframes.length + this.selection.effects.length + this.selection.markers.length;
    if (count === 0) {
      this.setPlayhead(this.playheadMs + deltaMs);
      return;
    }
    this.begin('Nudge');
    const moved = nudgeItems(
      this.track,
      this.markers,
      this.selection.keyframes,
      this.selection.effects,
      this.selection.markers,
      deltaMs
    );
    this.track = moved.track;
    this.markers = moved.markers;
    clearTimeout(this.nudgeTimer);
    this.nudgeTimer = window.setTimeout(() => this.end(), 300);
  }

  jump(dir: -1 | 1): void {
    const times = [
      ...this.track.keyframes.map((k) => k.timestampMs),
      ...this.track.effectKeyframes.map((e) => e.timestampMs),
      ...this.markers.map((m) => m.timestampMs)
    ].sort((a, b) => a - b);
    if (dir > 0) {
      const next = times.find((t) => t > this.playheadMs + 0.5);
      if (next !== undefined) this.setPlayhead(next);
    } else {
      const prev = [...times].reverse().find((t) => t < this.playheadMs - 0.5);
      if (prev !== undefined) this.setPlayhead(prev);
    }
  }

  copy(): void {
    const clip = copySelection(
      this.track,
      this.markers,
      this.selection.keyframes,
      this.selection.effects,
      this.selection.markers
    );
    if (!clip) return;
    this.clipboard = clip;
    this.lastAction = 'Copy';
  }

  cut(): void {
    this.copy();
    this.deleteSelected();
  }

  paste(): void {
    if (!this.clipboard) return;
    const result = pasteClipboard(
      this.track,
      this.markers,
      $state.snapshot(this.clipboard) as Clipboard,
      this.playheadMs,
      this.activeChannelId()
    );
    this.transact('Paste', () => {
      this.track = result.track;
      this.markers = result.markers;
    });
    this.selection = {
      keyframes: result.keyframeIds,
      effects: result.effectIds,
      markers: result.markerIds,
      channelId: this.activeChannelId()
    };
  }

  duplicate(): void {
    const clip = copySelection(
      this.track,
      this.markers,
      this.selection.keyframes,
      this.selection.effects,
      this.selection.markers
    );
    if (!clip) return;
    const frame = frameDurationMs(this.fps);
    const result = pasteClipboard(this.track, this.markers, clip, clip.minMs + frame, null);
    this.transact('Duplicate', () => {
      this.track = result.track;
      this.markers = result.markers;
    });
    this.selection = {
      keyframes: result.keyframeIds,
      effects: result.effectIds,
      markers: result.markerIds,
      channelId: this.activeChannelId()
    };
  }

  toggleSnap(): void {
    this.snapEnabled = !this.snapEnabled;
  }

  toggleMute(id: string): void {
    this.muted = this.muted.includes(id) ? this.muted.filter((x) => x !== id) : [...this.muted, id];
    this.docRev++;
  }

  toggleSolo(id: string): void {
    this.solo = this.solo.includes(id) ? this.solo.filter((x) => x !== id) : [...this.solo, id];
    this.docRev++;
  }

  autoMap(): void {
    const mapping: Record<string, string[]> = {};
    this.track.channels.forEach((channel, index) => {
      const bulb = this.bulbs[index];
      if (bulb) mapping[channel.id] = [bulb.id];
    });
    this.mapping = mapping;
    this.docRev++;
  }

  toggleBulb(channelId: string, bulbId: string): void {
    this.transact('Map bulb', () => {
      const current = new Set(this.mapping[channelId] ?? []);
      if (current.has(bulbId)) current.delete(bulbId);
      else current.add(bulbId);
      this.mapping = { ...this.mapping, [channelId]: [...current] };
    });
  }

  async setHardwarePreview(on: boolean): Promise<void> {
    if (!on) {
      this.hardwarePreview = false;
      this.pump?.markStopped();
      try {
        await this.session?.api.previewStop();
      } catch {
        /* already stopped */
      }
      return;
    }
    if (!this.session || this.session.mode === 'offline') {
      this.toast('No bulb backend — on-screen lights still run');
      return;
    }
    const mapping: Record<string, string[]> = {};
    for (const [channelId, bulbIds] of Object.entries(this.mapping)) mapping[channelId] = [...bulbIds];
    if (Object.values(mapping).every((ids) => ids.length === 0)) {
      this.toast('Map channels to bulbs to drive hardware');
    }
    try {
      await this.session.api.previewStart({ mapping });
      this.pump?.resume();
      this.hardwarePreview = true;
    } catch (err) {
      this.hardwarePreview = false;
      this.toast(err instanceof Error ? err.message : 'Could not start bulb preview', 'error');
    }
  }

  newTrack(presetIndex: number, title: string, durationMin: number): void {
    const preset = CHANNEL_PRESETS[presetIndex] ?? CHANNEL_PRESETS[0];
    const track = cloneTrack(this.track);
    track.metadata = {
      ...track.metadata,
      title: title.trim() || 'Untitled Track',
      durationMs: Math.max(1000, Math.round(durationMin * 60 * 1000)),
      movieReference: {
        imdbId: '',
        title: '',
        year: new Date().getFullYear(),
        runtimeMinutes: Math.round(durationMin)
      }
    };
    track.channels = preset.channels.map((c) => plainClone(c));
    track.keyframes = [];
    track.effectKeyframes = [];
    track.safetyInfo = {
      containsFlashing: false,
      containsStrobing: false,
      maxFlashFrequencyHz: 0,
      maxBrightnessDelta: 0,
      warningText: '',
      intensityRating: 'SUBTLE'
    };
    this.transact('New track', () => {
      this.track = track;
      this.markers = [];
      this.mapping = {};
      this.selection = emptySelection();
    });
    this.itemId = null;
    this.trackId = null;
    this.playheadMs = 0;
    this.autoMap();
    this.pixelsPerMs = 0;
    this.fit(false);
    this.modal = null;
  }

  loadSample(): void {
    this.transact('Load sample', () => {
      this.applySample();
      this.mapping = {};
    });
    this.autoMap();
    this.pixelsPerMs = 0;
    this.pendingSpan = 180_000;
    this.setViewport(this.viewportW, this.viewportH);
  }

  importBytes(bytes: Uint8Array): void {
    let track: LightFXTrack;
    try {
      track = decodeTrack(bytes);
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'Could not read .lightfx', 'error');
      return;
    }
    this.transact('Import', () => {
      this.track = track;
      this.markers = [];
      this.selection = emptySelection();
    });
    this.trackId = null;
    const issues = validateTrack(track);
    if (issues.length) this.toast(`Imported with ${issues.length} validation issue(s)`, 'error');
    else this.toast('Imported .lightfx');
    this.pixelsPerMs = 0;
    this.fit(false);
  }

  exportBytes(): Uint8Array | null {
    const issues = validateTrack(this.track);
    if (issues.length) {
      this.toast(issues.slice(0, 2).map((issue) => issue.message).join(' · '), 'error');
      return null;
    }
    try {
      return encodeTrack(this.track);
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'Encode failed', 'error');
      return null;
    }
  }

  download(bytes?: Uint8Array): void {
    const data = bytes ?? this.exportBytes();
    if (!data) return;
    const copy = new ArrayBuffer(data.byteLength);
    new Uint8Array(copy).set(data);
    const blob = new Blob([copy], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameFor(this.track);
    a.click();
    URL.revokeObjectURL(url);
    this.lastAction = 'Exported';
  }

  async saveToBackend(): Promise<void> {
    if (!this.session || this.session.mode === 'offline') {
      this.download();
      return;
    }
    if (this.session.mode === 'live' && !this.itemId) {
      this.toast('Choose an Emby item before saving');
      this.modal = 'library';
      return;
    }
    const bytes = this.exportBytes();
    if (!bytes) return;
    const trackId = this.trackId ?? createId('track');
    try {
      await this.session.api.putTrack(trackId, this.itemId ?? '', bytes);
      this.trackId = trackId;
      this.toast('Saved to Emby');
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'Save failed', 'error');
      this.download(bytes);
    }
  }

  async refreshLibrary(search: string): Promise<void> {
    if (!this.session || this.session.mode === 'offline') {
      this.libraryItems = [];
      this.libraryTracks = [];
      return;
    }
    try {
      this.libraryItems = await this.session.api.searchItems(search);
      this.libraryTracks = await this.session.api.listTracks();
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'Library request failed', 'error');
    }
  }

  async openItem(item: LibraryItem): Promise<void> {
    this.transact('Attach movie', () => {
      const track = cloneTrack(this.track);
      track.metadata.movieReference = {
        ...track.metadata.movieReference,
        title: item.name,
        year: item.year,
        runtimeMinutes: Math.round(item.runtimeMs / 60000)
      };
      if (track.metadata.durationMs < item.runtimeMs) track.metadata.durationMs = item.runtimeMs;
      if (!track.metadata.title || track.metadata.title === 'Untitled Track') track.metadata.title = item.name;
      this.track = track;
    });
    this.itemId = item.itemId;
    try {
      const { url } = await this.session!.api.getStreamUrl(item.itemId);
      const resolved = resolveStreamUrl(this.session!.serverRoot, url, this.session!.token);
      if (resolved) {
        if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
        this.videoObjectUrl = null;
        this.videoUrl = resolved;
        this.videoName = item.name;
      } else {
        this.toast('No stream URL — choose a local video file');
      }
    } catch {
      this.toast('Could not get a stream URL');
    }
    this.modal = null;
  }

  async openRemoteTrack(summary: TrackSummary): Promise<void> {
    if (!this.session) return;
    try {
      const bytes = await this.session.api.getTrack(summary.trackId);
      this.importBytes(bytes);
      this.trackId = summary.trackId;
      this.itemId = summary.itemId || null;
      this.toast(`Opened ${summary.title}`);
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'Could not open track', 'error');
    }
  }

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const id = this.toastSeq++;
    this.toasts = [...this.toasts, { id, text, kind }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 4200);
  }

  private applySample(): void {
    this.track = createSampleTrack();
    this.markers = sampleMarkers();
    this.playheadMs = 72_000;
    this.playAnchorMs = 72_000;
    this.selection = {
      keyframes: ['kf_center_70000'],
      effects: [],
      markers: [],
      channelId: 'center'
    };
    this.pendingSpan = 180_000;
    this.itemId = null;
    this.trackId = null;
  }

  private restore(payload: unknown): void {
    const data = payload as Persisted;
    if (!data?.track || !Array.isArray(data.track.channels) || !Array.isArray(data.track.keyframes)) {
      throw new Error('bad autosave');
    }
    this.track = data.track;
    this.markers = Array.isArray(data.markers) ? data.markers : [];
    this.mapping = data.mapping ?? {};
    this.itemId = data.itemId ?? null;
    this.trackId = data.trackId ?? null;
    this.fps = data.fps || 24;
    this.viewStartMs = data.viewStartMs || 0;
    this.pixelsPerMs = data.pixelsPerMs || 0;
    this.scrollY = data.scrollY || 0;
    this.playheadMs = data.playheadMs || 0;
    this.playAnchorMs = this.playheadMs;
    this.snapEnabled = data.snap !== false;
    this.muted = data.muted ?? [];
    this.solo = data.solo ?? [];
    this.pendingSpan = null;
    this.selection = {
      ...emptySelection(),
      channelId: data.track.channels[0]?.id ?? null
    };
  }

  private capture(): Hist {
    return {
      track: $state.snapshot(this.track) as LightFXTrack,
      markers: $state.snapshot(this.markers) as Marker[],
      mapping: $state.snapshot(this.mapping) as Record<string, string[]>
    };
  }

  private restoreHist(hist: Hist): void {
    this.track = plainClone(hist.track);
    this.markers = plainClone(hist.markers);
    this.mapping = plainClone(hist.mapping);
    this.drag = null;
    this.prune();
    this.syncHist();
    this.docRev++;
  }

  private prune(): void {
    const kf = new Set(this.track.keyframes.map((k) => k.id));
    const fx = new Set(this.track.effectKeyframes.map((e) => e.id));
    const mk = new Set(this.markers.map((m) => m.id));
    const ch = new Set(this.track.channels.map((c) => c.id));
    this.selection = {
      keyframes: this.selection.keyframes.filter((id) => kf.has(id)),
      effects: this.selection.effects.filter((id) => fx.has(id)),
      markers: this.selection.markers.filter((id) => mk.has(id)),
      channelId:
        this.selection.channelId && ch.has(this.selection.channelId)
          ? this.selection.channelId
          : (this.track.channels[0]?.id ?? null)
    };
  }

  private syncHist(): void {
    this.undoCount = this.history.past.length;
    this.redoCount = this.history.future.length;
  }

  private startLoop(): void {
    if (this.raf) return;
    const loop = (now: number) => {
      this.tick(now);
      this.refreshLights();
      if (this.hardwarePreview) this.pushPreview();
      if (this.playing && now - this.lastSaveTick > 5000) {
        this.lastSaveTick = now;
        this.docRev++;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(now: number): void {
    if (!this.playing) return;
    const video = this.videoEl;
    if (video && video.readyState >= 2 && !video.paused) {
      this.playheadMs = video.currentTime * 1000;
    } else if (!video) {
      this.playheadMs = Math.min(
        this.track.metadata.durationMs,
        this.playAnchorMs + (now - this.playAnchorPerf)
      );
    }
    if (this.playheadMs >= this.track.metadata.durationMs - 0.5) {
      this.playheadMs = this.track.metadata.durationMs;
      this.playing = false;
      video?.pause();
      this.docRev++;
    }
    this.follow();
  }

  private follow(): void {
    if (this.pixelsPerMs <= 0) return;
    const visible = this.viewportW / this.pixelsPerMs;
    const rel = this.playheadMs - this.viewStartMs;
    if (rel > visible * 0.9 || rel < visible * 0.02) {
      const next = { ...this.view(), viewStartMs: Math.max(0, this.playheadMs - visible * 0.15) };
      this.viewStartMs = panBy({ ...next, viewStartMs: next.viewStartMs }, 0);
    }
  }

  private refreshLights(): void {
    const drag = (this.drag?.items as DragOverride[] | undefined) ?? null;
    const track = withDrag(this.track, drag);
    const muted = new Set(this.muted);
    const solo = new Set(this.solo);
    this.lightBar = track.channels.map((channel) => {
      const audible = solo.size > 0 ? solo.has(channel.id) : !muted.has(channel.id);
      const state = sampleChannel(track, channel.id, this.playheadMs);
      const shown = displayRgb(
        { r: state.r, g: state.g, b: state.b },
        audible && state.powerOn ? state.brightness : 0
      );
      return {
        id: channel.id,
        name: channel.displayName,
        color: rgbToHex(shown),
        brightness: audible ? state.brightness : 0
      };
    });
  }

  private pushPreview(): void {
    if (!this.pump || !this.session || this.session.mode === 'offline') return;
    const interval = previewIntervalMs(this.bulbs, this.mapping);
    this.pump.setIntervalMs(interval);
    const drag = (this.drag?.items as DragOverride[] | undefined) ?? null;
    const track = withDrag(this.track, drag);
    const states = framesForBulbs(
      track,
      this.playheadMs,
      this.mapping,
      this.bulbs,
      new Set(this.muted),
      new Set(this.solo),
      interval
    );
    this.pump.push(states);
  }
}

export const editor = new Editor();
