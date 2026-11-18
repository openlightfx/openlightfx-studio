import {
  acceptSpacing,
  anchoredScroll,
  anchoredScrollAt,
  boundedTimelineScale,
  displayedRgb,
  MAX_TRACK_BYTES,
  applyKeyframeMovePlan,
  copyKeyframes,
  planKeyframePaste,
  materializeKeyframePaste,
  type KeyframeClipboard,
  type PasteRejection,
  indexKeyframesForMove,
  planAbsoluteKeyframeTime,
  planSharedKeyframeMove,
  validateTrack,
  addChannel,
  applyZoomChord,
  AUTOSAVE_INTERVAL_MS,
  canInsert,
  chooseLoadSource,
  clampRecoveryPosition,
  classifyLocalFile,
  computeSafety,
  buildEffectKeyframe,
  clampEffectMove,
  effectPreset,
  effectSafetyNote,
  sceneCutLineTimesMs,
  snapEffectStart,
  crashKey,
  createHistory,
  createEditTransaction,
  createIdAllocator,
  decodeTrack,
  encodeTrack,
  frameStepMs,
  adjacentProxyFrameTime,
  quantizeProxyFrameTime,
  importDurationWarning,
  importTrack,
  makeCrashRecord,
  newKeyframe,
  newTrackFromMovie,
  overlaySample,
  adjacentKeyframeTime,
  parseHex,
  patchKeyframes,
  photosensitivityNotice,
  planHostedSave,
  matchesSaveCheckpoint,
  resolveDuration,
  setKelvin,
  sidecarDocument,
  type Channel,
  type CrashRecord,
  type Keyframe,
  type ProjectSidecar,
  type SaveCheckpoint,
  type Track,
  type TrackMetadata,
  type LayoutChangePlan,
  type EditorSelection,
  emptyEditorSelection,
  pruneEditorSelection,
  selectAllEditorKeyframes,
  selectEditorKeyframe,
  selectEditorMarquee,
  keyframesInMarquee,
  changeTrackLayout,
  upgradeLegacyTrackLayout,
} from '$lib/domain';
import { adjacentSceneStopMs, type SceneCutJob, type SceneCuts } from '$lib/domain/scene-cuts';
import type { EffectKeyframe, EffectType } from '$lib/domain/types';
import {
  bytesAsBuffer,
  fetchBulbs,
  fetchFrame,
  fetchItems,
  fetchItem,
  fetchMediaInfo,
  fetchProjectSidecar,
  fetchSceneCutJob,
  fetchSceneCuts,
  fetchSourceWorkspace,
  releaseSourceWorkspace,
  startSourceWorkspace,
  ProjectSidecarLoadError,
  SceneCutAlreadyRunningError,
  SceneCutForbiddenError,
  restartProxy,
  fetchSettings,
  fetchTrackBytes,
  fetchTracks,
  postJson,
  putBytes,
  putJson,
  startSceneCutDetection,
  type Bulb,
  type LibraryItem,
  type MediaInfo,
  type TrackSummary,
} from '$lib/api/client';
import { mergeSceneCuts, readSceneCutCache, writeSceneCutCache } from '$lib/studio/scene-cut-cache';
import { failedProxyMessage, proxyPlayReason, seekPastHorizon } from '$lib/studio/proxy-playback';
import { setPendingImport, takePendingImport } from '$lib/studio/pending-import';
import { framePosition } from '$lib/studio/frame-position';
import { LatestSeekScheduler } from '$lib/studio/latest-seek';
import {
  AuditionLoop,
  emptyAuditionRange,
  restoreAuditionRange,
  rangeReason,
} from '$lib/domain/audition-range';

import { openRecoveryDatabase, RECOVERY_STORE as STORE } from '$lib/studio/recovery-database';
const FPS = 24;
export const INITIAL_PX_PER_MS = 0.032;

// Internal lighting clipboard: shared by editor instances in this tab, never persisted.
let lightingClipboard = $state<KeyframeClipboard | null>(null);
const pasteRejectionMessage: Record<PasteRejection, string> = {
  'invalid-payload': 'The lighting clipboard is not valid. Copy the keyframes again.',
  'invalid-anchor': 'Choose a time inside the movie before pasting.',
  'missing-active-channel': 'Select a destination lane before pasting.',
  'missing-position':
    'This track does not have every copied lighting position. Nothing was pasted.',
  'out-of-bounds': 'The copied passage would extend beyond the movie. Nothing was pasted.',
  'fade-before-start': 'An incoming fade would begin before the movie. Nothing was pasted.',
  'spacing-collision': 'The copied passage is too close to existing keyframes. Nothing was pasted.',
};

