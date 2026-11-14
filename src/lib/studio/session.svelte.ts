import {
  acceptSpacing,
  addChannel,
  applyZoomChord,
  AUTOSAVE_INTERVAL_MS,
  canInsert,
  chooseLoadSource,
  classifyLocalFile,
  computeSafety,
  crashKey,
  createHistory,
  decodeTrack,
  encodeTrack,
  frameStepMs,
  importDurationWarning,
  importTrack,
  makeCrashRecord,
  newKeyframe,
  newTrackFromMovie,
  overlaySample,
  parseHex,
  patchKeyframes,
  photosensitivityNotice,
  planHostedSave,
  resolveDuration,
  setKelvin,
  sidecarDocument,
  type Channel,
  type Keyframe,
  type ProjectSidecar,
  type Track,
  type TrackMetadata,
  type LayoutChangePlan,
  changeTrackLayout,
  upgradeLegacyTrackLayout,
} from '$lib/domain';
import {
  bytesAsBuffer,
  fetchBulbs,
  fetchFrame,
  fetchItems,
  fetchMediaInfo,
  restartProxy,
  fetchSettings,
  fetchTrackBytes,
  fetchTracks,
  postJson,
  putBytes,
  putJson,
  type Bulb,
  type LibraryItem,
  type MediaInfo,
  type TrackSummary,
} from '$lib/api/client';
import { failedProxyMessage, proxyPlayReason, seekPastHorizon } from '$lib/studio/proxy-playback';
import { takePendingImport } from '$lib/studio/pending-import';

const DB_NAME = 'openlightfx-studio';
const STORE = 'crash';
const FPS = 24;
export const INITIAL_PX_PER_MS = 0.032;

