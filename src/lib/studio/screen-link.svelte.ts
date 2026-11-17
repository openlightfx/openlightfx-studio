import { roomApi } from '$lib/api/rooms';
import type { StudioSession } from './session.svelte';

export interface ScreenState {
  leaseId?: string;
  available: boolean;
  canSeek: boolean;
  itemId?: string;
  itemName?: string;
  positionMs: number;
  paused: boolean;
  ready: boolean;
  reason?: string;
}

/** Emby is the clock; the paused local proxy is a silent, best-effort monitor. */
export class ScreenLink {
  connected = $state(false);
  busy = $state(false);
  ready = $state(false);
  canSeek = $state(false);
  status = $state('');
  error = $state('');
  private leaseId = '';
  private roomId = '';
  private itemId = '';
  private disposed = false;
  private epoch = 0;
  private queue: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private clockTimer: ReturnType<typeof setInterval> | undefined;
  private seekTimer: ReturnType<typeof setTimeout> | undefined;
  private seekTarget: number | null = null;
  private awaitingSeek: { target: number; until: number } | null = null;
  private state: ScreenState | null = null;
  private receivedAt = 0;
  private lastReadyAt = 0;
  private hadReady = false;

  constructor(
    private session: StudioSession,
    private onDisconnect: () => void = () => {}
  ) {}

  private path(roomId = this.roomId) {
    return `Rooms/${encodeURIComponent(roomId)}/Screen`;
  }

  private control(command: string, positionMs = 0, roomId = this.roomId, leaseId = this.leaseId) {
    return roomApi<ScreenState>(`${this.path(roomId)}/Control`, {
      method: 'POST',
      body: JSON.stringify({ leaseId, command, positionMs: Math.round(positionMs) }),
      signal: AbortSignal.timeout(12000),
      keepalive: command === 'disconnect',
    });
  }

