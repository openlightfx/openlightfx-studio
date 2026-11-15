<script lang="ts">
  import { sourcePixel } from '$lib/domain';
  import { formatClock } from '$lib/studio/session.svelte';
  let {
    src,
    sourceTimeMs = null,
    onpick,
    oncancel,
    onerror,
  }: {
    src: string;
    sourceTimeMs?: number | null;
    onpick: (color: { r: number; g: number; b: number }) => void;
    oncancel: () => void;
    onerror: () => void;
  } = $props();
  let image: HTMLImageElement;
  let source: HTMLCanvasElement | undefined;
  let ready = $state(false);

  function loaded() {
    try {
      source = document.createElement('canvas');
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      const context = source.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas is unavailable');
      // Only the plugin's full-resolution PNG is sampled, never the video or scaled image.
      context.drawImage(image, 0, 0);
      ready = true;
    } catch {
      onerror();
    }
  }
  function pick(clientX?: number, clientY?: number) {
    if (!source || !ready) return;
    const bounds = image.getBoundingClientRect();
    const scale = Math.min(bounds.width / source.width, bounds.height / source.height);
    const width = source.width * scale,
      height = source.height * scale;
    const left = bounds.left + (bounds.width - width) / 2;
    const top = bounds.top + (bounds.height - height) / 2;
    const x = (clientX ?? left + width / 2) - left;
    const y = (clientY ?? top + height / 2) - top;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = sourcePixel(x, y, width, height, source.width, source.height);
    const data = source.getContext('2d')!.getImageData(pixel.x, pixel.y, 1, 1).data;
    onpick({ r: data[0], g: data[1], b: data[2] });
  }
</script>

<div class="frame-picker" role="group" aria-label="Pick color from plugin frame">
  <button
    class="source"
    aria-label="Source frame — click to sample color"
    disabled={!ready}
    onclick={(event) =>
      pick(event.detail ? event.clientX : undefined, event.detail ? event.clientY : undefined)}
  >
    <img bind:this={image} {src} alt="Source frame" onload={loaded} {onerror} />
  </button>
  <div class="instructions">
    <span
      >Click the frame to pick a color. Enter picks the center.
      {#if sourceTimeMs != null}<span class="source-time"
          >Source frame: {formatClock(sourceTimeMs)}</span
        >{/if}
    </span>
    <button onclick={oncancel}>Cancel color pick</button>
  </div>
</div>

<style>
  .frame-picker {
    position: absolute;
    inset: 0;
    z-index: 4;
    background: #000;
  }
  .source {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: crosshair;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }
  .instructions {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px;
    color: white;
    background: #000b;
  }
  .source-time {
    display: block;
    font-variant-numeric: tabular-nums;
  }
  .instructions button {
    padding: 6px 9px;
    color: white;
    background: #202033;
    border: 1px solid #596078;
    border-radius: 5px;
  }
</style>