export function formatClock(ms: number): string {
  const abs = Math.max(0, Math.round(ms));
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const millis = abs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

interface CrashRecord {
  key: string;
  track: Track;
  sidecar: ProjectSidecar;
  playheadMs: number;
  scrollX: number;
  savedAt: number;
  dirty: boolean;
  storage: 'indexeddb';
}

/** How often a building edit proxy is re-read. */
const PROXY_POLL_MS = 1000;

export class StudioSession {
  hosted = $state(false);
  localDev = $state(true);
  pluginDown = $state(false);
  nonAdmin = $state(false);
  playbackActive = $state(false);
  items = $state<LibraryItem[]>([]);
  search = $state('');
  capped = $state(false);
  item = $state<LibraryItem | null>(null);
  media = $state<MediaInfo | null>(null);
  editorLoading = $state(true);
  editorLoadError = $state('');
  trackChoices = $state<TrackSummary[]>([]);
  track = $state<Track | null>(null);
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
  pxPerMs = $state(INITIAL_PX_PER_MS);
  scrollX = $state(0);
  fit = $state(false);
  laneWidth = $state(600);
  selection = $state<string[]>([]);
  activeChannelId = $state<string | null>(null);
  minSpacingMs = $state(200);
  snapToSpacing = $state(true);
  spacingError = $state('');
  status = $state('');
  alert = $state('');
  notice = $state('');
  localError = $state('');
  videoError = $state('');
  videoSrc = $state('');
  pendingSeekMs = $state<number | null>(null);
  hex = $state('000000');
  hexError = $state('');
  green = $state('0');
  kelvinOn = $state(false);
  kelvin = $state('2700');
  kelvinError = $state('');
  brightnessText = $state('—');
  helpOpen = $state(false);
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
  order = $state('');
  menuChannel = $state<string | null>(null);
  historyColors = $state<string[]>(Array.from({ length: 16 }, () => '#000000'));
  frameP95 = $state(8);
  private history = createHistory<Track | null>(null);
  private video: HTMLVideoElement | null = null;
  private db: IDBDatabase | null = null;
  private bootToken = 0;

  get channels(): Channel[] {
    return this.track?.channels ?? [];
  }

  get playReason(): string {
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
    return Boolean(this.videoSrc) && !this.videoError && this.media?.proxy.state !== 'failed';
  }

  async boot(): Promise<void> {
    const token = ++this.bootToken;
    const params = new URLSearchParams(location.search);
    const path = location.pathname;
    const routeParts = location.hash.split('/');
    const routeItemId = decodeURIComponent(routeParts[2] ?? '');
    const routeTrackId = decodeURIComponent(routeParts[3] ?? '');
    const itemId = routeItemId || params.get('itemId') || '';

    this.editorLoading = true;
    this.editorLoadError = '';
    this.item = null;
    this.media = null;
    this.trackChoices = [];
    this.track = null;
    this.trackId = '';
    this.videoSrc = '';
    this.videoError = '';
    this.movieMs = null;
    this.durationKnown = false;
    this.pendingSeekMs = null;
    this.dirty = false;
    this.selection = [];
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

      await this.loadItems(this.search);
      if (token !== this.bootToken) return;
      if (this.pluginDown) throw new Error('Movies could not be loaded from Emby.');

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
    this.bootToken++;
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
    const item = this.items.find((candidate) => candidate.itemId === itemId);
    if (!item) throw new Error('This movie is no longer available in Emby.');
    this.item = item;
    this.videoError = '';
    this.pendingSeekMs = null;
    this.localError = '';
    this.importWarning = false;
    this.alert = '';
    this.selection = [];
    this.menuChannel = null;
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
    if (info?.proxy.state === 'building') void this.watchProxy(itemId, token);
    const tracks = await fetchTracks(itemId);
    if (token !== this.bootToken) return;
    this.trackChoices = tracks;
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
        false,
        token
      );
    } else if (requested) await this.openTrack(requested, resolved.durationMs, token);
    else if (newTrack)
      await this.openNewTrack(item, resolved.durationMs, newTrack.title, newTrack.layout);
    else if (tracks.length === 1) await this.openTrack(tracks[0], resolved.durationMs, token);
    else if (tracks.length === 0) await this.openNewTrack(item, resolved.durationMs);
    else throw new Error('Choose a track from this movie before opening the editor.');
  }

  private applyProxy(info: MediaInfo | null): void {
    if (!info) return;
    if (info.proxy.state === 'failed') {
      this.pendingSeekMs = null;
      this.videoSrc = '';
      this.videoError = failedProxyMessage(info.proxy.reason);
      return;
    }
    const url = info.proxy.editUrl ?? '';
    const playable = url && (info.proxy.state === 'ready' || info.proxy.state === 'building');
    if (playable) {
      if (this.videoSrc !== url) {
        this.videoError = '';
        this.videoSrc = url;
      }
      this.releasePendingSeek(info);
      return;
    }
    this.videoSrc = url;
  }

  private releasePendingSeek(info: MediaInfo): void {
    if (this.pendingSeekMs == null) return;
    if (
      seekPastHorizon(
        this.pendingSeekMs,
        info.proxy.encodedThroughMs,
        info.proxy.state === 'building'
      )
    )
      return;
    const target = this.pendingSeekMs;
    this.pendingSeekMs = null;
    if (this.video) this.video.currentTime = target / 1000;
  }

  /**
   * MediaInfo is read once on select, and a fresh item's proxy is always still building,
   * so without this the picture never appeared until a reload. Poll until it is ready,
   * keeping the progress current, and stop when another item is selected.
   */
  private async watchProxy(itemId: string, token: number): Promise<void> {
    while (token === this.bootToken && this.media?.proxy.state === 'building') {
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
    token = this.bootToken
  ): Promise<void> {
    this.trackId = summary.trackId;
    this.trackUpdatedAt = summary.updatedAt;
    const parsed = Date.parse(summary.updatedAt);
    this.serverUpdatedAt = Number.isFinite(parsed) ? parsed : 0;
    let track: Track;
    try {
      track = decodeTrack(await fetchTrackBytes(summary.trackId, summary.itemId));
    } catch (error) {
      throw new Error(
        `Could not load “${summary.title || summary.trackId}”: ${(error as Error).message}`
      );
    }
    if (token !== this.bootToken) return;
    if (durationMs && durationMs > 0)
      track = { ...track, metadata: { ...track.metadata, durationMs } };
    await this.adopt(track, summary.itemId, summary.trackId, false, token);
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
    await this.adopt(track, item.itemId, this.trackId, false, this.bootToken);
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
    token = this.bootToken
  ): Promise<void> {
    const crash = await this.readCrash(crashKey(itemId, trackId));
    if (token !== this.bootToken) return;
    const source = chooseLoadSource(this.serverUpdatedAt, crash);
    const chosen = source === 'crash' && crash ? crash.track : track;
    this.track = chosen;
    this.playheadMs = source === 'crash' && crash ? crash.playheadMs : 0;
    this.scrollX = source === 'crash' && crash ? crash.scrollX : 0;
    this.dirty = source === 'crash';
    this.resetHistory(chosen);
    this.order = chosen.channels.map((channel) => channel.id).join(',');
    this.activeChannelId = chosen.channels[0]?.id ?? null;
    this.syncPropertyFields();
    this.restored = source === 'crash' ? 'Unsaved edits were restored' : '';
    if (dirty) this.dirty = true;
    // Assigning videoSrc already loads a remote URL. load() aborts that request,
    // and a growing proxy does not survive the restart.
    if (this.video && this.videoSrc.startsWith('blob:')) this.video.load();
  }

  private resetHistory(track: Track | null): void {
    this.history = createHistory(track);
    this.canUndo = false;
    this.canRedo = false;
  }

  edit(next: Track, message = ''): void {
    this.history.edit(next);
    this.track = this.history.current;
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.dirty = true;
    this.order = next.channels.map((channel) => channel.id).join(',');
    if (message) this.status = message;
    this.syncPropertyFields();
    void this.persist(true);
  }

  undo(): void {
    this.track = this.history.undo();
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.dirty = true;
    this.status = 'Undone';
    this.selection = [];
    this.syncPropertyFields();
    void this.persist(true);
  }

  redo(): void {
    this.track = this.history.redo();
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
    this.dirty = true;
    this.status = 'Redone';
    this.syncPropertyFields();
  }

  togglePlay(): void {
    const video = this.video;
    if (!video || !this.canPlay) {
      this.status = this.playReason || 'Choose a movie';
      return;
    }
    if (video.paused) {
      void video.play();
      this.playing = true;
    } else {
      video.pause();
      this.playing = false;
    }
  }

  pause(): void {
    this.video?.pause();
    this.playing = false;
  }

  step(direction: 1 | -1): void {
    const delta = frameStepMs(FPS) * direction;
    this.seek(Math.min(Math.max(0, this.playheadMs + delta), this.durationMs()));
  }

  skip(direction: 1 | -1): void {
    this.seek(Math.min(Math.max(0, this.playheadMs + direction * 5000), this.durationMs()));
  }

  seek(ms: number): void {
    const time = Math.min(Math.max(0, ms), this.durationMs() || ms);
    this.playheadMs = time;
    if (!this.video || !this.videoSrc) return;
    const building = this.media?.proxy.state === 'building';
    const encoded = this.media?.proxy.encodedThroughMs ?? 0;
    if (seekPastHorizon(time, encoded, Boolean(building))) {
      this.pendingSeekMs = time;
      return;
    }
    this.pendingSeekMs = null;
    this.video.currentTime = time / 1000;
  }

  syncFromVideo(): void {
    if (!this.video || this.video.paused) return;
    this.playheadMs = this.video.currentTime * 1000;
    this.playing = !this.video.paused;
  }

  onVideoError(): void {
    if (!this.videoSrc) return;
    // A growing file can stall. The poll reports a real failure, which replaces this.
    if (this.media?.proxy.state === 'building') return;
    this.videoError = 'The edit proxy failed to play';
    this.playing = false;
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
    const frameMs = frameStepMs(FPS);
    const snappedTime = Math.round(timeMs / frameMs) * frameMs;
    const time = Math.min(Math.max(0, Math.round(snappedTime)), duration);
    const own = this.track.keyframes.filter((kf) => kf.channelId === channel);
    if (!canInsert(own, time, this.spacingLimit())) {
      this.status = 'No keyframe: that time is too close on this channel';
      return;
    }
    const sampled = overlaySample(own, time);
    const created = {
      ...newKeyframe(own, time),
      channelId: channel,
      colorMode: sampled.mode,
      color: { r: sampled.r, g: sampled.g, b: sampled.b },
      colorTemperature: sampled.kelvin,
      brightness: sampled.brightness,
      powerOn: sampled.powerOn,
    };
    this.edit(
      { ...this.track, keyframes: [...this.track.keyframes, created] },
      `Keyframe at ${time} ms on channel ${channel}`
    );
    this.selection = [created.id];
    this.activeChannelId = channel;
  }

  addAtPlayhead(): void {
    if (!this.track) {
      this.status = 'Choose a channel before adding a keyframe';
      return;
    }
    const channel = this.activeChannelId ?? this.track.channels[0]?.id ?? null;
    if (!channel) {
      this.status = 'Choose a channel before adding a keyframe';
      return;
    }
    const own = this.track.keyframes.filter((kf) => kf.channelId === channel);
    let time = Math.round(this.playheadMs);
    const spacing = this.spacingLimit();
    if (!canInsert(own, time, spacing)) {
      const duration = this.durationMs() || time;
      const gap = own
        .map((kf) => kf.timestampMs)
        .concat([0, duration])
        .sort((a, b) => a - b)
        .find((candidate) => canInsert(own, candidate, spacing));
      if (gap === undefined) {
        this.status = 'No keyframe: that time is too close on this channel';
        return;
      }
      time = gap;
    }
    this.insertAt(time, channel);
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
      this.selection = [hit.kf.id];
      this.status = '1 selected';
    } else {
      this.selection = [];
      this.status = '0 selected';
    }
    this.syncPropertyFields();
  }

  marquee(x0: number, y0: number, x1: number, y1: number, laneHeight: number): void {
    if (!this.track) return;
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const ids = this.track.keyframes
      .filter((kf) => {
        const index = this.track!.channels.findIndex((channel) => channel.id === kf.channelId);
        const x = kf.timestampMs * this.pxPerMs - this.scrollX;
        const y = index * laneHeight + laneHeight / 2;
        return x >= left && x <= right && y >= top && y <= bottom;
      })
      .map((kf) => kf.id);
    this.selection = ids;
    this.status = `${ids.length} selected`;
    this.syncPropertyFields();
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
    this.selection = [];
  }

  zoomKey(key: string, modifier: boolean): void {
    const next = applyZoomChord(
      this.pxPerMs,
      key,
      modifier,
      this.durationMs() || 1,
      this.laneWidth
    );
    this.pxPerMs = next;
    this.fit = key === '\\';
  }

  zoomFit(): void {
    this.zoomKey('\\', false);
  }

  setSpacing(raw: string): void {
    const value = Number(raw);
    if (!acceptSpacing(value)) {
      this.spacingError = 'Use 100, 200, or 1000';
      return;
    }
    this.spacingError = '';
    this.minSpacingMs = value;
  }

  spacingLimit(): number {
    return this.snapToSpacing ? this.minSpacingMs : 0;
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
      patchKeyframes(this.track, [...ids], {
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
    if (!this.track || !Number.isFinite(brightness) || brightness < 0 || brightness > 100) return;
    const ids = new Set(this.selection);
    if (!ids.size) return;
    this.edit(patchKeyframes(this.track, [...ids], { brightness }));
  }

  setTransition(raw: string): void {
    const transitionMs = Number(raw);
    if (!this.track || !Number.isInteger(transitionMs) || transitionMs < 0) return;
    const ids = new Set(this.selection);
    if (!ids.size) return;
    this.edit(patchKeyframes(this.track, [...ids], { transitionMs }));
  }

  setInterpolation(interpolation: 'STEP' | 'LINEAR'): void {
    if (!this.track || !this.selection.length) return;
    const ids = new Set(this.selection);
    this.edit(patchKeyframes(this.track, this.selection, { interpolation }));
  }

  moveKeyframe(id: string, requestedTimeMs: number): void {
    if (!this.track || !Number.isFinite(requestedTimeMs)) return;
    const current = this.track.keyframes.find((keyframe) => keyframe.id === id);
    if (!current) return;
    const frameMs = frameStepMs(FPS);
    let timestampMs = Math.round(requestedTimeMs / frameMs) * frameMs;
    if (Math.abs(timestampMs - this.playheadMs) <= 100)
      timestampMs = Math.round(this.playheadMs / frameMs) * frameMs;
    timestampMs = Math.min(Math.max(0, Math.round(timestampMs)), this.durationMs());
    const sameChannel = this.track.keyframes.filter(
      (keyframe) => keyframe.channelId === current.channelId && keyframe.id !== id
    );
    if (!canInsert(sameChannel, timestampMs, this.spacingLimit())) {
      this.status = 'Keyframes cannot cross or overlap on the same lane';
      return;
    }
    this.edit({
      ...this.track,
      keyframes: this.track.keyframes.map((keyframe) =>
        keyframe.id === id ? { ...keyframe, timestampMs } : keyframe
      ),
    });
    this.selection = [id];
    this.activeChannelId = current.channelId;
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
    const frameMs = frameStepMs(FPS);
    const requestedMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
    const timestampMs = Math.round(requestedMs / frameMs) * frameMs;
    const id = this.selection[0];
    const current = this.track.keyframes.find((keyframe) => keyframe.id === id);
    if (!current || timestampMs > this.durationMs()) {
      this.status = 'Keyframe time must be inside the movie';
      return;
    }
    const sameChannel = this.track.keyframes.filter(
      (keyframe) => keyframe.channelId === current.channelId && keyframe.id !== id
    );
    if (!canInsert(sameChannel, timestampMs, this.spacingLimit())) {
      this.status = 'That time is too close to another keyframe on this channel';
      return;
    }
    this.edit({
      ...this.track,
      keyframes: this.track.keyframes.map((keyframe) =>
        keyframe.id === id ? { ...keyframe, timestampMs } : keyframe
      ),
    });
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
    this.selection = this.selection.filter((id) =>
      this.track!.keyframes.some((keyframe) => keyframe.id === id)
    );
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
    if (!this.track) return '0,0,0';
    const sample = overlaySample(
      this.track.keyframes.filter((kf) => kf.channelId === channelId),
      this.playheadMs
    );
    return `${sample.r},${sample.g},${sample.b}`;
  }

  async eyedrop(): Promise<void> {
    if (!this.item) {
      this.status = 'The frame could not be sampled';
      return;
    }
    try {
      const response = await fetchFrame(this.item.itemId, this.playheadMs);
      if (!response.ok) {
        this.status = 'The frame could not be sampled';
        return;
      }
      this.status = 'Sampled frame';
    } catch {
      this.status = 'The frame could not be sampled';
    }
  }

  async importFile(file: File): Promise<void> {
    if (!this.track || !this.item) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = importTrack(this.track, bytes, this.item.itemId);
    if (result.errors.length) {
      this.alert = result.errors.join(' ');
      this.status = result.errors.join(' ');
      return;
    }
    this.edit(result.track, 'Imported track');
    this.importWarning = importDurationWarning(
      this.movieMs ?? 0,
      result.track.metadata.durationMs,
      true
    );
  }

  useMovieDuration(): void {
    if (!this.track || !this.movieMs) return;
    this.edit({ ...this.track, metadata: { ...this.track.metadata, durationMs: this.movieMs } });
    this.importWarning = false;
  }

  async save(): Promise<void> {
    this.status = 'Saving…';
    if (!this.track) {
      this.status = 'The movie duration is unknown';
      return;
    }
    const upgraded = upgradeLegacyTrackLayout(this.track);
    if (upgraded !== this.track) {
      this.track = upgraded;
      this.dirty = true;
    }
    const withSafety = { ...upgraded, safety: computeSafety(upgraded) };
    if (!this.hosted) {
      if (!this.durationKnown) {
        this.status = 'The movie duration is unknown';
        return;
      }
      this.download(withSafety);
      this.track = withSafety;
      this.dirty = false;
      await this.persist(false);
      return;
    }
    const plan = planHostedSave({
      track: withSafety,
      sidecar: this.sidecar(),
      itemId: this.item?.itemId ?? '',
      trackId: this.trackId,
      durationKnown: this.durationKnown,
    });
    if (plan.blocked) {
      this.alert = plan.message ?? 'Save blocked';
      this.status = plan.message ?? '';
      return;
    }
    const bytes = encodeTrack(withSafety);
    for (const request of plan.requests) {
      const response =
        request.method === 'PUT' && request.path.includes('/Tracks/')
          ? await putBytes(
              request.path,
              bytes,
              this.trackUpdatedAt ? { 'If-Match': this.trackUpdatedAt } : {}
            )
          : request.method === 'PUT'
            ? await putJson(request.path, sidecarDocument(this.sidecar()))
            : await postJson(request.path, {
                itemId: this.item?.itemId,
                trackPath: `lightfx/${this.trackId}.lightfx`,
              });
      if (!response.ok) {
        const message = await response.text();
        this.alert = message || `Save failed (${response.status})`;
        if (response.status === 403) this.adminMessage = 'Admin is required';
        return;
      }
    }
    this.track = withSafety;
    this.dirty = false;
    this.alert = '';
    this.status = 'Saved';
    await this.persist(false);
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

  safetyLabel(): { intense: boolean; flashing: boolean } {
    if (!this.track) return { intense: false, flashing: false };
    const safety = computeSafety(this.track);
    return {
      intense: safety.intensityRating === 'INTENSE' || safety.intensityRating === 'EXTREME',
      flashing: safety.containsFlashing,
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

  private sidecar(): ProjectSidecar {
    return sidecarDocument({
      version: 1,
      itemId: this.item?.itemId ?? '',
      trackId: this.trackId,
      sceneMarkers: [],
      channelGroups: [],
    });
  }

  private selectedColor(): { r: number; g: number; b: number } {
    const kf = this.selectedKeyframes()[0];
    return kf?.color ?? { r: 0, g: 0, b: 0 };
  }

  private selectedKeyframes(): Keyframe[] {
    const ids = new Set(this.selection);
    return this.track?.keyframes.filter((kf) => ids.has(kf.id)) ?? [];
  }

  private applyColor(color: { r: number; g: number; b: number }): void {
    if (!this.track || this.selection.length === 0) return;
    const ids = new Set(this.selection);
    this.edit({
      ...this.track,
      keyframes: this.track.keyframes.map((kf) =>
        ids.has(kf.id) ? { ...kf, colorMode: 'RGB', color } : kf
      ),
    });
    this.rememberColor(color);
  }

  private rememberColor(color: { r: number; g: number; b: number }): void {
    const hex = `#${[color.r, color.g, color.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    this.historyColors = [hex, ...this.historyColors.filter((swatch) => swatch !== hex)].slice(
      0,
      16
    );
    while (this.historyColors.length < 16) this.historyColors.push('#000000');
  }

  private syncPropertyFields(): void {
    const selected = this.selectedKeyframes();
    if (selected.length !== 1) {
      this.brightnessText = '—';
      this.kelvinOn = false;
      return;
    }
    const kf = selected[0];
    this.brightnessText = String(kf.brightness);
    this.kelvinOn = kf.colorMode === 'COLOR_TEMPERATURE';
    this.kelvin = String(kf.colorTemperature || 2700);
    this.green = String(kf.color.g);
    this.hex = [kf.color.r, kf.color.g, kf.color.b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  }

  private async openDb(): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async persist(dirty: boolean): Promise<void> {
    if (!this.db || !this.track || !this.item) return;
    const record = makeCrashRecord({
      key: crashKey(this.item.itemId, this.trackId),
      track: JSON.parse(JSON.stringify(this.track)),
      sidecar: this.sidecar(),
      playheadMs: this.playheadMs,
      scrollX: this.scrollX,
      savedAt: Date.now(),
      dirty,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record, record.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      document.body.dataset.autosave = dirty ? 'dirty' : 'clean';
    } catch (error) {
      document.body.dataset.autosave = error instanceof Error ? error.message : 'error';
    }
  }

  private async readCrash(key: string): Promise<CrashRecord | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as CrashRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
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

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (cleaned || 'track').slice(0, 64);
}
