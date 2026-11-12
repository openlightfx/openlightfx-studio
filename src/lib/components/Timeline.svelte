<script lang="ts">
  import { onMount } from 'svelte';
  import { rgbToHex } from '$lib/engine/color';
  import { editor } from '$lib/state/editor.svelte';
  import { drawTimeline, type DrawScene } from '$lib/timeline/draw';
  import { attachTimeline } from '$lib/timeline/gestures';
  import { RULER_H } from '$lib/timeline/geometry';

  let wrap = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  const palette = ['#5aa7ff', '#ffb15a', '#7ee0c6', '#d59bff', '#ff7d9c', '#ffe08a'];

  function laneColor(index: number): string {
    const channel = editor.track.channels[index];
    const sum = channel.defaultColor.r + channel.defaultColor.g + channel.defaultColor.b;
    if (sum < 48) return palette[index % palette.length];
    return rgbToHex(channel.defaultColor);
  }

  function scene(): DrawScene {
    const drag = new Map((editor.drag?.items ?? []).map((item) => [`${item.kind}:${item.id}`, item]));
    const selected = editor.selectedIds();
    const channels = editor.track.channels;
    const index = new Map(channels.map((channel, i) => [channel.id, i]));
    const keyframes = [];
    for (const kf of editor.track.keyframes) {
      const over = drag.get(`keyframe:${kf.id}`);
      const channelId = over?.channelId ?? kf.channelId;
      const channelIndex = index.get(channelId);
      if (channelIndex === undefined) continue;
      keyframes.push({
        id: kf.id,
        channelIndex,
        timestampMs: over?.timestampMs ?? kf.timestampMs,
        transitionMs: over?.transitionMs ?? kf.transitionMs,
        color: kf.color,
        brightness: kf.brightness,
        selected: selected.has(kf.id)
      });
    }
    const effects = [];
    for (const fx of editor.track.effectKeyframes) {
      const over = drag.get(`effect:${fx.id}`);
      const channelId = over?.channelId ?? fx.channelId;
      const channelIndex = index.get(channelId);
      if (channelIndex === undefined) continue;
      effects.push({
        id: fx.id,
        channelIndex,
        timestampMs: over?.timestampMs ?? fx.timestampMs,
        durationMs: over?.durationMs ?? fx.durationMs,
        label: fx.effectType.toLowerCase(),
        color: fx.primaryColor,
        selected: selected.has(fx.id)
      });
    }
    const markers = editor.markers.map((marker) => {
      const over = drag.get(`marker:${marker.id}`);
      return {
        id: marker.id,
        timestampMs: over?.timestampMs ?? marker.timestampMs,
        label: marker.label,
        selected: selected.has(marker.id)
      };
    });
    return {
      view: editor.view(),
      channels: channels.map((channel, i) => ({
        id: channel.id,
        color: laneColor(i),
        muted: editor.muted.includes(channel.id),
        active: editor.selection.channelId === channel.id
      })),
      keyframes,
      effects,
      markers,
      playheadMs: editor.playheadMs,
      guideMs: editor.drag?.guideMs ?? null,
      marquee: editor.marquee
    };
  }

  function paint() {
    const node = canvas;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTimeline(ctx, scene());
  }

  function measure() {
    const node = canvas;
    const parent = wrap;
    if (!node || !parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height - 14);
    node.width = Math.floor(width * dpr);
    node.height = Math.floor(height * dpr);
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    editor.setViewport(width, height);
    paint();
  }

  const thumb = $derived.by(() => {
    const duration = Math.max(1, editor.track.metadata.durationMs);
    const visible = editor.viewportW / Math.max(editor.pixelsPerMs, 1e-9);
    return {
      width: Math.max(18, Math.min(100, (visible / duration) * 100)),
      left: Math.max(0, Math.min(100, (editor.viewStartMs / duration) * 100))
    };
  });

  function scrollDrag(event: PointerEvent) {
    const bar = (event.currentTarget as HTMLElement).parentElement;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const startX = event.clientX;
    const start = editor.viewStartMs;
    const move = (ev: PointerEvent) => {
      const duration = editor.track.metadata.durationMs;
      const visible = editor.viewportW / Math.max(editor.pixelsPerMs, 1e-9);
      const maxStart = Math.max(0, duration - visible);
      const delta = ((ev.clientX - startX) / rect.width) * duration;
      editor.viewStartMs = Math.min(maxStart, Math.max(0, start + delta));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      editor.panPixels(0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      const factor = Math.exp(-event.deltaY * 0.0016);
      editor.zoomAt(event.clientX - rect.left, factor);
    } else if (event.shiftKey) {
      editor.scrollBy(event.deltaY);
    } else {
      const dx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      editor.panPixels(dx);
    }
  }

  onMount(() => {
    if (!canvas || !wrap) return;
    measure();
    const detach = attachTimeline(canvas);
    const observer = new ResizeObserver(() => measure());
    observer.observe(wrap);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    let frame = 0;
    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      detach();
      observer.disconnect();
      canvas?.removeEventListener('wheel', onWheel);
    };
  });
</script>

<section class="timeline">
  <div class="headers">
    <div class="ruler-spacer" style:height="{RULER_H}px"></div>
    <div class="header-scroll">
      <div class="header-inner" style:transform={`translateY(${-editor.scrollY}px)`}>
        {#each editor.track.channels as channel, index (channel.id)}
          <div class="ch" class:active={editor.selection.channelId === channel.id} style:--lane={laneColor(index)}>
            <button class="name" onclick={() => editor.selectChannel(channel.id)}>{channel.displayName}</button>
            <button
              class="mini"
              class:on={editor.muted.includes(channel.id)}
              title="Mute"
              onclick={() => editor.toggleMute(channel.id)}>M</button>
            <button
              class="mini"
              class:on={editor.solo.includes(channel.id)}
              title="Solo"
              onclick={() => editor.toggleSolo(channel.id)}>S</button>
          </div>
        {/each}
        <button class="add-ch" onclick={() => editor.addChannelFromName('Channel')}>Add channel</button>
      </div>
    </div>
  </div>
  <div class="lanes" bind:this={wrap}>
    <canvas bind:this={canvas}></canvas>
    <div class="hscroll" aria-label="Timeline scroll">
      <button
        type="button"
        class="thumb"
        style:left="{thumb.left}%"
        style:width="{thumb.width}%"
        aria-label="Scroll timeline"
        onpointerdown={scrollDrag}
      ></button>
    </div>
  </div>
</section>
