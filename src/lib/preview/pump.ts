import type { BulbFrameState } from '$lib/api/types';

/**
 * Coalesces bulb frames to at most one in-flight send per interval.
 * Default interval is 100ms (~10/s). Callers raise it to honor minTransitionMs.
 */
export class FramePump {
  private intervalMs: number;
  private pending: BulbFrameState[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;
  private sending = false;
  private stopped = false;
  private lastKey = '';

  constructor(
    private readonly send: (states: BulbFrameState[]) => Promise<void>,
    intervalMs = 100
  ) {
    this.intervalMs = intervalMs;
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = Math.max(100, ms);
  }

  push(states: BulbFrameState[]): void {
    if (this.stopped) return;
    const key = states
      .map((s) => `${s.bulbId}:${s.r},${s.g},${s.b},${s.brightness}`)
      .join('|');
    if (key === this.lastKey && !this.pending) return;
    this.pending = states;
    this.schedule();
  }

  markStopped(): void {
    this.stopped = true;
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  resume(): void {
    this.stopped = false;
    this.lastKey = '';
  }

  private schedule(): void {
    if (this.timer || this.sending || !this.pending) return;
    const wait = Math.max(0, this.intervalMs - (performance.now() - this.lastSent));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    if (!this.pending || this.stopped) return;
    const states = this.pending;
    this.pending = null;
    this.sending = true;
    this.lastSent = performance.now();
    this.lastKey = states.map((s) => `${s.bulbId}:${s.r},${s.g},${s.b},${s.brightness}`).join('|');
    try {
      await this.send(states);
    } finally {
      this.sending = false;
      if (this.pending) this.schedule();
    }
  }
}