export function formatClock(ms: number): string {
  const abs = Math.max(0, Math.round(ms));
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const millis = abs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** How often a building edit proxy is re-read. */
const PROXY_POLL_MS = 1000;

interface AuthoredSnapshot {
  track: Track | null;
  sidecar: ProjectSidecar;
  revision: string;
  selection: string[];
  selectionAnchorId: string | null;
  primarySelectionId: string | null;
  activeChannelId: string | null;
}

export class StudioSession {
  hosted = $state(false);
  localDev = $state(true);
  pluginDown = $state(false);
  nonAdmin = $state(false);
  canManage = $state(false);
  saving = $state(false);
  saveConflict = $state(false);
  pendingRoute = $state('');
  frameUrl = $state('');
  frameLoading = $state(false);
  frameTimeMs = $state<number | null>(null);
  private frameRequest = 0;
  private frameAbort: AbortController | null = null;
  private appliedSeekMs: number | null = null;
  private seekScheduler = new LatestSeekScheduler((target) => this.dispatchScrubbedSeek(target));
  private frameSelection: string[] = [];
  private wasGrowing = false;
  private resumeProxy = false;
  playbackActive = $state(false);
  items = $state<LibraryItem[]>([]);
  search = $state('');
  capped = $state(false);
  item = $state<LibraryItem | null>(null);
  media = $state<MediaInfo | null>(null);
  editorLoading = $state(true);
  editorLoadError = $state('');
  sourceCopyProgress = $state<number | null>(null);
  sourceWorkspaceItemId = '';
  trackChoices = $state<TrackSummary[]>([]);
  track = $state<Track | null>(null);
  /** Transient authoring state; export, recovery and persistence continue to use `track`. */
  draftTrack = $state<Track | null>(null);
  draftLabel = $state('');
  trackId = $state('track');
  serverUpdatedAt = $state(0);
  trackUpdatedAt = $state('');
  durationKnown = $state(false);
  movieMs = $state<number | null>(null);
  dirty = $state(false);
  canUndo = $state(false);
  canRedo = $state(false);
  playheadMs = $state(0);
  playing = $state(false);
  screenTransport = $state<{
    ready: boolean;
    canSeek: boolean;
    togglePlay(): void;
    pause(): void;
    seek(positionMs: number, final?: boolean): void;
    flushSeek(): void;
  } | null>(null);
  auditionRange = $state(emptyAuditionRange());
  private auditionLoop = new AuditionLoop();
  private loopSuspendedForNavigation = false;
  videoReady = $state(false);
  pxPerMs = $state(INITIAL_PX_PER_MS);
  scrollX = $state(0);
  fit = $state(false);
  followPlayhead = $state(true);
  manualFollowSuspended = $state(false);
  laneWidth = $state(600);
  selection = $state<string[]>([]);
  selectionAnchorId = $state<string | null>(null);
  primarySelectionId = $state<string | null>(null);
  pendingPointerSelectionId = $state<string | null>(null);
  activeChannelId = $state<string | null>(null);
  selectedMarkerId = $state<string | null>(null);
  minSpacingMs = $state(200);
  /** Workspace preference: magnetic targets never alter authored cue spacing. */
  snapEnabled = $state(true);
  spacingError = $state('');
  status = $state('');
  alert = $state('');
  notice = $state('');
  localError = $state('');
  recoveryUnavailable = $state(false);
  videoError = $state('');
  videoSrc = $state('');
  pendingSeekMs = $state<number | null>(null);
  hex = $state('000000');
  hexError = $state('');
  propertyDraftError = $state('');
  green = $state('0');
  kelvinOn = $state(false);
  kelvin = $state('2700');
  kelvinError = $state('');
  brightnessText = $state('—');
  helpOpen = $state(false);
  effectPickerOpen = $state(false);
  effectPickerChannelId = $state<string | null>(null);
  adding = $state(false);
  channelIdDraft = $state('');
  mappingOpen = $state(false);
  mappingNote = $state('');
  importWarning = $state(false);
  restored = $state('');
  adminMessage = $state('');
  bulbs = $state<Bulb[]>([]);
  photosensitivity = $state<string | null>(null);
  solo = $state<Record<string, boolean>>({});
  mute = $state<Record<string, boolean>>({});
  overlayVisible = $state(true);
  order = $state('');
  menuChannel = $state<string | null>(null);
  historyColors = $state<string[]>([]);
  private draftRecentColor: { r: number; g: number; b: number } | null = null;
  frameP95 = $state(8);
  private sidecarState = $state<ProjectSidecar | null>(null);
  sidecarLoadError = $state('');
  sidecarReady = $state(false);
  private sidecarLoadAbort: AbortController | null = null;
  sceneCuts = $state<SceneCuts | null>(null);
  sceneCutBusy = $state(false);
  sceneCutProgress = $state(0);
  sceneCutError = $state('');
  sceneCutDenied = $state(false);
  private sceneCutToken = 0;
  private adoptionSequence = 0;
  private revisionSequence = 0;
  private savedCheckpoint: SaveCheckpoint | null = null;
  private history = createHistory<AuthoredSnapshot | null>(null);
  private transaction = createEditTransaction<AuthoredSnapshot>(
    (snapshot, label) => this.commitSnapshot(snapshot, label),
    (draft, label) => {
      this.draftTrack = draft?.track ?? null;
      this.draftLabel = draft ? label : '';
    },
    (left, right) =>
      JSON.stringify([left.track, left.sidecar]) === JSON.stringify([right.track, right.sidecar])
  );
  private allocateId = createIdAllocator(() => [
    ...(this.track?.keyframes.map((keyframe) => keyframe.id) ?? []),
    ...(this.track?.effects.map((effect) => effect.id) ?? []),
    ...(this.sidecarState?.sceneMarkers.map((marker) => marker.id) ?? []),
    ...(this.draftTrack?.keyframes.map((keyframe) => keyframe.id) ?? []),
    ...(this.draftTrack?.effects.map((effect) => effect.id) ?? []),
  ]);
  private video: HTMLVideoElement | null = null;
  private db: IDBDatabase | null = null;
  private recoveryQueue = new Map<string, CrashRecord>();
  private recoveryWaiters: (() => void)[] = [];
  private recoveryWriting = false;
  private bootToken = 0;

  get channels(): Channel[] {
    return this.track?.channels ?? [];
  }

  get selectionState(): EditorSelection {
    return {
      selectedIds: [...this.selection],
      anchorId: this.selectionAnchorId,
      primaryId: this.primarySelectionId,
    };
  }

  get primaryKeyframe(): Keyframe | undefined {
    return (this.draftTrack ?? this.track)?.keyframes.find(
      (frame) => frame.id === this.primarySelectionId
    );
  }

  get playReason(): string {
    if (this.screenTransport)
      return this.screenTransport.ready ? '' : 'Waiting for room screen playback';
    return proxyPlayReason({
      hasItem: Boolean(this.item),
      blob: this.videoSrc.startsWith('blob:'),
      state: this.media?.proxy.state,
      encodedThroughMs: this.media?.proxy.encodedThroughMs,
      pendingSeek: this.pendingSeekMs != null,
      videoError: this.videoError,
      reason: this.media?.proxy.reason ?? this.videoError,
    });
  }

  get canPlay(): boolean {
    if (this.screenTransport) return this.screenTransport.ready;
    return (
      Boolean(this.videoSrc) &&
      this.videoReady &&
      !this.videoError &&
      (this.media?.proxy.state === 'ready' || this.media?.proxy.state === 'building')
    );
  }

  async boot(): Promise<void> {
    this.restoreWorkspacePreferences();
    const token = ++this.bootToken;
    const params = new URLSearchParams(location.search);
    const path = location.pathname;
    const routeParts = location.hash.split('/');
    const routeItemId = decodeURIComponent(routeParts[2] ?? '');
    const routeTrackId = decodeURIComponent(routeParts[3] ?? '');
    const itemId = routeItemId || params.get('itemId') || '';

    this.editorLoading = true;
    this.editorLoadError = '';
    this.sourceCopyProgress = null;
    this.sourceWorkspaceItemId = '';
    this.item = null;
    this.media = null;
    this.trackChoices = [];
    this.track = null;
    this.trackId = '';
    this.videoSrc = '';
    this.videoReady = false;
    this.wasGrowing = false;
    this.videoError = '';
    this.movieMs = null;
    this.durationKnown = false;
    this.pendingSeekMs = null;
    this.seekScheduler.dispose();
    this.dirty = false;
    this.savedCheckpoint = null;
    this.cancelEdit();
    this.sidecarLoadAbort?.abort();
    this.sidecarLoadAbort = null;
    this.adoptionSequence++;
    this.sceneCutToken++;
    this.sceneCuts = null;
    this.sceneCutBusy = false;
    this.sceneCutProgress = 0;
    this.sceneCutError = '';
    this.sceneCutDenied = false;
    this.sidecarLoadError = '';
    this.sidecarReady = false;
    this.sidecarState = null;
    this.setSelectionState(emptyEditorSelection());
    this.pendingPointerSelectionId = null;
    this.playheadMs = 0;
    this.status = '';
    this.resetHistory(null);

    this.hosted = /\/OpenLightFX\/studio\/?/.test(path);
    this.localDev = !this.hosted;
    this.pluginDown = params.get('plugin') === 'down';
    this.nonAdmin = params.get('api_key') === 'viewer' || params.get('api_key') === 'not-an-admin';
    this.playbackActive = params.get('playback') === 'active';
    if (this.nonAdmin) this.adminMessage = 'Admin is required';

    try {
      if (!itemId) throw new Error('No movie was selected for this track.');
      // The hash route is authoritative; keep the compatibility query in sync so a
      // stale itemId from an earlier editor session cannot mislead reloads or tools.
      const url = new URL(location.href);
      url.searchParams.set('itemId', itemId);
      history.replaceState(null, '', url);

      // Never copy the access token into a script-readable cookie. The plugin sets
      // HttpOnly ticket cookies for the page files and the edit proxy.
      await this.openDb();
      if (token !== this.bootToken) return;
      if (this.pluginDown) throw new Error('The plugin is unreachable.');

      const [settings, bulbs] = await Promise.all([fetchSettings(), fetchBulbs()]);
      if (token !== this.bootToken) return;
      this.bulbs = bulbs;
      this.photosensitivity = photosensitivityNotice(settings.photosensitivityMode);

      let request: { itemId?: string; title?: string; layout?: string } = {};
      try {
        request = JSON.parse(sessionStorage.getItem('olfx-editor-request') ?? '{}');
      } catch {
        // Ignore an invalid one-time navigation hint.
      }
      if (request.itemId !== itemId) request = {};
      const imported = routeTrackId === 'import' ? takePendingImport(itemId) : null;
      await this.selectItem(
        itemId,
        routeTrackId && routeTrackId !== 'new' && routeTrackId !== 'import'
          ? routeTrackId
          : undefined,
        routeTrackId === 'new' ? request : undefined,
        imported ?? undefined,
        token
      );
      if (token === this.bootToken) this.measureFrames();
    } catch (error) {
      if (token === this.bootToken) {
        this.editorLoadError =
          (error as Error).message || 'The movie or track could not be opened.';
        this.track = null;
        this.measureFrames();
      }
    } finally {
      if (token === this.bootToken) this.editorLoading = false;
    }
  }

  cancelBoot(): void {
    void this.releaseSourceWorkspaceCopy(true);
    this.bootToken++;
    this.sceneCutToken++;
    this.seekScheduler.dispose();
    this.sidecarLoadAbort?.abort();
    this.sidecarLoadAbort = null;
    this.adoptionSequence++;
  }

  bindVideo(video: HTMLVideoElement): void {
    this.video = video;
  }

  async loadItems(search: string): Promise<void> {
    this.search = search;
    if (this.pluginDown) {
      this.items = [];
      return;
    }
    try {
      const items = await fetchItems(search);
      this.items = items;
      this.capped = items.length >= 200;
    } catch {
      this.pluginDown = true;
      this.items = [];
      this.status = 'The plugin is unreachable';
    }
  }

  async selectItem(
    itemId: string,
    requestedTrackId?: string,
    newTrack?: { itemId?: string; title?: string; layout?: string },
    imported?: { fileName: string; bytes: Uint8Array },
    token = this.bootToken
  ): Promise<void> {
    if (token !== this.bootToken) return;
    this.beginSceneCuts(itemId);
    // Resolve only the routed movie, not the entire library. Keep editing available
    // if Emby's details endpoint is unavailable.
    const item = this.items.find((candidate) => candidate.itemId === itemId) ??
      (await fetchItem(itemId).catch(() => null)) ?? {
        itemId,
        name: itemId,
        year: 0,
        runtimeMs: 0,
      };
    if (token !== this.bootToken) return;
    this.item = item;
    this.videoError = '';
    this.pendingSeekMs = null;
    this.localError = '';
    this.importWarning = false;
    this.alert = '';
    this.setSelectionState(emptyEditorSelection());
    this.pendingPointerSelectionId = null;
    this.menuChannel = null;
    const tracks = await fetchTracks(itemId);
    if (token !== this.bootToken) return;
    this.trackChoices = tracks;
    if (!imported && (newTrack != null || (!requestedTrackId && tracks.length === 0))) {
      await this.prepareSourceWorkspace(itemId, token);
      if (token !== this.bootToken) return;
    }
    let info: MediaInfo | null = null;
    try {
      info = await fetchMediaInfo(itemId);
    } catch {
      // Track editing remains available if the edit-proxy metadata is unavailable.
    }
    if (token !== this.bootToken) return;
    this.media = info;
    const resolved = resolveDuration(item.runtimeMs, info?.runtimeMs ?? null);
    this.movieMs = resolved.durationMs;
    this.durationKnown = resolved.durationMs !== null && resolved.durationMs > 0;
    this.applyProxy(info);
    if (info && ['missing', 'building'].includes(info.proxy.state))
      void this.watchProxy(itemId, token);
    const requested = requestedTrackId
      ? tracks.find((track) => track.trackId === requestedTrackId)
      : null;
    if (requestedTrackId && !requested)
      throw new Error(`Track “${requestedTrackId}” was not found for ${item.name}.`);
    if (imported) {
      const base = this.fresh(item.name, resolved.durationMs ?? 0);
      const result = importTrack(base, imported.bytes, itemId);
      if (result.errors.length) {
        this.alert = result.errors.join(' ');
        this.track = null;
        return;
      }
      const stem = imported.fileName.replace(/\.lightfx$/i, '');
      const rootId = slug(stem);
      let id = rootId;
      let suffix = 2;
      while (tracks.some((track) => track.trackId === id))
        id = `${rootId.slice(0, 60)}-${suffix++}`;
      this.trackId = id;
      this.trackUpdatedAt = '';
      this.serverUpdatedAt = 0;
      this.importWarning = importDurationWarning(
        resolved.durationMs ?? 0,
        result.track.metadata.durationMs,
        true
      );
      await this.adopt(
        {
          ...result.track,
          metadata: { ...result.track.metadata, movieTitle: item.name, year: item.year },
        },
        itemId,
        id,
        true,
        token
      );
    } else if (requested) await this.openTrack(requested, resolved.durationMs, token);
    else if (newTrack)
      await this.openNewTrack(item, resolved.durationMs, newTrack.title, newTrack.layout);
    else if (tracks.length === 1) await this.openTrack(tracks[0], resolved.durationMs, token);
    else if (tracks.length === 0) await this.openNewTrack(item, resolved.durationMs);
    else throw new Error('Choose a track from this movie before opening the editor.');
  }

  private async prepareSourceWorkspace(itemId: string, token: number): Promise<void> {
    this.sourceCopyProgress = null;
    const first = await startSourceWorkspace(itemId);
    if (!first.required) return;
    this.sourceWorkspaceItemId = itemId;
    this.sourceCopyProgress = first.progressPercent;
    let progress = first;
    while (progress.state === 'copying') {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (token !== this.bootToken) return;
      progress = await fetchSourceWorkspace(itemId);
      this.sourceCopyProgress = progress.progressPercent;
    }
    if (progress.state !== 'ready')
      throw new Error(
        progress.error || 'The movie could not be copied to the transcode temporary directory.'
      );
    this.sourceCopyProgress = null;
  }

  async releaseSourceWorkspaceCopy(keepalive = false): Promise<void> {
    const itemId = this.sourceWorkspaceItemId;
    if (!itemId) return;
    this.sourceWorkspaceItemId = '';
    this.sourceCopyProgress = null;
    try {
      await releaseSourceWorkspace(itemId, keepalive);
    } catch {
      /* Best effort; startup cleanup prunes abandoned copies. */
    }
  }

  private applyProxy(info: MediaInfo | null): void {
    if (!info) return;
    if (info.proxy.state === 'failed') {
      this.pendingSeekMs = null;
      this.videoSrc = '';
      this.videoError = failedProxyMessage(info.proxy.reason);
      return;
    }
    if (info.proxy.state === 'building' || info.proxy.state === 'missing') this.wasGrowing = true;
    const url = info.proxy.editUrl ?? '';
    const playable = url && (info.proxy.state === 'ready' || info.proxy.state === 'building');
    if (playable) {
      if (this.videoSrc !== url) {
        this.videoError = '';
        this.videoSrc = url;
      }
      this.refreshCompletedProxy(info);
      this.releasePendingSeek(info);
      return;
    }
    this.videoSrc = url;
  }

  private refreshCompletedProxy(info: MediaInfo): void {
    const video = this.video;
    if (!this.wasGrowing || info.proxy.state !== 'ready' || !video || video.readyState < 1) return;
    {
      // A Range response opened while encoding can end at its original byte horizon.
      // Reopen the completed edit proxy, retaining transport state and the requested seek.
      this.wasGrowing = false;
      this.resumeProxy = !video.paused;
      this.pendingSeekMs ??= this.playheadMs;
      this.videoReady = false;
      this.appliedSeekMs = null;
      this.cancelEyedrop();
      video.load();
    }
  }

  private releasePendingSeek(info: MediaInfo): void {
    if (this.pendingSeekMs == null || !this.video || this.video.readyState < 2) return;
    if (
      seekPastHorizon(
        this.pendingSeekMs,
        info.proxy.encodedThroughMs,
        info.proxy.state === 'building'
      )
    )
      return;
    if (info.proxy.state === 'missing') return;
    const target = this.pendingSeekMs;
    if (
      info.proxy.state === 'building' &&
      Number.isFinite(this.video.duration) &&
      this.video.duration * 1000 < target
    )
      return;
    if (this.appliedSeekMs === target) return;
    const reachableTarget =
      info.proxy.state === 'ready' && Number.isFinite(this.video.duration)
        ? Math.min(target / 1000, this.video.duration)
        : target / 1000;
    let reachable = Math.abs(this.video.currentTime - reachableTarget) < 0.000001;
    for (let i = 0; i < this.video.seekable.length; i++) {
      if (
        this.video.seekable.start(i) <= reachableTarget &&
        this.video.seekable.end(i) + 0.000001 >= reachableTarget
      )
        reachable = true;
    }
    if (!reachable) return;
    this.dispatchSeek(target);
  }

  private dispatchSeek(target: number): void {
    if (!this.video) return;
    this.appliedSeekMs = target;
    if (!this.video.seeking && Math.abs(this.video.currentTime * 1000 - target) < 0.001) {
      this.onVideoSeeked();
      return;
    }
    this.video.currentTime = target / 1000;
    if (!this.video.seeking) this.onVideoSeeked();
  }

  /**
   * MediaInfo is read once on select, and a fresh item's proxy is always still building,
   * so without this the picture never appeared until a reload. Poll until it is ready,
   * keeping the progress current, and stop when another item is selected.
   */
  private async watchProxy(itemId: string, token: number): Promise<void> {
    while (
      token === this.bootToken &&
      this.media &&
      ['missing', 'building'].includes(this.media.proxy.state)
    ) {
      await new Promise((resolve) => setTimeout(resolve, PROXY_POLL_MS));
      if (token !== this.bootToken) return;
      let info: MediaInfo;
      try {
        info = await fetchMediaInfo(itemId);
      } catch {
        continue;
      }
      if (token !== this.bootToken) return;
      this.media = info;
      this.applyProxy(info);
      if (info.proxy.state === 'failed') return;
    }
  }

  async openTrack(
    summary: TrackSummary,
    durationMs: number | null = this.movieMs,
    token = this.bootToken,
    forceServer = false
  ): Promise<void> {
    this.trackId = summary.trackId;
    this.trackUpdatedAt = summary.updatedAt;
    const parsed = Date.parse(summary.updatedAt);
    this.serverUpdatedAt = Number.isFinite(parsed) ? parsed : 0;
    let track: Track;
    try {
      track = decodeTrack(await fetchTrackBytes(summary.trackId, summary.itemId));
      const errors = validateTrack(track);
      if (errors.length) throw new Error(errors.join(' '));
    } catch (error) {
      throw new Error(
        `Could not load “${summary.title || summary.trackId}”: ${(error as Error).message}`
      );
    }
    if (token !== this.bootToken) return;
    if (durationMs && durationMs > 0)
      track = { ...track, metadata: { ...track.metadata, durationMs } };
    await this.adopt(track, summary.itemId, summary.trackId, false, token, forceServer);
  }

  async openNewTrack(
    item: LibraryItem,
    durationMs: number | null,
    requestedTitle?: string,
    requestedLayout = 'LAYOUT_2_0'
  ): Promise<void> {
    this.trackId = slug(requestedTitle || item.name);
    this.serverUpdatedAt = 0;
    this.trackUpdatedAt = '';
    const created = newTrackFromMovie(
      item.itemId,
      requestedTitle || `${item.name} lighting`,
      durationMs ?? 0,
      requestedLayout
    );
    const { itemId: _item, ...track } = created;
    track.metadata = { ...track.metadata, movieTitle: item.name, year: item.year };
    await this.adopt(track, item.itemId, this.trackId, true, this.bootToken);
  }

  chooseNewTrack(): void {
    if (!this.item) return;
    this.trackChoices = [];
    void this.openNewTrack(this.item, this.movieMs);
  }

  private fresh(title: string, durationMs: number): Track {
    const created = newTrackFromMovie(this.item?.itemId ?? 'item', title, durationMs);
    const { itemId: _item, ...track } = created;
    return track;
  }

  private async adopt(
    track: Track,
    itemId: string,
    trackId: string,
    dirty: boolean,
    token = this.bootToken,
    forceServer = false
  ): Promise<void> {
    const adoption = ++this.adoptionSequence;
    this.sidecarLoadAbort?.abort();
    this.sidecarLoadAbort = null;
    this.sidecarLoadError = '';
    this.sidecarReady = false;
    const crash = await this.readCrash(crashKey(itemId, trackId));
    if (token !== this.bootToken || adoption !== this.adoptionSequence) return;
    const source = forceServer
      ? 'server'
      : chooseLoadSource(this.serverUpdatedAt, crash, { itemId, trackId });
    let loadedSidecar: ProjectSidecar | null = null;
    let sidecarError = '';
    if (source === 'crash' && crash) {
      loadedSidecar = crash.sidecar;
    } else if (!dirty) {
      const controller = new AbortController();
      this.sidecarLoadAbort = controller;
      try {
        loadedSidecar = await fetchProjectSidecar(itemId, trackId, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        sidecarError =
          error instanceof ProjectSidecarLoadError
            ? error.message
            : (error as Error).message || 'Project sidecar could not be loaded';
      }
      if (
        token !== this.bootToken ||
        adoption !== this.adoptionSequence ||
        this.item?.itemId !== itemId ||
        this.trackId !== trackId
      )
        return;
      if (this.sidecarLoadAbort === controller) this.sidecarLoadAbort = null;
    }
    const chosen = source === 'crash' && crash ? crash.track : track;
    this.cancelEdit();
    this.cancelEyedrop();
    this.saveConflict = false;
    this.fit = source !== 'crash';
    this.track = this.normalizedTrack(chosen);
    this.restoreAuditionRange();
    this.sidecarState = loadedSidecar ?? {
      version: 1,
      itemId,
      trackId,
      sceneMarkers: [],
      channelGroups: [],
    };
    this.sidecarLoadError = sidecarError;
    this.sidecarReady = !sidecarError;
    this.setSelectionState(emptyEditorSelection());
    this.pendingPointerSelectionId = null;
    this.activeChannelId = chosen.channels[0]?.id ?? null;
    this.sidecarState = this.sidecar();
    const restoredPosition =
      source === 'crash' && crash
        ? clampRecoveryPosition({
            playheadMs: crash.playheadMs,
            scrollX: crash.scrollX,
            durationMs: chosen.metadata.durationMs || this.movieMs || 0,
            pxPerMs: this.pxPerMs,
            viewportWidth: this.laneWidth,
          })
        : { playheadMs: 0, scrollX: 0 };
    this.playheadMs = restoredPosition.playheadMs;
    this.scrollX = restoredPosition.scrollX;
    this.resetHistory({ ...this.authoredSnapshot(), revision: this.newRevision() });
    this.savedCheckpoint = dirty || source === 'crash' ? null : this.currentCheckpoint();
    this.updateDirty();
    this.order = chosen.channels.map((channel) => channel.id).join(',');
    this.syncPropertyFields();
    this.restored = source === 'crash' ? 'Unsaved edits were restored' : '';
    if (this.dirty) await this.persist(true);
    // Assigning videoSrc already loads a remote URL. load() aborts that request,
    // and a growing proxy does not survive the restart.
    if (this.video && this.videoSrc.startsWith('blob:')) this.video.load();
  }

  private resetHistory(snapshot: AuthoredSnapshot | null): void {
    this.history = createHistory(snapshot);
    this.canUndo = false;
    this.canRedo = false;
  }

  private newRevision(): string {
    return `revision-${++this.revisionSequence}`;
  }

  private currentCheckpoint(revision = this.history.current?.revision): SaveCheckpoint | null {
    if (!this.item || !revision) return null;
    return { itemId: this.item.itemId, trackId: this.trackId, revision };
  }

  private updateDirty(): void {
    this.dirty = !matchesSaveCheckpoint(this.currentCheckpoint(), this.savedCheckpoint);
  }

  private authoredSnapshot(track = this.track): AuthoredSnapshot {
    return {
      track,
      sidecar: this.sidecar(),
      revision: this.history.current?.revision ?? this.newRevision(),
      selection: [...this.selection],
      selectionAnchorId: this.selectionAnchorId,
      primarySelectionId: this.primarySelectionId,
      activeChannelId: this.activeChannelId,
    };
  }

  private normalizedTrack(track: Track): Track {
    return {
      ...track,
      keyframes: track.keyframes.toSorted(
        (a, b) => a.channelId.localeCompare(b.channelId) || a.timestampMs - b.timestampMs
      ),
    };
  }

  private commitSnapshot(snapshot: AuthoredSnapshot, message = ''): void {
    if (!snapshot.track) return;
    const next = {
      ...snapshot,
      track: this.normalizedTrack(snapshot.track),
      revision: this.newRevision(),
    };
    this.history.edit(next);
    this.applyHistorySnapshot(this.history.current);
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.updateDirty();
    this.order = next.track.channels.map((channel) => channel.id).join(',');
    if (message) this.status = message;
    this.syncPropertyFields();
    void this.persist(true);
  }

  private applyHistorySnapshot(snapshot: AuthoredSnapshot | null): void {
    this.pendingPointerSelectionId = null;
    this.track = snapshot?.track ?? null;
    this.sidecarState = snapshot?.sidecar ?? null;
    this.updateDirty();
    const nextSelection = pruneEditorSelection(
      {
        selectedIds: snapshot?.selection ?? [],
        anchorId: snapshot?.selectionAnchorId ?? null,
        primaryId: snapshot?.primarySelectionId ?? null,
      },
      this.track?.keyframes ?? []
    );
    this.setSelectionState(nextSelection);
    this.activeChannelId =
      snapshot?.activeChannelId === null
        ? null
        : this.track?.channels.some((channel) => channel.id === snapshot?.activeChannelId)
          ? (snapshot?.activeChannelId ?? null)
          : (this.track?.channels[0]?.id ?? null);
    this.order = this.track?.channels.map((channel) => channel.id).join(',') ?? '';
    this.syncPropertyFields();
  }

  /** Refresh non-authored context in the current snapshot without creating an action. */
  private syncHistoryContext(): void {
    const current = this.history.current;
    if (!current) return;
    this.history.replaceCurrent({
      ...current,
      selection: [...this.selection],
      selectionAnchorId: this.selectionAnchorId,
      primarySelectionId: this.primarySelectionId,
      activeChannelId: this.activeChannelId,
    });
  }

  /** Current v1 project document for marker/group editors; it shares authored history. */
  get projectSidecar(): ProjectSidecar {
    return this.sidecar();
  }

  addMarker(): void {
    if (!this.track) return;
    const timeMs = Math.max(0, Math.min(this.durationMs(), Math.round(this.playheadMs)));
    const marker = {
      id: this.allocateId('marker'),
      timeMs,
      label: 'Scene marker',
      kind: 'manual' as const,
    };
    const sidecar = this.projectSidecar;
    if (
      this.editSidecar(
        {
          ...sidecar,
          sceneMarkers: [...sidecar.sceneMarkers, marker].sort(
            (a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)
          ),
        },
        'Add scene marker'
      )
    )
      this.selectedMarkerId = marker.id;
  }

  updateMarker(id: string, patch: { label?: string; timeMs?: number }): boolean {
    if (
      patch.timeMs != null &&
      (!Number.isSafeInteger(patch.timeMs) || patch.timeMs < 0 || patch.timeMs > this.durationMs())
    ) {
      this.status = 'Marker time must be inside the movie';
      return false;
    }
    const sidecar = this.projectSidecar;
    return this.editSidecar(
      {
        ...sidecar,
        sceneMarkers: sidecar.sceneMarkers
          .map((marker) => (marker.id === id ? { ...marker, ...patch } : marker))
          .sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)),
      },
      'Edit scene marker'
    );
  }

  deleteMarker(id: string): void {
    const sidecar = this.projectSidecar;
    if (
      this.editSidecar(
        { ...sidecar, sceneMarkers: sidecar.sceneMarkers.filter((marker) => marker.id !== id) },
        'Delete scene marker'
      ) &&
      this.selectedMarkerId === id
    )
      this.selectedMarkerId = null;
  }

  sceneNavigationReason(direction: -1 | 1): string | undefined {
    const cuts = this.sceneCuts?.cuts ?? [];
    if (!cuts.length) return 'No scene cuts for this movie';
    return adjacentSceneStopMs(cuts, this.playheadMs, direction, this.durationMs()) == null
      ? direction < 0
        ? 'No earlier scene'
        : 'No later scene'
      : undefined;
  }

  canNavigateScene(direction: -1 | 1): boolean {
    return this.sceneNavigationReason(direction) == null;
  }

  navigateScene(direction: -1 | 1): void {
    const time = adjacentSceneStopMs(
      this.sceneCuts?.cuts ?? [],
      this.playheadMs,
      direction,
      this.durationMs()
    );
    if (time == null) {
      this.status = this.sceneNavigationReason(direction) ?? 'No scene cuts for this movie';
      return;
    }
    this.seek(time);
    this.revealNavigationPosition(time);
  }

  async detectSceneCuts(sceneCutThreshold?: number): Promise<void> {
    const itemId = this.item?.itemId;
    if (!itemId || this.sceneCutBusy) return;
    const token = this.sceneCutToken;
    this.sceneCutBusy = true;
    this.sceneCutError = '';
    this.sceneCutProgress = 0;
    try {
      let job: SceneCutJob | null = await startSceneCutDetection(itemId, sceneCutThreshold);
      while (token === this.sceneCutToken && job?.state === 'processing') {
        this.sceneCutProgress = job.progress;
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (token !== this.sceneCutToken) return;
        job = await fetchSceneCutJob(job.jobId);
      }
      if (token !== this.sceneCutToken) return;
      if (job?.state === 'failed') {
        this.sceneCutError = job.error || 'Scene detection failed';
        return;
      }
      await this.refreshSceneCuts(itemId, token, this.sceneCuts);
    } catch (error) {
      if (token !== this.sceneCutToken) return;
      if (error instanceof SceneCutForbiddenError) {
        this.sceneCutDenied = true;
        this.sceneCutError = '';
        return;
      }
      if (error instanceof SceneCutAlreadyRunningError) {
        await this.pollSceneCutDocument(itemId, token);
        return;
      }
      this.sceneCutError = (error as Error).message || 'Scene detection failed';
    } finally {
      if (token === this.sceneCutToken) this.sceneCutBusy = false;
    }
  }

  /** Reload cuts saved by generation or by Detect scenes, and draw them on the timeline. */
  reloadSceneCuts(): void {
    const itemId = this.item?.itemId;
    if (!itemId) return;
    this.beginSceneCuts(itemId);
  }

  private beginSceneCuts(itemId: string): void {
    const token = ++this.sceneCutToken;
    this.sceneCutBusy = false;
    this.sceneCutProgress = 0;
    this.sceneCutError = '';
    const storage = sceneCutStorage();
    const local = storage ? readSceneCutCache(storage, itemId) : null;
    this.sceneCuts = local;
    void this.refreshSceneCuts(itemId, token, local);
  }

  private async refreshSceneCuts(
    itemId: string,
    token: number,
    local: SceneCuts | null
  ): Promise<void> {
    try {
      const remote = await fetchSceneCuts(itemId);
      if (token !== this.sceneCutToken) return;
      this.rememberSceneCuts(itemId, mergeSceneCuts(local, remote));
      if (remote.status === 'running') await this.pollSceneCutDocument(itemId, token);
    } catch {
      // Offline or a missing route keeps the cached cuts and leaves the editor usable.
      if (token === this.sceneCutToken && !local) this.sceneCuts = null;
    }
  }

  private async pollSceneCutDocument(itemId: string, token: number): Promise<void> {
    const started = Date.now();
    while (token === this.sceneCutToken && Date.now() - started < 15 * 60_000) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (token !== this.sceneCutToken) return;
      let remote: SceneCuts;
      try {
        remote = await fetchSceneCuts(itemId);
      } catch {
        return;
      }
      if (token !== this.sceneCutToken) return;
      this.rememberSceneCuts(itemId, mergeSceneCuts(this.sceneCuts, remote));
      if (remote.status !== 'running') return;
    }
  }

  private rememberSceneCuts(itemId: string, next: SceneCuts | null): void {
    if (next && next.itemId !== itemId) return;
    this.sceneCuts = next;
    const storage = sceneCutStorage();
    if (next && storage) writeSceneCutCache(storage, next);
  }

  navigateMarker(direction: -1 | 1): void {
    const time = adjacentKeyframeTime(
      this.projectSidecar.sceneMarkers.map((marker) => ({ timestampMs: marker.timeMs })),
      this.playheadMs,
      direction
    );
    if (time == null) {
      this.status = direction < 0 ? 'No earlier marker' : 'No later marker';
      return;
    }
    this.seek(time);
    this.revealNavigationPosition(time);
  }

  /** Hosted sidecar edits are safe only after a matching project document has loaded (or 404). */
  get hostedSaveBlockedReason(): string {
    if (this.propertyDraftError) return this.propertyDraftError;
    if (!this.hosted) return '';
    if (this.sidecarLoadError)
      return 'Project sidecar could not be loaded. Retry loading the project before saving.';
    if (!this.sidecarReady) return 'Project sidecar is still loading.';
    return '';
  }

  /** Commit a discrete sidecar-only action as one authored checkpoint. */
  editSidecar(next: ProjectSidecar, message = 'Project updated'): boolean {
    if (!this.track || (this.hosted && !this.sidecarReady)) return false;
    const sidecar = sidecarDocument({
      ...next,
      itemId: this.item?.itemId ?? '',
      trackId: this.trackId,
    });
    if (JSON.stringify(sidecar) === JSON.stringify(this.sidecar())) return false;
    this.commitSnapshot({ ...this.authoredSnapshot(), sidecar }, message);
    return true;
  }

  /** Begin one labeled authored action without changing committed track/export/recovery state. */
  beginEdit(label: string): void {
    if (!this.track) return;
    this.transaction.begin(this.authoredSnapshot(), label);
  }

  /** Replace the transient authored draft. Repeated updates remain one pending action. */
  updateEdit(next: Track, sidecar?: ProjectSidecar): boolean {
    if (!this.transaction.active || (sidecar && this.hosted && !this.sidecarReady)) return false;
    return this.transaction.update({
      ...this.authoredSnapshot(),
      // Draft moves preserve lane order. Normalize once at commit, not on every motion.
      track: next,
      sidecar: sidecar ?? this.sidecar(),
    });
  }

  commitEdit(): boolean {
    const committed = this.transaction.commit();
    if (committed && this.draftRecentColor) this.rememberColor(this.draftRecentColor);
    this.draftRecentColor = null;
    return committed;
  }

  cancelEdit(): void {
    this.nudgeRun = false;
    this.transaction.cancel();
    this.draftRecentColor = null;
    this.syncPropertyFields();
  }

  edit(next: Track, message = ''): void {
    if (this.transaction.active) {
      this.updateEdit(next);
      return;
    }
    this.commitSnapshot(
      {
        ...this.authoredSnapshot(next),
        track: this.normalizedTrack(next),
      },
      message
    );
  }

  undo(): void {
    if (!this.history.canUndo) return;
    this.applyHistorySnapshot(this.history.undo());
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.updateDirty();
    this.status = 'Undone';
    void this.persist(this.dirty);
  }

  redo(): void {
    if (!this.history.canRedo) return;
    this.applyHistorySnapshot(this.history.redo());
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.updateDirty();
    this.status = 'Redone';
    void this.persist(this.dirty);
  }

  private rangeStorageKey(): string {
    return `openlightfx.editor.range:${this.item?.itemId ?? 'local'}:${this.trackId}`;
  }

  private restoreAuditionRange(): void {
    this.auditionLoop.cancel();
    this.auditionRange = emptyAuditionRange();
    try {
      this.auditionRange = restoreAuditionRange(
        localStorage.getItem(this.rangeStorageKey()),
        this.durationMs()
      );
    } catch {
      /* Local workspace state is optional. */
    }
  }

  setRangeBoundary(boundary: 'startMs' | 'endMs', timeMs = Math.round(this.playheadMs)): void {
    if (!Number.isSafeInteger(timeMs) || timeMs < 0 || timeMs > this.durationMs()) {
      this.status = 'Range boundary must be inside the movie';
      return;
    }
    this.auditionRange = { ...this.auditionRange, [boundary]: timeMs };
    if (rangeReason(this.auditionRange, this.durationMs())) this.auditionRange.loop = false;
    this.auditionLoop.cancel();
    this.persistAuditionRange();
  }

  get loopReason(): string {
    if (this.screenTransport) return 'Loop is available with local preview only.';
    return rangeReason(this.auditionRange, this.durationMs());
  }

  toggleLoop(): void {
    if (this.loopReason) {
      this.status = this.loopReason;
      return;
    }
    this.auditionRange = { ...this.auditionRange, loop: !this.auditionRange.loop };
    this.auditionLoop.cancel();
    this.persistAuditionRange();
  }

  clearRange(): void {
    this.auditionRange = emptyAuditionRange();
    this.auditionLoop.cancel();
    this.persistAuditionRange();
  }

  private persistAuditionRange(): void {
    try {
      localStorage.setItem(this.rangeStorageKey(), JSON.stringify(this.auditionRange));
    } catch {
      /* Never turn a preference failure into an authored save failure. */
    }
  }

  togglePlay(): void {
    if (this.screenTransport) {
      this.screenTransport.togglePlay();
      return;
    }
    const video = this.video;
    if (!video || !this.canPlay) {
      this.status = this.playReason || 'Choose a movie';
      return;
    }
    if (video.paused) {
      this.manualFollowSuspended = false;
      this.cancelEyedrop();
      void video.play();
      this.playing = true;
    } else {
      this.auditionLoop.cancel();
      video.pause();
      this.playing = false;
    }
  }

  pause(): void {
    if (this.screenTransport) {
      this.screenTransport.pause();
      return;
    }
    this.auditionLoop.cancel();
    this.video?.pause();
    this.playing = false;
  }

  step(direction: 1 | -1): void {
    if (this.screenTransport) {
      this.status = 'Frame stepping is available with local preview only.';
      return;
    }
    const fps = this.media?.proxy.fps;
    this.seek(adjacentProxyFrameTime(this.playheadMs, direction, fps ?? FPS, this.durationMs()));
  }

  canNavigateKeyframe(direction: 1 | -1): boolean {
    if (!this.track) return false;
    const frames = this.activeChannelId
      ? this.track.keyframes.filter((frame) => frame.channelId === this.activeChannelId)
      : this.track.keyframes;
    return adjacentKeyframeTime(frames, this.playheadMs, direction) != null;
  }

  navigateKeyframe(direction: 1 | -1): void {
    if (!this.track) return;
    const active = this.activeChannelId
      ? this.track.keyframes.filter((frame) => frame.channelId === this.activeChannelId)
      : this.track.keyframes;
    const time = adjacentKeyframeTime(active, this.playheadMs, direction);
    if (time != null) {
      this.seek(time);
      this.revealNavigationPosition(time);
    }
  }

  revealNavigationPosition(timeMs: number): void {
    const position = timeMs * this.pxPerMs;
    const viewport = Math.max(1, this.laneWidth);
    if (position < this.scrollX || position > this.scrollX + viewport) {
      this.scrollX = Math.max(
        0,
        Math.min(this.durationMs() * this.pxPerMs - viewport, position - viewport / 2)
      );
    }
  }

  skip(direction: 1 | -1): void {
    this.seek(Math.min(Math.max(0, this.playheadMs + direction * 5000), this.durationMs()));
  }

  seekBoundary(end: boolean): void {
    const time = end ? this.durationMs() : 0;
    this.seek(time);
    this.revealNavigationPosition(time);
  }

  seek(ms: number, fromLoop = false): void {
    if (this.screenTransport) {
      this.screenTransport.seek(Math.min(Math.max(0, ms), this.durationMs() || ms), true);
      return;
    }
    this.seekLocal(ms, fromLoop);
  }

  applyScreenPlayback(positionMs: number, paused: boolean): void {
    if (!this.screenTransport) return;
    this.video?.pause();
    const position = Math.min(Math.max(0, positionMs), this.durationMs() || positionMs);
    // Keep the proxy silent and paused; never let its native clock drive the room.
    if (this.video && Math.abs(this.video.currentTime * 1000 - position) > (paused ? 30 : 250))
      this.seekLocal(position);
    this.playheadMs = position;
    this.playing = !paused;
    if (
      this.playing &&
      this.followPlayhead &&
      !this.manualFollowSuspended &&
      position * this.pxPerMs - this.scrollX >= this.laneWidth * 0.75
    )
      this.revealNavigationPosition(position);
  }

  private seekLocal(ms: number, fromLoop = false): void {
    if (!fromLoop) {
      this.loopSuspendedForNavigation = true;
      this.auditionLoop.cancel();
    }
    const time = Math.min(Math.max(0, ms), this.durationMs() || ms);
    this.cancelEyedrop();
    this.appliedSeekMs = null;
    this.playheadMs = time;
    if (!this.video || !this.videoSrc) return;
    const building = this.media?.proxy.state === 'building';
    const encoded = this.media?.proxy.encodedThroughMs ?? 0;
    if (
      this.video.readyState < 1 ||
      this.media?.proxy.state === 'missing' ||
      seekPastHorizon(time, encoded, Boolean(building))
    ) {
      this.pendingSeekMs = time;
      return;
    }
    this.pendingSeekMs = time;
    if (this.media) this.releasePendingSeek(this.media);
    else this.dispatchSeek(time);
  }

  private dispatchScrubbedSeek(target: number): boolean {
    if (!this.video || !this.videoSrc || this.video.readyState < 1) return false;
    const building = this.media?.proxy.state === 'building';
    if (
      this.media?.proxy.state === 'missing' ||
      seekPastHorizon(target, this.media?.proxy.encodedThroughMs ?? 0, Boolean(building))
    )
      return false;
    if (this.media) this.releasePendingSeek(this.media);
    else this.dispatchSeek(target);
    return this.appliedSeekMs === target || Math.abs(this.video.currentTime * 1000 - target) < 1;
  }

  scrub(ms: number, final = false): void {
    if (this.screenTransport) {
      this.screenTransport.seek(Math.min(Math.max(0, ms), this.durationMs() || ms), final);
      return;
    }
    this.loopSuspendedForNavigation = true;
    this.auditionLoop.cancel();
    const time = Math.min(Math.max(0, ms), this.durationMs() || ms);
    this.cancelEyedrop();
    this.playheadMs = time;
    this.pendingSeekMs = time;
    this.seekScheduler.request(time, final);
  }

  flushSeek(): void {
    if (this.screenTransport) {
      this.screenTransport.flushSeek();
      return;
    }
    if (this.pendingSeekMs != null) this.seekScheduler.request(this.pendingSeekMs, true);
  }

  onVideoMetadata(): void {
    if (this.media) {
      this.refreshCompletedProxy(this.media);
      this.releasePendingSeek(this.media);
    }
  }

  onVideoData(): void {
    this.videoReady = true;
    this.onVideoMetadata();
    if (this.resumeProxy) {
      this.resumeProxy = false;
      if (!this.screenTransport) void this.video?.play();
    }
  }

  onVideoSeeked(): void {
    if (!this.video || this.video.seeking) return;
    queueMicrotask(() => this.seekScheduler.complete());
    // Native completion is authoritative even if the browser adjusted the time.
    // A newer target still queued past the encoding horizon is not completed by
    // an older native event (seek() invalidates appliedSeekMs).
    if (this.appliedSeekMs != null && this.pendingSeekMs === this.appliedSeekMs) {
      if (
        this.media?.proxy.state === 'building' &&
        Math.abs(this.video.currentTime * 1000 - this.appliedSeekMs) > 1
      ) {
        // A growing stream may advertise a range before the browser has the next
        // fragment. Keep the future target queued until progress/reopen makes it
        // reachable; the picker still samples the actual displayed position.
        this.appliedSeekMs = null;
        return;
      }
      this.pendingSeekMs = null;
      this.appliedSeekMs = null;
    }
    this.onVideoTimeUpdate();
  }

  onVideoTimeUpdate(): void {
    if (this.screenTransport || !this.video) return;
    this.playing = !this.video.paused;
    const nativeTime = this.video.currentTime * 1000;
    if (this.loopSuspendedForNavigation && nativeTime < (this.auditionRange.endMs ?? 0))
      this.loopSuspendedForNavigation = false;
    const loopTarget = this.loopSuspendedForNavigation
      ? null
      : this.auditionLoop.sample(nativeTime, this.playing, this.auditionRange, this.durationMs());
    if (loopTarget != null) {
      this.seek(loopTarget, true);
      return;
    }
    if (this.pendingSeekMs != null && this.media?.proxy.state === 'ready')
      this.seekScheduler.retry();
    if (this.pendingSeekMs != null || this.video.seeking || this.video.readyState < 2) return;
    this.playheadMs = this.video.currentTime * 1000;
  }

  syncFromVideo(): void {
    if (this.screenTransport || !this.video || this.video.paused) return;
    this.onVideoTimeUpdate();
    if (this.pendingSeekMs != null || !this.followPlayhead || this.manualFollowSuspended) return;
    const position = this.playheadMs * this.pxPerMs;
    if (position - this.scrollX >= this.laneWidth * 0.75) {
      this.scrollX = Math.max(
        0,
        Math.min(
          this.durationMs() * this.pxPerMs - this.laneWidth,
          position - this.laneWidth * 0.25
        )
      );
    }
  }

  onVideoError(): void {
    if (!this.videoSrc) return;
    // A growing file can stall. The poll reports a real failure, which replaces this.
    if (this.media?.proxy.state === 'building') return;
    this.videoError = 'The edit proxy failed to play';
    if (!this.screenTransport) this.playing = false;
  }

  async retryProxy(): Promise<void> {
    this.videoError = '';
    this.pendingSeekMs = null;
    if (this.media?.proxy.state === 'failed' && this.item) {
      try {
        const proxy = await restartProxy(this.item.itemId);
        this.media = { ...this.media, proxy };
        this.applyProxy(this.media);
        if (proxy.state === 'building') void this.watchProxy(this.item.itemId, this.bootToken);
      } catch {
        this.videoError = failedProxyMessage(undefined);
      }
      return;
    }
    const src = this.videoSrc;
    this.videoSrc = '';
    queueMicrotask(() => {
      this.videoSrc = src;
    });
  }

  onLocalFile(file: File): void {
    const kind = classifyLocalFile(file.name, file.type);
    if (kind === 'refused') {
      this.localError = 'This browser cannot play this file. Open the movie from Emby.';
      return;
    }
    this.localError = '';
    this.videoError = '';
    this.videoSrc = URL.createObjectURL(file);
    if (!this.track) {
      const item = {
        itemId: 'local',
        name: file.name.replace(/\.mp4$/i, ''),
        year: 0,
        runtimeMs: 10000,
      };
      this.item = item;
      this.movieMs = 10000;
      this.durationKnown = true;
      this.media = {
        runtimeMs: 10000,
        width: 320,
        height: 240,
        videoCodec: 'h264',
        hdr: false,
        colorTransfer: 'bt709',
        audioCodec: 'aac',
        proxy: {
          state: 'ready',
          encodedThroughMs: 10000,
          fps: 24,
          keyframeIntervalMs: 500,
          width: 320,
          height: 240,
        },
      };
      this.openNewTrack(item, 10000);
    }
  }

  durationMs(): number {
    return this.track?.metadata.durationMs || this.movieMs || 0;
  }

  insertAt(timeMs: number, channelId: string | null): void {
    if (!this.track) {
      this.status = 'Choose a channel before adding a keyframe';
      return;
    }
    const channel = channelId ?? this.activeChannelId ?? this.track.channels[0]?.id;
    if (!channel) {
      this.status = 'Choose a channel before adding a keyframe';
      return;
    }
    const duration = this.durationMs() || timeMs;
    const time = quantizeProxyFrameTime(timeMs, this.media?.proxy.fps ?? FPS, duration);
    const own = this.track.keyframes.filter((kf) => kf.channelId === channel);
    if (!canInsert(own, time, this.spacingLimit())) {
      this.status = 'No keyframe: that time is too close on this channel';
      return;
    }
    const sampled = overlaySample(own, time);
    const created = {
      ...newKeyframe(own, time, this.allocateId('kf')),
      channelId: channel,
      colorMode: sampled.mode,
      color: { r: sampled.r, g: sampled.g, b: sampled.b },
      colorTemperature: sampled.kelvin,
      brightness: sampled.brightness,
      powerOn: sampled.powerOn,
    };
    this.setSelectionState({
      selectedIds: [created.id],
      anchorId: created.id,
      primaryId: created.id,
    });
    this.activeChannelId = channel;
    this.edit(
      { ...this.track, keyframes: [...this.track.keyframes, created] },
      `Keyframe at ${time} ms on channel ${channel}`
    );
  }

  clearActiveChannel(): void {
    this.activeChannelId = null;
  }

  addAtPlayhead(): void {
    if (!this.track || !this.activeChannelId) {
      this.status = 'Select a lane before adding a keyframe';
      return;
    }
    const channel = this.activeChannelId;
    if (!channel) {
      this.status = 'Choose a channel before adding a keyframe';
      return;
    }
    const own = this.track.keyframes.filter((kf) => kf.channelId === channel);
    const duration = this.durationMs() || Math.round(this.playheadMs);
    const time = quantizeProxyFrameTime(this.playheadMs, this.media?.proxy.fps ?? FPS, duration);
    const existing = own.find((keyframe) => keyframe.timestampMs === time);
    if (existing) {
      this.setSelectionState({
        selectedIds: [existing.id],
        anchorId: existing.id,
        primaryId: existing.id,
      });
      this.status = 'Selected the keyframe at the playhead';
      return;
    }
    if (!canInsert(own, time, this.spacingLimit())) {
      this.status = 'No keyframe: that time is too close on this channel';
      return;
    }
    this.insertAt(time, channel);
  }

  openEffectPicker(channelId?: string | null): void {
    this.effectPickerChannelId = channelId ?? this.activeChannelId;
    if (this.effectPickerChannelId) this.activeChannelId = this.effectPickerChannelId;
    this.effectPickerOpen = true;
  }

  addEffect(
    type: EffectType,
    options?: { channelId?: string | null; timeMs?: number; allChannels?: boolean }
  ): void {
    if (!this.track) return;
    const channels = options?.allChannels
      ? this.track.channels.map((channel) => channel.id)
      : [options?.channelId || this.activeChannelId || this.track.channels[0]?.id].filter(
          (id): id is string => Boolean(id)
        );
    if (!channels.length) {
      this.status = 'Add a channel before adding an effect';
      return;
    }
    const duration = this.durationMs();
    const anchors = [Math.round(this.playheadMs), ...this.sceneCutAnchors()];
    const created = channels.map((channelId) =>
      buildEffectKeyframe({
        id: this.allocateId('fx'),
        type,
        channelId,
        timestampMs: options?.timeMs ?? this.playheadMs,
        movieDurationMs: duration,
        keyframes: this.track!.keyframes,
        anchorsMs: anchors,
      })
    );
    const effects = [...this.track.effects, ...created];
    this.activeChannelId = created[0].channelId;
    this.edit(
      {
        ...this.track,
        effects,
        safety: computeSafety({ keyframes: this.track.keyframes, effects }),
      },
      `Added ${effectPreset(type).name}`
    );
    const note = effectSafetyNote(type);
    if (note) this.status = note;
    this.effectPickerOpen = false;
  }

  previewEffect(
    id: string,
    patch: Partial<Pick<EffectKeyframe, 'timestampMs' | 'durationMs'>>
  ): void {
    if (!this.track) return;
    const current = this.track.effects.find((effect) => effect.id === id);
    if (!current) return;
    const placed = clampEffectMove(
      patch.timestampMs ?? current.timestampMs,
      patch.durationMs ?? current.durationMs,
      this.durationMs()
    );
    const snapped =
      patch.timestampMs == null
        ? placed
        : {
            ...placed,
            timestampMs: snapEffectStart(placed.timestampMs, [
              Math.round(this.playheadMs),
              ...this.sceneCutAnchors(),
            ]),
          };
    const limited = clampEffectMove(snapped.timestampMs, snapped.durationMs, this.durationMs());
    const effects = this.track.effects.map((effect) =>
      effect.id === id ? { ...effect, ...limited } : effect
    );
    if (!this.transaction.active) this.beginEdit('Adjust effect');
    this.updateEdit({
      ...this.track,
      effects,
      safety: computeSafety({ keyframes: this.track.keyframes, effects }),
    });
  }

  updateEffect(
    id: string,
    patch: Partial<Pick<EffectKeyframe, 'durationMs' | 'intensity' | 'primaryColor'>>
  ): void {
    if (!this.track) return;
    const effects = this.track.effects.map((effect) => {
      if (effect.id !== id) return effect;
      const durationMs = patch.durationMs ?? effect.durationMs;
      const intensity = patch.intensity ?? effect.intensity;
      return {
        ...effect,
        durationMs: Math.max(1, Math.min(60 * 60_000, Math.round(durationMs))),
        intensity: Math.max(0, Math.min(100, Math.round(intensity))),
        primaryColor: patch.primaryColor ?? effect.primaryColor,
      };
    });
    this.edit(
      {
        ...this.track,
        effects,
        safety: computeSafety({ keyframes: this.track.keyframes, effects }),
      },
      'Edit effect'
    );
  }

  private sceneCutAnchors(): number[] {
    return sceneCutLineTimesMs(this.sceneCuts?.cuts ?? [], this.durationMs());
  }

  deleteEffect(id: string): void {
    if (!this.track) return;
    const effects = this.track.effects.filter((effect) => effect.id !== id);
    this.edit(
      {
        ...this.track,
        effects,
        safety: computeSafety({ keyframes: this.track.keyframes, effects }),
      },
      'Delete effect'
    );
  }

  selectAt(x: number, y: number, laneHeight: number): void {
    if (!this.track) return;
    const index = Math.floor(y / laneHeight);
    const channel = this.track.channels[index];
    if (!channel) return;
    this.activeChannelId = channel.id;
    const time = (x + this.scrollX) / this.pxPerMs;
    const hit = this.track.keyframes
      .filter((kf) => kf.channelId === channel.id)
      .map((kf) => ({ kf, dx: Math.abs(kf.timestampMs * this.pxPerMs - this.scrollX - x) }))
      .sort((a, b) => a.dx - b.dx)[0];
    if (hit && hit.dx <= 12) {
      this.setSelectionState({
        selectedIds: [hit.kf.id],
        anchorId: hit.kf.id,
        primaryId: hit.kf.id,
      });
      this.status = '1 selected';
    } else {
      this.setSelectionState(emptyEditorSelection());
      this.status = '0 selected';
    }
    this.syncPropertyFields();
    this.syncHistoryContext();
  }

  restoreSelection(state: EditorSelection, activeChannelId = this.activeChannelId): void {
    this.setSelectionState(pruneEditorSelection(state, this.track?.keyframes ?? []));
    this.activeChannelId = activeChannelId;
    this.cancelPendingPointerSelection();
    this.syncPropertyFields();
    this.syncHistoryContext();
  }

  marquee(
    initial: EditorSelection,
    bounds: { x0: number; y0: number; x1: number; y1: number },
    mode: 'replace' | 'union' | 'toggle'
  ): void {
    if (!this.track) return;
    const hits = keyframesInMarquee(
      this.track.keyframes,
      this.channels.map((channel) => channel.id),
      bounds,
      this.pxPerMs
    );
    this.restoreSelection(selectEditorMarquee(initial, this.track.keyframes, hits, mode));
    this.status = `${this.selection.length} selected`;
  }

  get clipboardAvailable(): boolean {
    return lightingClipboard != null;
  }

  copySelection(): void {
    const payload = this.track && copyKeyframes(this.track, this.selection);
    if (!payload) {
      this.status = 'Select keyframes to copy';
      return;
    }
    lightingClipboard = payload;
    this.status = `${payload.keyframes.length} keyframes copied`;
  }

  cutSelection(): void {
    const payload = this.track && copyKeyframes(this.track, this.selection);
    if (!payload) {
      this.status = 'Select keyframes to cut';
      return;
    }
    lightingClipboard = payload;
    this.deleteSelection();
    this.status = `${payload.keyframes.length} keyframes cut`;
  }

  pasteSelection(): void {
    if (!lightingClipboard) {
      this.status = 'Copy keyframes before pasting';
      return;
    }
    this.placeClipboard(lightingClipboard, 'Pasted');
  }

  duplicateSelection(): void {
    const payload = this.track && copyKeyframes(this.track, this.selection);
    if (payload) this.placeClipboard(payload, 'Duplicated');
    else this.status = 'Select keyframes to duplicate';
  }

  private placeClipboard(payload: KeyframeClipboard, label: string): void {
    if (!this.track) return;
    const plan = planKeyframePaste(
      this.track,
      payload,
      Math.round(this.playheadMs),
      this.activeChannelId,
      this.spacingLimit()
    );
    if (!plan.accepted) {
      this.status = pasteRejectionMessage[plan.reason];
      return;
    }
    const frames = materializeKeyframePaste(plan, this.allocateId)!;
    const primary = frames.at(-1)!;
    this.setSelectionState({
      selectedIds: frames.map((frame) => frame.id),
      anchorId: frames[0].id,
      primaryId: primary.id,
    });
    this.activeChannelId = primary.channelId;
    this.edit(
      { ...this.track, keyframes: [...this.track.keyframes, ...frames] },
      `${label} ${frames.length} keyframes at ${formatClock(Math.round(this.playheadMs))}`
    );
    this.revealNavigationPosition(primary.timestampMs);
  }

  deleteSelection(): void {
    if (!this.track || this.selection.length === 0) {
      this.status = 'Nothing selected';
      return;
    }
    const remove = new Set(this.selection);
    this.edit(
      { ...this.track, keyframes: this.track.keyframes.filter((kf) => !remove.has(kf.id)) },
      'Deleted keyframes'
    );
    this.setSelectionState(emptyEditorSelection());
    this.syncHistoryContext();
  }

  zoomKey(key: string, modifier: boolean): void {
    const oldScale = boundedTimelineScale(this.pxPerMs, this.durationMs(), this.laneWidth);
    const requested = applyZoomChord(
      oldScale,
      key,
      modifier,
      this.durationMs() || 1,
      this.laneWidth
    );
    const next = boundedTimelineScale(requested, this.durationMs(), this.laneWidth);
    this.pxPerMs = next;
    this.scrollX =
      key === '\\'
        ? 0
        : anchoredScroll(
            this.playheadMs,
            oldScale,
            next,
            this.scrollX,
            this.durationMs(),
            this.laneWidth
          );
    this.fit = key === '\\';
  }

  zoomAt(anchorX: number, direction: 1 | -1): void {
    const oldScale = boundedTimelineScale(this.pxPerMs, this.durationMs(), this.laneWidth);
    const next = boundedTimelineScale(
      oldScale * (direction > 0 ? 1.25 : 0.8),
      this.durationMs(),
      this.laneWidth
    );
    this.scrollX = anchoredScrollAt(
      oldScale,
      next,
      this.scrollX,
      this.durationMs(),
      this.laneWidth,
      anchorX
    );
    this.pxPerMs = next;
    this.fit = false;
  }

  zoomFit(): void {
    this.zoomKey('\\', false);
  }

  zoomFitSelection(): boolean {
    const selected =
      this.track?.keyframes.filter((frame) => this.selection.includes(frame.id)) ?? [];
    if (!selected.length) return false;
    const start = Math.min(...selected.map((frame) => frame.timestampMs));
    const end = Math.max(...selected.map((frame) => frame.timestampMs));
    const duration = Math.max(1, this.durationMs());
    const span = Math.max(end - start, Math.min(500, duration));
    const padding = Math.max(250, span * 0.15);
    const windowStart = Math.max(0, start - padding);
    const windowEnd = Math.min(duration, Math.max(end + padding, windowStart + span + 2 * padding));
    const width = Math.max(1, this.laneWidth);
    this.pxPerMs = boundedTimelineScale(
      width / Math.max(1, windowEnd - windowStart),
      duration,
      width
    );
    this.scrollX = Math.max(
      0,
      Math.min(duration * this.pxPerMs - width, windowStart * this.pxPerMs)
    );
    this.fit = false;
    return true;
  }

  zoomFrameDetail(): void {
    const oldScale = boundedTimelineScale(this.pxPerMs, this.durationMs(), this.laneWidth);
    const fps = this.media?.proxy.fps;
    const next = boundedTimelineScale(
      (Number.isFinite(fps) && fps! > 0 ? fps! : FPS) / 1000,
      this.durationMs(),
      this.laneWidth
    );
    this.pxPerMs = next;
    this.scrollX = anchoredScroll(
      this.playheadMs,
      oldScale,
      next,
      this.scrollX,
      this.durationMs(),
      this.laneWidth
    );
    this.fit = false;
  }

  setSpacing(raw: string): void {
    const value = Number(raw);
    if (value !== 0 && !acceptSpacing(value)) {
      this.spacingError = 'Use no extra spacing, 100, 200, or 1000';
      return;
    }
    this.spacingError = '';
    this.minSpacingMs = value;
    try {
      localStorage.setItem('openlightfx.editor.min-spacing-ms', String(value));
    } catch {
      // A workspace preference is not an authored write.
    }
  }

  spacingLimit(): number {
    return this.minSpacingMs;
  }

  setSnapEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
    try {
      localStorage.setItem('openlightfx.editor.snap-enabled', String(enabled));
    } catch {
      // Local workspace preferences are best-effort and must not affect authoring.
    }
  }

  restoreWorkspacePreferences(): void {
    try {
      const saved = localStorage.getItem('openlightfx.editor.snap-enabled');
      if (saved === 'true' || saved === 'false') this.snapEnabled = saved === 'true';
      const spacing = localStorage.getItem('openlightfx.editor.min-spacing-ms');
      if (spacing != null && [0, 100, 200, 1000].includes(Number(spacing)))
        this.minSpacingMs = Number(spacing);
    } catch {
      // Storage can be unavailable in private or embedded browsers.
    }
  }

  setDefaultColor(channelId: string, raw: string): void {
    if (!this.track) return;
    const parsed = parseHex({ r: 0, g: 0, b: 0 }, raw.trim());
    if (parsed.error) {
      this.hexError = parsed.error;
      return;
    }
    this.hexError = '';
    this.edit({
      ...this.track,
      channels: this.track.channels.map((channel) =>
        channel.id === channelId ? { ...channel, defaultColor: parsed.color } : channel
      ),
    });
  }

  setDefaultBrightness(channelId: string, raw: string): void {
    const brightness = Number(raw);
    if (!this.track || !Number.isInteger(brightness) || brightness < 0 || brightness > 100) return;
    this.edit({
      ...this.track,
      channels: this.track.channels.map((channel) =>
        channel.id === channelId ? { ...channel, defaultBrightness: brightness } : channel
      ),
    });
  }

  setColorComponent(component: 'r' | 'g' | 'b', value: number): void {
    if (!this.track || !Number.isInteger(value) || value < 0 || value > 255) return;
    const ids = new Set(this.selection);
    if (!ids.size) return;
    this.edit({
      ...(this.draftTrack ?? this.track),
      keyframes: (this.draftTrack ?? this.track).keyframes.map((key) =>
        ids.has(key.id) ? { ...key, color: { ...key.color, [component]: value } } : key
      ),
    });
  }

  setHex(raw: string): void {
    const current = this.selectedColor();
    const parsed = parseHex(current, raw.trim());
    this.hex = raw;
    if (parsed.error) {
      this.hexError = parsed.error;
      return;
    }
    this.hexError = '';
    this.green = String(parsed.color.g);
    this.applyColor(parsed.color);
  }

  setKelvinMode(on: boolean): void {
    this.kelvinOn = on;
  }

  setKelvinValue(raw: string): void {
    this.kelvin = raw;
    const parsed = setKelvin(Number(raw));
    if (!parsed.ok) {
      this.kelvinError = 'Kelvin stays between 1000 and 10000';
      return;
    }
    this.kelvinError = '';
    if (!this.track) return;
    const ids = new Set(this.selection);
    if (ids.size === 0) return;
    this.edit(
      patchKeyframes(this.draftTrack ?? this.track, [...ids], {
        colorMode: 'COLOR_TEMPERATURE',
        colorTemperature: parsed.kelvin,
      })
    );
  }

  setTitle(title: string): void {
    this.setMetadata({ title });
  }

  setMetadata(patch: Partial<TrackMetadata>): void {
    if (!this.track) return;
    this.edit({ ...this.track, metadata: { ...this.track.metadata, ...patch } });
  }

  setBrightness(raw: string): void {
    const brightness = Number(raw);
    if (
      !raw.trim() ||
      !this.track ||
      !Number.isInteger(brightness) ||
      brightness < 0 ||
      brightness > 100
    )
      return;
    const ids = new Set(this.selection);
    if (!ids.size) return;
    this.edit(patchKeyframes(this.draftTrack ?? this.track, [...ids], { brightness }));
  }

  setTransition(raw: string): void {
    const transitionMs = Number(raw);
    if (!raw.trim() || !this.track || !Number.isInteger(transitionMs) || transitionMs < 0) return;
    const ids = new Set(this.selection);
    if (!ids.size) return;
    if (this.track.keyframes.some((key) => ids.has(key.id) && transitionMs > key.timestampMs))
      return;
    this.edit(patchKeyframes(this.draftTrack ?? this.track, [...ids], { transitionMs }));
  }

  setInterpolation(interpolation: 'STEP' | 'LINEAR'): void {
    if (!this.track || !this.selection.length) return;
    const ids = new Set(this.selection);
    this.edit(patchKeyframes(this.draftTrack ?? this.track, this.selection, { interpolation }));
  }

  private nudgeRun = false;

  finishNudgeRun(cancel = false): void {
    if (!this.nudgeRun) return;
    this.nudgeRun = false;
    if (cancel) this.cancelEdit();
    else this.commitEdit();
  }

  nudgeSelection(direction: -1 | 1, frames = 1, grouped = false): void {
    if (!this.track || !this.selection.length) {
      this.status = 'Select one or more keyframes to nudge';
      return;
    }
    if (grouped && !this.nudgeRun) {
      this.beginEdit('Nudge keyframes');
      this.nudgeRun = true;
    }
    const base = this.draftTrack ?? this.track;
    const fps = this.media?.proxy.fps ?? FPS;
    const move = planSharedKeyframeMove(indexKeyframesForMove(base.keyframes), {
      ids: this.selection,
      deltaMs: Math.round((1000 / fps) * frames * direction),
      durationMs: this.durationMs(),
      spacingMs: this.spacingLimit(),
      framePolicy: { kind: 'proxy-frame', fps, anchorId: this.primarySelectionId ?? undefined },
    });
    if (move.status === 'blocked' || move.status === 'no-op') {
      this.status = move.reason || 'Nudge blocked';
      return;
    }
    this.edit(applyKeyframeMovePlan(base, move), 'Nudge keyframes');
  }

  moveKeyframe(id: string, requestedTimeMs: number): void {
    if (!this.track || !Number.isFinite(requestedTimeMs)) return;
    const current = this.track.keyframes.find((keyframe) => keyframe.id === id);
    if (!current) return;
    let timestampMs = quantizeProxyFrameTime(
      requestedTimeMs,
      this.media?.proxy.fps ?? FPS,
      this.durationMs()
    );
    if (Math.abs(timestampMs - this.playheadMs) <= 100)
      timestampMs = quantizeProxyFrameTime(
        this.playheadMs,
        this.media?.proxy.fps ?? FPS,
        this.durationMs()
      );
    const move = planSharedKeyframeMove(indexKeyframesForMove(this.track.keyframes), {
      ids: [id],
      deltaMs: timestampMs - current.timestampMs,
      durationMs: this.durationMs(),
      spacingMs: this.spacingLimit(),
      framePolicy: { kind: 'proxy-frame', fps: this.media?.proxy.fps ?? FPS, anchorId: id },
    });
    // Legacy pointer commands rejected a crossing request instead of showing a clamped draft.
    if (move.status === 'blocked' || move.status === 'clamped') {
      this.status = 'Keyframes cannot cross or overlap on the same lane';
      return;
    }
    if (move.status === 'no-op') return;
    this.edit(applyKeyframeMovePlan(this.track, move));
    this.activeChannelId = current.channelId;
    this.syncHistoryContext();
  }

  setKeyframeTime(raw: string): void {
    if (!this.track || this.selection.length !== 1) return;
    const match = /^(?:(\d+):)?([0-5]?\d):([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(raw.trim());
    if (!match) {
      this.status = 'Enter time as h:mm:ss.mmm';
      return;
    }
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const millis = Number((match[4] ?? '').padEnd(3, '0'));
    // Typed h:mm:ss.mmm values are exact; only pointer placement/dragging snaps to frames.
    const timestampMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
    const id = this.selection[0];
    const current = this.track.keyframes.find((keyframe) => keyframe.id === id);
    if (!current || timestampMs > this.durationMs()) {
      this.status = 'Keyframe time must be inside the movie';
      return;
    }
    const move = planAbsoluteKeyframeTime(indexKeyframesForMove(this.track.keyframes), {
      id,
      timeMs: timestampMs,
      durationMs: this.durationMs(),
      spacingMs: this.spacingLimit(),
    });
    if (move.status === 'blocked') {
      this.status = move.reason;
      return;
    }
    if (move.status === 'no-op') return;
    this.edit(applyKeyframeMovePlan(this.track, move));
  }

  setLayout(layout: string): void {
    if (!this.track) return;
    let plan: LayoutChangePlan;
    try {
      plan = changeTrackLayout(this.track, layout);
    } catch {
      return;
    }
    const removedNames = plan.removedChannels.map((channel) => channel.displayName).join(', ');
    const removalParts = [
      plan.removedKeyframeCount > 0 ? `${plan.removedKeyframeCount} keyframes` : '',
      plan.removedEffectCount > 0 ? `${plan.removedEffectCount} effects` : '',
    ].filter(Boolean);
    if (
      removalParts.length > 0 &&
      !window.confirm(`Remove ${removedNames} and its ${removalParts.join(' and ')}?`)
    )
      return;
    this.edit(plan.track);
    this.pruneSelection();
    this.syncHistoryContext();
  }

  addChannelById(id: string): void {
    if (!this.track) return;
    const result = addChannel(this.track, id, id);
    if (result.error) {
      this.status = result.error;
      return;
    }
    this.edit(result.track, 'Added a channel');
    this.adding = false;
    this.channelIdDraft = '';
  }

  reorder(channelId: string, direction: -1 | 1): void {
    if (!this.track) return;
    const channels = [...this.track.channels];
    const index = channels.findIndex((channel) => channel.id === channelId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= channels.length) return;
    const [moved] = channels.splice(index, 1);
    channels.splice(next, 0, moved);
    this.edit({ ...this.track, channels });
  }

  toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
  }

  toggleSolo(channelId: string): void {
    this.solo = { ...this.solo, [channelId]: !this.solo[channelId] };
  }

  toggleMute(channelId: string): void {
    this.mute = { ...this.mute, [channelId]: !this.mute[channelId] };
    this.menuChannel = null;
  }

  regionHidden(channelId: string): boolean {
    if (this.mute[channelId]) return true;
    const anySolo = Object.values(this.solo).some(Boolean);
    return anySolo && !this.solo[channelId];
  }

  sampleRgb(channelId: string): string {
    const track = this.draftTrack ?? this.track;
    if (!track) return '0,0,0';
    const sample = overlaySample(
      track.keyframes.filter((kf) => kf.channelId === channelId),
      this.playheadMs
    );
    return displayedRgb(sample);
  }

  cancelEyedrop(): void {
    this.frameAbort?.abort();
    this.frameAbort = null;
    this.frameRequest++;
    if (this.frameUrl) URL.revokeObjectURL(this.frameUrl);
    this.frameUrl = '';
    this.frameLoading = false;
    this.frameTimeMs = null;
  }

  async eyedrop(): Promise<void> {
    if (!this.item || !this.selection.length) {
      this.status = 'Select a keyframe before picking a color';
      return;
    }
    this.cancelEyedrop();
    const request = this.frameRequest;
    const controller = new AbortController();
    this.frameAbort = controller;
    const itemId = this.item.itemId;
    const video = this.video;
    this.frameSelection = [...this.selection];
    video?.pause();
    this.playing = false;
    this.frameLoading = true;
    try {
      const position = await framePosition(video, this.playheadMs, controller.signal);
      if (request !== this.frameRequest) return;
      const response = await fetchFrame(itemId, position, controller.signal);
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      if (request !== this.frameRequest) return;
      const timestamp = response.headers.get('X-OpenLightFX-Source-Time-Ms');
      const measured = timestamp == null ? NaN : Number(timestamp);
      this.frameTimeMs = Number.isFinite(measured) && measured >= 0 ? measured : null;
      this.frameUrl = URL.createObjectURL(blob);
      this.status = 'Click the frame to pick a color';
    } catch {
      if (request === this.frameRequest) this.alert = 'The frame could not be sampled. Try again.';
    } finally {
      if (request === this.frameRequest) {
        this.frameLoading = false;
        this.frameAbort = null;
      }
    }
  }

  pickFrameColor(color: { r: number; g: number; b: number }): void {
    this.setSelectionState(
      pruneEditorSelection(
        {
          selectedIds: this.frameSelection,
          anchorId: this.selectionAnchorId,
          primaryId: this.primarySelectionId,
        },
        this.track?.keyframes ?? []
      )
    );
    this.syncHistoryContext();
    this.applyColor(color);
    this.cancelEyedrop();
    this.status = 'Picked color from movie';
  }

  async importFile(file: File): Promise<void> {
    if (!this.item) return;
    try {
      if (!file.name.toLowerCase().endsWith('.lightfx') || file.size > MAX_TRACK_BYTES)
        throw new Error();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = decodeTrack(bytes);
      if (validateTrack(decoded).length) throw new Error();
      const source = decoded.metadata.movieTitle.trim();
      if (
        ((source && source.toLocaleLowerCase() !== this.item.name.toLocaleLowerCase()) ||
          importDurationWarning(this.movieMs ?? 0, decoded.metadata.durationMs, true)) &&
        !window.confirm(
          `This track is for ${source || 'a movie with a different runtime'} (${Math.round(decoded.metadata.durationMs / 1000)} seconds), but you selected ${this.item.name} (${Math.round((this.movieMs ?? 0) / 1000)} seconds). Continue importing it?`
        )
      )
        return;
      await this.discardEdits();
      const itemId = this.item.itemId;
      if (location.hash.endsWith('/import')) {
        await this.selectItem(itemId, undefined, undefined, { fileName: file.name, bytes });
      } else {
        setPendingImport(itemId, file.name, bytes);
        location.hash = `#/edit/${encodeURIComponent(itemId)}/import`;
      }
    } catch {
      this.alert = "That file isn't a .lightfx track.";
    }
  }

  async discardEdits(): Promise<void> {
    this.savedCheckpoint = this.currentCheckpoint();
    this.updateDirty();
    await this.persist(false);
  }

  async reloadFromServer(): Promise<void> {
    if (!this.item) return;
    try {
      const choices = await fetchTracks(this.item.itemId);
      const summary = choices.find((track) => track.trackId === this.trackId);
      if (!summary)
        throw new Error(
          'This track is no longer on the server. Save as a new track to keep your work.'
        );
      await this.openTrack(summary, this.movieMs, this.bootToken, true);
      this.alert = '';
      this.status = 'Saved';
      await this.persist(false);
    } catch (error) {
      this.alert = (error as Error).message || 'The track could not be reloaded.';
    }
  }

  async saveAsNewTrack(): Promise<void> {
    if (!this.track || this.saving || !this.canManage) return;
    // Retire recovery under the conflicted identity before moving this document to a new track.
    await this.persist(false);
    this.trackId = `${slug(this.track.metadata.title).slice(0, 48)}-${crypto.randomUUID().slice(0, 8)}`;
    this.trackUpdatedAt = '';
    this.saveConflict = false;
    this.updateDirty();
    await this.save();
  }

  private saveError(message: string, partiallySaved = false): void {
    this.alert = message;
    this.status = partiallySaved ? 'Partially saved' : 'Save failed';
    const faulty = this.track?.keyframes
      .toSorted((a, b) => b.id.length - a.id.length)
      .find((frame) => message.includes(frame.id));
    if (faulty) {
      this.setSelectionState({
        selectedIds: [faulty.id],
        anchorId: faulty.id,
        primaryId: faulty.id,
      });
      this.activeChannelId = faulty.channelId;
      this.syncPropertyFields();
      this.syncHistoryContext();
    }
  }

  useMovieDuration(): void {
    if (!this.track || !this.movieMs) return;
    this.edit({ ...this.track, metadata: { ...this.track.metadata, durationMs: this.movieMs } });
    this.importWarning = false;
  }

  private normalizeCurrentForSave(): Track {
    const upgraded = upgradeLegacyTrackLayout(this.track!);
    const track = { ...upgraded, safety: computeSafety(upgraded) };
    const current = this.history.current;
    if (current) this.history.replaceCurrent({ ...current, track });
    this.track = track;
    this.syncPropertyFields();
    this.updateDirty();
    return track;
  }

  async save(): Promise<void> {
    if (this.saving) return;
    if (this.hosted && this.hostedSaveBlockedReason) {
      this.saveError(this.hostedSaveBlockedReason);
      return;
    }
    if (this.hosted && !this.canManage) {
      this.saveError('Only an Emby administrator can save');
      return;
    }
    if (!this.track) {
      this.saveError('The movie duration is unknown');
      return;
    }
    if (this.hosted && !this.dirty) {
      this.status = 'Saved';
      return;
    }

    this.saving = true;
    this.status = 'Saving…';
    let trackWritten = false;
    try {
      const itemId = this.item?.itemId ?? '';
      const trackId = this.trackId;
      const revision = this.history.current?.revision ?? this.newRevision();
      const withSafety = this.normalizeCurrentForSave();
      const trackSnapshot = JSON.parse(JSON.stringify(withSafety)) as Track;
      const sidecarSnapshot = JSON.parse(JSON.stringify(this.sidecar())) as ProjectSidecar;
      const checkpoint: SaveCheckpoint = { itemId, trackId, revision };
      const plan = planHostedSave({
        track: trackSnapshot,
        sidecar: sidecarSnapshot,
        itemId,
        trackId,
        durationKnown: this.durationKnown,
      });
      if (plan.blocked) {
        this.saveError(plan.message ?? 'Save blocked');
        return;
      }
      if (!this.hosted) {
        this.download(trackSnapshot);
      } else {
        for (const request of plan.requests) {
          const isTrack = request.path.includes('/Tracks/');
          const response = isTrack
            ? await putBytes(
                request.path,
                encodeTrack(trackSnapshot),
                this.trackUpdatedAt ? { 'If-Match': this.trackUpdatedAt } : {}
              )
            : await putJson(request.path, sidecarDocument(sidecarSnapshot));
          if (!response.ok) {
            const raw = await response.text();
            let message = raw;
            try {
              const parsed = JSON.parse(raw);
              message = parsed.ResponseStatus?.Message ?? parsed.message ?? raw;
            } catch {
              /* Plain-text plugin errors are valid. */
            }
            this.saveConflict = response.status === 409;
            this.saveError(message || `Save failed (${response.status})`, trackWritten);
            return;
          }
          if (isTrack) {
            trackWritten = true;
            // Keep the new token even if the subsequent sidecar write fails.
            const body = await response.text();
            if (body) {
              try {
                const result = JSON.parse(body);
                this.trackUpdatedAt = result.updatedAt ?? result.UpdatedAt ?? this.trackUpdatedAt;
                const savedAt = Date.parse(this.trackUpdatedAt);
                if (Number.isFinite(savedAt)) this.serverUpdatedAt = savedAt;
              } catch {
                // An empty or unrecognized response does not invalidate a successful write.
              }
            }
          }
        }
        this.savedCheckpoint = checkpoint;
        this.updateDirty();
      }
      this.saveConflict = false;
      this.alert = '';
      this.status = 'Saved';
      await this.persist(this.dirty);
      history.replaceState(
        null,
        '',
        `#/edit/${encodeURIComponent(itemId)}/${encodeURIComponent(trackId)}`
      );
      window.dispatchEvent(new Event('olfx-editor-route-replaced'));
    } catch (error) {
      this.saveError(
        (error as Error).message || 'Save could not reach Emby. Try again.',
        trackWritten
      );
    } finally {
      this.saving = false;
    }
  }

  download(track = this.track): void {
    if (!track) return;
    const bytes = encodeTrack({ ...track, safety: track.safety ?? computeSafety(track) });
    const blob = new Blob([bytesAsBuffer(bytes)], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeTitle = (track.metadata.title || this.trackId || 'track')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .trim();
    link.download = `${safeTitle || 'track'}.lightfx`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  safetyLabel(): { intense: boolean; flashing: boolean; strobing: boolean } {
    if (!this.track) return { intense: false, flashing: false, strobing: false };
    const safety = computeSafety(this.track);
    return {
      intense: safety.intensityRating === 'INTENSE' || safety.intensityRating === 'EXTREME',
      flashing: safety.containsFlashing,
      strobing: safety.containsStrobing,
    };
  }

  startAutosave(): () => void {
    const timer = setInterval(() => {
      if (this.dirty) void this.persist(true);
    }, AUTOSAVE_INTERVAL_MS);
    const hide = () => {
      if (this.dirty) void this.persist(true);
    };
    window.addEventListener('pagehide', hide);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', hide);
    };
  }

  async retryProjectSidecarLoad(): Promise<void> {
    if (!this.item || !this.track || !this.sidecarLoadError || this.saving) return;
    this.sidecarReady = false;
    const itemId = this.item.itemId;
    const trackId = this.trackId;
    const adoption = this.adoptionSequence;
    this.sidecarLoadAbort?.abort();
    const controller = new AbortController();
    this.sidecarLoadAbort = controller;
    try {
      const loaded = await fetchProjectSidecar(itemId, trackId, controller.signal);
      if (
        controller.signal.aborted ||
        adoption !== this.adoptionSequence ||
        this.item?.itemId !== itemId ||
        this.trackId !== trackId
      )
        return;
      this.history.mapSnapshots((snapshot) =>
        snapshot ? { ...snapshot, sidecar: loaded } : snapshot
      );
      this.transaction.mapSnapshots((snapshot) => ({ ...snapshot, sidecar: loaded }));
      this.sidecarState = loaded;
      this.sidecarLoadError = '';
      this.sidecarReady = true;
      this.alert = '';
      this.status = 'Project loaded';
      this.updateDirty();
      await this.persist(this.dirty);
    } catch (error) {
      if (!controller.signal.aborted && adoption === this.adoptionSequence) {
        this.sidecarReady = false;
        this.sidecarLoadError =
          error instanceof ProjectSidecarLoadError
            ? error.message
            : (error as Error).message || 'Project sidecar could not be loaded';
      }
    } finally {
      if (this.sidecarLoadAbort === controller) this.sidecarLoadAbort = null;
    }
  }

  private sidecar(): ProjectSidecar {
    return sidecarDocument({
      ...(this.sidecarState ?? {
        version: 1 as const,
        itemId: this.item?.itemId ?? '',
        trackId: this.trackId,
        sceneMarkers: [],
        channelGroups: [],
      }),
      itemId: this.item?.itemId ?? '',
      trackId: this.trackId,
    });
  }

  private selectedColor(): { r: number; g: number; b: number } {
    const kf = this.selectedKeyframes()[0];
    return kf?.color ?? { r: 0, g: 0, b: 0 };
  }

  private selectedKeyframes(): Keyframe[] {
    const byId = new Map((this.track?.keyframes ?? []).map((frame) => [frame.id, frame]));
    const primary = this.primarySelectionId ? byId.get(this.primarySelectionId) : undefined;
    return [
      ...(primary ? [primary] : []),
      ...this.selection
        .filter((id) => id !== this.primarySelectionId)
        .flatMap((id) => {
          const frame = byId.get(id);
          return frame ? [frame] : [];
        }),
    ];
  }

  private applyColor(color: { r: number; g: number; b: number }): void {
    if (!this.track || this.selection.length === 0) return;
    const ids = new Set(this.selection);
    const base = this.draftTrack ?? this.track;
    this.edit({
      ...base,
      keyframes: base.keyframes.map((kf) =>
        ids.has(kf.id) ? { ...kf, colorMode: 'RGB', color } : kf
      ),
    });
    if (this.transaction.active) this.draftRecentColor = color;
    else this.rememberColor(color);
  }

  private rememberColor(color: { r: number; g: number; b: number }): void {
    const hex = `#${[color.r, color.g, color.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    this.historyColors = [hex, ...this.historyColors.filter((swatch) => swatch !== hex)].slice(
      0,
      16
    );
  }

  private setSelectionState(state: EditorSelection): void {
    this.selection = [...state.selectedIds];
    this.selectionAnchorId = state.anchorId;
    this.primarySelectionId = state.primaryId;
  }

  private pruneSelection(): void {
    this.setSelectionState(pruneEditorSelection(this.selectionState, this.track?.keyframes ?? []));
    this.pendingPointerSelectionId = null;
    this.syncPropertyFields();
  }

  selectKeyframe(id: string, mode: 'replace' | 'extend' | 'toggle' = 'replace'): void {
    const frame = this.track?.keyframes.find((candidate) => candidate.id === id);
    if (!frame) return;
    this.pendingPointerSelectionId = null;
    this.setSelectionState(
      selectEditorKeyframe(
        this.selectionState,
        this.track?.keyframes ?? [],
        id,
        mode === 'extend' ? 'range' : mode
      )
    );
    this.activeChannelId = frame.channelId;
    this.syncHistoryContext();
    this.hexError = '';
    this.kelvinError = '';
    this.syncPropertyFields();
  }

  beginPointerSelection(id: string, mode: 'replace' | 'extend' | 'toggle' = 'replace'): void {
    if (mode === 'replace' && this.selection.length > 1 && this.selection.includes(id)) {
      this.pendingPointerSelectionId = id;
      return;
    }
    this.selectKeyframe(id, mode);
  }

  resolvePendingPointerSelection(id: string, dragged: boolean): void {
    if (this.pendingPointerSelectionId !== id) return;
    this.pendingPointerSelectionId = null;
    if (!dragged) {
      this.selectKeyframe(id, 'replace');
      return;
    }
    this.setSelectionState({
      selectedIds: [...this.selection],
      anchorId: id,
      primaryId: id,
    });
    this.activeChannelId =
      this.track?.keyframes.find((frame) => frame.id === id)?.channelId ?? this.activeChannelId;
    this.syncHistoryContext();
    this.syncPropertyFields();
  }

  cancelPendingPointerSelection(): void {
    this.pendingPointerSelectionId = null;
  }

  selectAllKeyframes(): void {
    this.pendingPointerSelectionId = null;
    this.setSelectionState(
      selectAllEditorKeyframes(this.selectionState, this.track?.keyframes ?? [])
    );
    this.syncHistoryContext();
    this.syncPropertyFields();
  }

  clearSelection(): void {
    this.pendingPointerSelectionId = null;
    this.setSelectionState(emptyEditorSelection());
    this.syncHistoryContext();
    this.syncPropertyFields();
  }

  private syncPropertyFields(): void {
    const selected = this.selectedKeyframes();
    if (!selected.length) {
      this.brightnessText = '—';
      this.kelvinOn = false;
      return;
    }
    const kf = selected[0];
    this.brightnessText = selected.every((frame) => frame.brightness === kf.brightness)
      ? String(kf.brightness)
      : '—';
    this.kelvinOn = selected.every((frame) => frame.colorMode === 'COLOR_TEMPERATURE');
    this.kelvin = selected.every((frame) => frame.colorTemperature === kf.colorTemperature)
      ? String(kf.colorTemperature || 2700)
      : '—';
    this.green = selected.every((frame) => frame.color.g === kf.color.g) ? String(kf.color.g) : '—';
    this.hex = selected.every(
      (frame) =>
        frame.color.r === kf.color.r && frame.color.g === kf.color.g && frame.color.b === kf.color.b
    )
      ? [kf.color.r, kf.color.g, kf.color.b].map((v) => v.toString(16).padStart(2, '0')).join('')
      : '—';
  }

  private async openDb(): Promise<boolean> {
    if (this.db) return true;
    try {
      this.db = await openRecoveryDatabase();
      return true;
    } catch {
      this.recoveryUnavailable = true;
      return false;
    }
  }

  private async persist(dirty: boolean): Promise<void> {
    if (!this.track || !this.item) return;
    const itemId = this.item.itemId;
    const trackId = this.trackId;
    const record = makeCrashRecord({
      key: crashKey(itemId, trackId),
      itemId,
      trackId,
      revision: this.history.current?.revision ?? this.newRevision(),
      track: JSON.parse(JSON.stringify(this.track)),
      sidecar: JSON.parse(JSON.stringify(this.sidecar())) as ProjectSidecar,
      playheadMs: this.playheadMs,
      scrollX: this.scrollX,
      savedAt: Date.now(),
      dirty,
    });
    this.recoveryQueue.set(record.key, record);
    const finished = new Promise<void>((resolve) => this.recoveryWaiters.push(resolve));
    void this.flushRecoveryQueue();
    await finished;
  }

  private async flushRecoveryQueue(): Promise<void> {
    if (this.recoveryWriting) return;
    if (!this.db) {
      this.recoveryWaiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    this.recoveryWriting = true;
    try {
      while (this.recoveryQueue.size > 0) {
        const [key, record] = this.recoveryQueue.entries().next().value as [string, CrashRecord];
        this.recoveryQueue.delete(key);
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = this.db!.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(record, record.key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('Recovery write aborted'));
          });
          document.body.dataset.autosave = record.dirty ? 'dirty' : 'clean';
        } catch {
          if (!this.recoveryQueue.has(key)) this.recoveryQueue.set(key, record);
          this.db?.close();
          this.db = null;
          this.recoveryUnavailable = true;
          document.body.dataset.autosave = 'error';
          break;
        }
      }
    } finally {
      this.recoveryWriting = false;
      const waiters = this.recoveryWaiters.splice(0);
      waiters.forEach((resolve) => resolve());
    }
  }

  private async readCrash(key: string): Promise<CrashRecord | null> {
    if (!this.db) return null;
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db!.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve((request.result as CrashRecord | undefined) ?? null);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error ?? new Error('Recovery read aborted'));
      });
    } catch {
      this.db?.close();
      this.db = null;
      this.recoveryUnavailable = true;
      return null;
    }
  }

  async retryLocalRecovery(): Promise<void> {
    if (!(await this.openDb())) return;
    // A prior failure remains visible until this retry proves reads and writes work.
    this.recoveryUnavailable = false;
    try {
      if (this.item && this.track) {
        const key = crashKey(this.item.itemId, this.trackId);
        const crash = await this.readCrash(key);
        if (this.recoveryUnavailable) return;
        if (
          !this.dirty &&
          chooseLoadSource(this.serverUpdatedAt, crash, {
            itemId: this.item.itemId,
            trackId: this.trackId,
          }) === 'crash'
        ) {
          await this.adopt(this.track, this.item.itemId, this.trackId, false, this.bootToken);
          if (this.recoveryUnavailable) return;
        }
        await this.persist(this.dirty);
      } else {
        await this.flushRecoveryQueue();
      }
      if (this.recoveryQueue.size === 0) this.recoveryUnavailable = false;
    } catch {
      this.recoveryUnavailable = true;
    }
  }

  private measureFrames(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      for (let mark = 0; mark < 10000; mark += 1) ctx.fillRect(mark % 800, (mark * 3) % 120, 2, 4);
    };
    draw();
    const samples: number[] = [];
    for (let pass = 0; pass < 20; pass += 1) {
      const start = performance.now();
      draw();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil(samples.length * 0.95) - 1);
    this.frameP95 = samples[index] ?? 8;
  }
}

function sceneCutStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (cleaned || 'track').slice(0, 64);
}
