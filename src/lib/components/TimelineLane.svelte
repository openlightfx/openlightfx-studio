<script lang="ts">
  import { displayedRgb, projectLanePoints, lowerBoundLanePoints, hitLanePoint } from '$lib/domain';
  import type { Keyframe, LanePaintPoint } from '$lib/domain';
  let { frames, scale, scroll, width, selected, label, defaultRgb, choose, begin, finish, empty } =
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
      finish: (event: PointerEvent, id: string) => void;
      empty: (event: MouseEvent) => void;
    }>();
  let canvas = $state<HTMLCanvasElement>();
  let dragging = '';
  let downX = 0;
  let suppressClick = false;
  let pickedOnDown = false;
  // Cache scalar paint data when authoring changes, not on every zoom/playback frame.
  const points: LanePaintPoint[] = $derived(projectLanePoints(frames));
  const selectedIds = $derived(new Set(selected));
  const lowerBound = (time: number) => lowerBoundLanePoints(points, time);
  function hit(event: MouseEvent | PointerEvent): string {
    if (!canvas) return '';
    const x = event.clientX - canvas.getBoundingClientRect().left;
    return hitLanePoint(points, x, scale, scroll);
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
    if (!data.length) {
      context.fillStyle = `rgb(${defaultRgb})`;
      context.fillRect(0, 0, viewWidth, 40);
    }
    const first = Math.max(0, lowerBound((start - 10) / scale) - 1);
    let visible = 0,
      painted = 0;
    for (let i = first; i < data.length; i++) {
      const point = data[i],
        next = data[i + 1],
        x = point.time * scale - start;
      if (x > viewWidth + 10) break;
      const end = Math.min(viewWidth, next ? next.time * scale - start : viewWidth);
      const beginX = Math.max(0, x);
      if (end - beginX >= 0.5) {
        const color = `rgb(${displayedRgb(point.color)})`;
        if (next && next.interpolation !== 'STEP' && next.transition) {
          const fadeX = Math.max(beginX, (next.time - next.transition) * scale - start);
          context.fillStyle = color;
          context.fillRect(beginX, 0, fadeX - beginX, 40);
          const gradient = context.createLinearGradient(fadeX, 0, Math.max(fadeX + 0.01, end), 0);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, `rgb(${displayedRgb(next.color)})`);
          context.fillStyle = gradient;
          context.fillRect(fadeX, 0, end - fadeX, 40);
        } else {
          context.fillStyle = color;
          context.fillRect(beginX, 0, end - beginX, 40);
        }
      }
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
  aria-label={`${label} timeline lane, ${frames.length} keyframes. Enter or Up and Down select keyframes.`}
  data-keyframe-count={frames.length}
  style={`left:${scroll}px;width:${Math.max(1, width)}px;height:40px`}
  onpointerdown={(event) => {
    downX = event.clientX;
    dragging = hit(event);
    pickedOnDown = Boolean(dragging);
    if (dragging) {
      choose(event, dragging);
      begin(event, dragging);
    }
  }}
  onpointerup={(event) => {
    suppressClick = Boolean(dragging) && Math.abs(event.clientX - downX) >= 4;
    if (dragging) finish(event, dragging);
    dragging = '';
  }}
  onpointercancel={() => {
    dragging = '';
  }}
  onclick={(event) => {
    event.stopPropagation();
    if (suppressClick || pickedOnDown) {
      suppressClick = false;
      pickedOnDown = false;
      return;
    }
    const id = hit(event);
    if (id) choose(event, id);
    else empty(event);
  }}
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
    position: absolute;
    top: 0;
    cursor: crosshair;
  }
  canvas:focus-visible {
    outline: 2px solid #a78bfa;
    outline-offset: -2px;
  }
</style>
