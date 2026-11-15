<script lang="ts">
  import {
    displayedRgb,
    projectLanePoints,
    lowerBoundLanePoints,
    clientXToTimelineTime,
  } from '$lib/domain';
  import type { Keyframe, LanePaintPoint } from '$lib/domain';
  import { createChannelSampler } from '$lib/domain/sample';
  let { frames, scale, scroll, width, selected, label, defaultRgb, choose, begin, beginBlank } =
    $props<{
      frames: Keyframe[];
      scale: number;
      scroll: number;
      width: number;
      selected: string[];
      label: string;
      defaultRgb: string;
      choose: (event: MouseEvent | KeyboardEvent, id: string) => void;
      begin: (event: PointerEvent, id: string) => void;
      beginBlank: (event: PointerEvent) => void;
    }>();
  let canvas = $state<HTMLCanvasElement>();
  // Cache scalar paint data when authoring changes, not on every zoom/playback frame.
  const points: LanePaintPoint[] = $derived(projectLanePoints(frames));
  const sample = $derived(createChannelSampler(frames));
  const selectedIds = $derived(new Set(selected));
  const lowerBound = (time: number) => lowerBoundLanePoints(points, time);
  function hit(event: MouseEvent | PointerEvent): string {
    if (!canvas) return '';
    const bounds = canvas.getBoundingClientRect();
    const time = clientXToTimelineTime(event.clientX, {
      originClientX: bounds.left,
      scrollX: scroll,
      pxPerMs: scale,
      durationMs: Math.max(0, frames.at(-1)?.timestampMs ?? 0) + (width + scroll) / scale,
    });
    if (time === null) return '';
    const index = lowerBound(time);
    const nearest = [points[index - 1], points[index]]
      .filter(Boolean)
      .toSorted((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
    return nearest && Math.abs(nearest.time - time) * scale <= 9 ? nearest.id : '';
  }
  $effect(() => {
    const data = points,
      selection = selectedIds;
    const start = scroll,
      viewWidth = Math.max(1, width),
      ratio = Math.min(devicePixelRatio || 1, 2);
    const node = canvas;
    const context = node?.getContext('2d');
    if (!context || !node) return;
    node.width = Math.ceil(viewWidth * ratio);
    node.height = Math.ceil(40 * ratio);
    context.scale(ratio, ratio);
    context.clearRect(0, 0, viewWidth, 40);
    context.globalAlpha = 0.3;
    // Sample exactly the playback semantics, bounded by visible CSS pixels rather
    // than track length. This also handles Kelvin and interrupted incoming fades.
    let runStart = 0;
    let previousColor = '';
    for (let pixel = 0; pixel <= Math.ceil(viewWidth); pixel++) {
      const color =
        pixel < viewWidth ? `rgb(${displayedRgb(sample((start + pixel) / scale))})` : '';
      if (color !== previousColor) {
        if (previousColor) {
          context.fillStyle = previousColor;
          context.fillRect(runStart, 0, pixel - runStart, 40);
        }
        runStart = pixel;
        previousColor = color;
      }
    }
    const first = Math.max(0, lowerBound((start - 10) / scale) - 1);
    let visible = 0,
      painted = 0;
    for (let i = first; i < data.length; i++) {
      const point = data[i],
        next = data[i + 1],
        x = point.time * scale - start;
      if (x > viewWidth + 10) break;
      if (x < -8 || x > viewWidth + 8) continue;
      visible++;
      // Dense marks share pixels at Fit. Paint the final mark at each pixel once.
      if (
        next &&
        Math.round(next.time * scale - start) === Math.round(x) &&
        !selection.has(point.id)
      )
        continue;
      context.globalAlpha = 1;
      context.beginPath();
      context.moveTo(x, 12);
      context.lineTo(x + 7, 19);
      context.lineTo(x, 26);
      context.lineTo(x - 7, 19);
      context.closePath();
      context.fillStyle = `rgb(${point.color.r},${point.color.g},${point.color.b})`;
      context.fill();
      context.strokeStyle = selection.has(point.id) ? '#fff' : '#111';
      context.lineWidth = 2;
      context.stroke();
      context.globalAlpha = 0.3;
      painted++;
    }
    node.dataset.visibleKeyframes = String(visible);
    node.dataset.paintedMarks = String(painted);
  });
</script>

<canvas
  bind:this={canvas}
  class="lane-canvas"
  role="button"
  tabindex="0"
  aria-label={`${label} timeline lane, ${frames.length} keyframes. Enter or Up and Down select keyframes; Shift extends the range; Control or Command toggles.`}
  data-keyframe-count={frames.length}
  style={`left:${scroll}px;width:${Math.max(1, width)}px;height:40px`}
  onpointerdown={(event) => {
    if (event.button !== 0) return;
    const id = hit(event);
    if (id) begin(event, id);
    else beginBlank(event);
  }}
  onclick={(event) => event.stopPropagation()}
  onkeydown={(event) => {
    if (!['Enter', ' ', 'ArrowUp', 'ArrowDown'].includes(event.key) || !points.length) return;
    event.preventDefault();
    event.stopPropagation();
    const current = points.findIndex((point) => selectedIds.has(point.id));
    const index = Math.max(
      0,
      Math.min(points.length - 1, current + (event.key === 'ArrowUp' ? -1 : 1))
    );
    choose(event, points[index].id);
  }}
></canvas>

<style>
  canvas {
    touch-action: none;
    position: absolute;
    top: 0;
    cursor: crosshair;
  }
  canvas:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
  }
</style>
