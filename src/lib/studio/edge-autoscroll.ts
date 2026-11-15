export interface EdgeAutoscrollOptions {
  getViewport: () => { left: number; width: number };
  getScroll: () => number;
  setScroll: (value: number) => void;
  getMaxScroll: () => number;
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (id: number) => void;
  edgeSize?: number;
  maxSpeed?: number;
}

/** Time-based, bounded horizontal autoscroll. A frame exists only while a gesture is at an edge. */
export function createEdgeAutoscrollController(options: EdgeAutoscrollOptions) {
  const request = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancel = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  const edgeSize = Math.max(1, options.edgeSize ?? 48);
  const maxSpeed = Math.max(1, options.maxSpeed ?? 900);
  let frame: number | null = null;
  let lastTime: number | null = null;
  let pointerX: number | null = null;
  let destroyed = false;

  const tick = (time: number) => {
    frame = null;
    if (destroyed || pointerX === null) return;
    const viewport = options.getViewport();
    const left = Math.max(0, Math.min(1, (viewport.left + edgeSize - pointerX) / edgeSize));
    const right = Math.max(
      0,
      Math.min(1, (pointerX - (viewport.left + viewport.width - edgeSize)) / edgeSize)
    );
    const velocity = right > 0 ? right * maxSpeed : left > 0 ? -left * maxSpeed : 0;
    if (!velocity) {
      lastTime = null;
      return;
    }
    const elapsed = lastTime === null ? 0 : Math.min(50, Math.max(0, time - lastTime));
    lastTime = time;
    const max = Math.max(0, options.getMaxScroll());
    options.setScroll(
      Math.max(0, Math.min(max, options.getScroll() + (velocity * elapsed) / 1000))
    );
    if ((velocity > 0 && options.getScroll() < max) || (velocity < 0 && options.getScroll() > 0))
      frame = request(tick);
  };
  const update = (x: number | null) => {
    if (destroyed) return;
    pointerX = Number.isFinite(x) ? x : null;
    if (pointerX === null) {
      cancelLoop();
      return;
    }
    if (frame === null) {
      lastTime = null;
      frame = request(tick);
    }
  };
  function cancelLoop() {
    if (frame !== null) cancel(frame);
    frame = null;
    lastTime = null;
  }
  return {
    update,
    cancel() {
      pointerX = null;
      cancelLoop();
    },
    cleanup() {
      destroyed = true;
      pointerX = null;
      cancelLoop();
    },
  };
}
