export type AnimationFrameScheduler = (callback: FrameRequestCallback) => number;
export type AnimationFrameCanceler = (handle: number) => void;

/**
 * Coalesces rapid ruler targets without ever forgetting the newest one. Native media
 * only accepts a new seek after the previous seek has completed; this small state
 * machine keeps that browser detail out of timeline gestures.
 */
export class LatestSeekScheduler {
  private latest: number | null = null;
  private scheduled: number | null = null;
  private inFlight = false;
  private inFlightTarget: number | null = null;

  constructor(
    private readonly dispatch: (targetMs: number) => boolean,
    private readonly requestFrame: AnimationFrameScheduler = requestAnimationFrame,
    private readonly cancelFrame: AnimationFrameCanceler = cancelAnimationFrame
  ) {}

  request(targetMs: number, immediate = false): void {
    this.latest = targetMs;
    if (immediate) this.flush();
    else this.schedule();
  }

  /** Call after native `seeked` (including a synchronous already-at-target seek). */
  complete(): void {
    if (this.latest === this.inFlightTarget) this.latest = null;
    this.inFlight = false;
    this.inFlightTarget = null;
    this.schedule();
  }

  /** A growing proxy has advanced and may make a queued target reachable. */
  retry(): void {
    this.schedule();
  }

  get pendingTarget(): number | null {
    return this.latest;
  }

  dispose(): void {
    if (this.scheduled != null) this.cancelFrame(this.scheduled);
    this.scheduled = null;
    this.latest = null;
    this.inFlight = false;
    this.inFlightTarget = null;
  }

  private schedule(): void {
    if (this.scheduled != null || this.inFlight || this.latest == null) return;
    this.scheduled = this.requestFrame(() => {
      this.scheduled = null;
      this.flush();
    });
  }

  private flush(): void {
    if (this.inFlight || this.latest == null) return;
    const target = this.latest;
    // `false` means the target is still beyond a growing proxy horizon. Keep it.
    if (!this.dispatch(target)) return;
    this.inFlight = true;
    this.inFlightTarget = target;
  }
}