  async connect(roomId: string): Promise<void> {
    if (this.busy || this.connected || !this.session.item || this.disposed) return;
    this.busy = true;
    this.error = '';
    this.status = 'Checking room screen…';
    const epoch = ++this.epoch;
    const itemId = this.session.item.itemId;
    try {
      const available = await roomApi<ScreenState>(this.path(roomId), {
        signal: AbortSignal.timeout(12000),
      });
      if (epoch !== this.epoch || this.disposed || this.session.item?.itemId !== itemId) return;
      if (!available.available)
        throw new Error(available.reason || 'The room screen is unavailable.');
      if (
        available.itemId &&
        !window.confirm(
          `The screen is playing ${available.itemName || 'another video'}. Replace its playback with this movie at the editor position?`
        )
      ) {
        this.status = '';
        return;
      }
      const result = await roomApi<ScreenState>(`${this.path(roomId)}/Start`, {
        method: 'POST',
        body: JSON.stringify({
          itemId,
          positionMs: Math.round(this.session.playheadMs),
          replacePlayback: Boolean(available.itemId),
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!result.leaseId) throw new Error('The plugin did not return a screen reservation.');
      if (epoch !== this.epoch || this.disposed || this.session.item?.itemId !== itemId) {
        await this.control('disconnect', 0, roomId, result.leaseId);
        return;
      }
      this.session.pause();
      this.roomId = roomId;
      this.itemId = itemId;
      this.leaseId = result.leaseId;
      this.connected = true;
      this.hadReady = false;
      this.lastReadyAt = performance.now();
      this.session.screenTransport = this;
      this.status = 'Starting movie on room screen…';
      this.clockTimer = setInterval(() => this.tick(), 100);
      this.schedulePoll(0);
    } catch (error) {
      if (epoch === this.epoch && !this.disposed) {
        this.error = (error as Error).message || 'Could not connect the room screen.';
        this.status = '';
      }
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }

  private schedulePoll(delay = 500) {
    this.pollTimer = setTimeout(() => {
      this.enqueue(async () => {
        const state = await this.control('state');
        this.accept(state);
        if (this.connected && state.leaseId === this.leaseId) this.schedulePoll();
      });
    }, delay);
  }

  private enqueue(task: () => Promise<void>) {
    const epoch = this.epoch;
    this.queue = this.queue.then(async () => {
      if (epoch !== this.epoch || !this.connected) return;
      try {
        await task();
      } catch (error) {
        if (epoch !== this.epoch) return;
        this.error = (error as Error).message || 'The room screen disconnected.';
        await this.disconnect();
      }
    });
  }

  private accept(state: ScreenState) {
    if (!this.connected || this.disposed || state.leaseId !== this.leaseId) return;
    if (this.session.item?.itemId !== this.itemId)
      throw new Error('The editor movie changed. Connect its room screen again.');
    if (this.hadReady && state.itemId !== this.itemId)
      throw new Error('Playback on the screen stopped or changed to another movie.');
    this.ready = state.ready;
    this.canSeek = state.canSeek;
    if (!state.ready) {
      this.status = state.reason || 'Waiting for screen playback…';
      if (performance.now() - this.lastReadyAt > (this.hadReady ? 12000 : 30000))
        throw new Error('The screen did not report playback. Reconnect it to try again.');
      this.session.playing = false;
      return;
    }
    this.hadReady = true;
    this.lastReadyAt = performance.now();
    this.state = state;
    this.receivedAt = performance.now();
    if (this.awaitingSeek && Math.abs(state.positionMs - this.awaitingSeek.target) < 1200)
      this.awaitingSeek = null;
    this.status = state.paused ? 'Screen paused' : 'Playing on room screen';
    if (!state.canSeek) this.status += ' · this player cannot seek';
    this.tick();
  }

  private tick() {
    if (!this.connected || !this.ready || !this.state) return;
    if (this.session.item?.itemId !== this.itemId) {
      void this.disconnect();
      return;
    }
    if (this.seekTarget != null) return;
    if (this.awaitingSeek) {
      if (performance.now() < this.awaitingSeek.until) {
        this.status = 'Waiting for screen seek…';
        return;
      }
      this.awaitingSeek = null;
      this.error =
        'The screen did not confirm the requested seek. Following its reported position.';
    }
    const elapsed = this.state.paused ? 0 : Math.min(1500, performance.now() - this.receivedAt);
    this.session.applyScreenPlayback(this.state.positionMs + elapsed, this.state.paused);
  }

  togglePlay() {
    if (!this.ready) return;
    this.flushSeek();
    this.enqueue(async () => {
      await this.control(this.state?.paused ? 'play' : 'pause');
      this.status = 'Waiting for screen playback…';
    });
  }

  pause() {
    if (!this.ready) return;
    this.enqueue(async () => {
      await this.control('pause');
    });
  }

  seek(positionMs: number, final = false) {
    if (!this.ready || !this.canSeek) {
      this.session.status = this.ready
        ? 'This screen does not support seeking.'
        : 'Wait for the screen to start.';
      return;
    }
    this.seekTarget = positionMs;
    this.session.playheadMs = positionMs;
    clearTimeout(this.seekTimer);
    if (final) this.flushSeek();
    else this.seekTimer = setTimeout(() => this.flushSeek(), 200);
  }

  flushSeek() {
    clearTimeout(this.seekTimer);
    const target = this.seekTarget;
    if (target == null) return;
    this.seekTarget = null;
    this.awaitingSeek = { target, until: performance.now() + 10000 };
    this.enqueue(async () => {
      await this.control('seek', target);
    });
  }

  async disconnect(): Promise<void> {
    const roomId = this.roomId;
    const leaseId = this.leaseId;
    const epoch = ++this.epoch;
    this.queue = Promise.resolve();
    clearTimeout(this.pollTimer);
    clearTimeout(this.seekTimer);
    clearInterval(this.clockTimer);
    this.session.screenTransport = null;
    this.session.pause();
    this.connected = false;
    this.busy = Boolean(leaseId);
    this.ready = false;
    this.leaseId = '';
    this.state = null;
    this.seekTarget = null;
    this.awaitingSeek = null;
    this.status = leaseId ? 'Disconnecting room screen…' : '';
    if (!leaseId) return;
    this.onDisconnect();
    try {
      await this.control('disconnect', 0, roomId, leaseId);
    } catch {
      if (!this.disposed)
        this.error ||=
          'Could not confirm disconnection. The room reservation will expire automatically.';
    } finally {
      if (this.epoch === epoch) {
        this.busy = false;
        this.status = '';
      }
    }
  }

  dispose() {
    this.disposed = true;
    void this.disconnect();
  }
}
