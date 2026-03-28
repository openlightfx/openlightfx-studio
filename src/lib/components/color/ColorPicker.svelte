<script lang="ts">
  import type { RGBColor } from '$lib/types/index.js';
  import { rgbToCssString, kelvinToRgb } from '$lib/services/color-utils.js';
  import { MIN_COLOR_TEMPERATURE } from '$lib/types/track.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import ColorWheel from './ColorWheel.svelte';
  import RGBSliders from './RGBSliders.svelte';
  import HexInput from './HexInput.svelte';
  import ColorTemperature from './ColorTemperature.svelte';
  import ColorHistory from './ColorHistory.svelte';
  import VideoFrameSampler from './VideoFrameSampler.svelte';

  let {
    color,
    onchange,
    mode = 'rgb',
    onmodechange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
    mode?: 'rgb' | 'temperature';
    onmodechange?: (mode: 'rgb' | 'temperature') => void;
  } = $props();

  let kelvin = $state(MIN_COLOR_TEMPERATURE);
  let colorHistoryRef: ColorHistory | undefined = $state();
  let showSampler = $state(false);

  const previewCss = $derived(rgbToCssString(color));
  const videoLoaded = $derived(videoStore.state.isLoaded);

  function setMode(m: 'rgb' | 'temperature') {
    onmodechange?.(m);
  }

  function handleColorChange(newColor: RGBColor) {
    onchange(newColor);
    colorHistoryRef?.addColor(newColor);
  }

  function handleKelvinChange(k: number) {
    kelvin = k;
    const rgb = kelvinToRgb(k);
    onchange(rgb);
    colorHistoryRef?.addColor(rgb);
  }

  function handleHistorySelect(c: RGBColor) {
    onchange(c);
  }

  function handleSamplerPick(c: RGBColor) {
    handleColorChange(c);
    showSampler = false;
  }
</script>

<div class="flex flex-col gap-3 rounded-lg border border-surface2 bg-surface1 p-3">
  <!-- Mode toggle tabs -->
  <div class="flex rounded-md border border-surface2 bg-surface2">
    <button
      type="button"
      class="flex-1 rounded-l-md px-3 py-1 text-xs font-medium transition-colors
        {mode === 'rgb' ? 'bg-accent text-white' : 'text-textMuted hover:text-text-base'}"
      onclick={() => setMode('rgb')}
    >
      RGB
    </button>
    <button
      type="button"
      class="flex-1 rounded-r-md px-3 py-1 text-xs font-medium transition-colors
        {mode === 'temperature' ? 'bg-accent text-white' : 'text-textMuted hover:text-text-base'}"
      onclick={() => setMode('temperature')}
    >
      Temperature
    </button>
  </div>

  <!-- Color preview swatch + eyedropper toggle -->
  <div class="flex items-center gap-2">
    <div
      class="h-8 w-8 rounded border border-surface2"
      style="background-color: {previewCss};"
    ></div>
    <span class="text-xs tabular-nums text-textMuted">
      R:{color.r} G:{color.g} B:{color.b}
    </span>
    {#if videoLoaded}
      <button
        type="button"
        class="ml-auto rounded p-1 text-xs transition-colors
          {showSampler
          ? 'bg-accent text-white'
          : 'text-textMuted hover:bg-surface2 hover:text-text-base'}"
        title={showSampler ? 'Hide video sampler' : 'Sample color from video frame'}
        aria-label={showSampler ? 'Hide video sampler' : 'Sample color from video frame'}
        aria-pressed={showSampler}
        onclick={() => (showSampler = !showSampler)}>💧</button
      >
    {/if}
  </div>

  <!-- Video frame sampler -->
  {#if showSampler}
    <VideoFrameSampler onpick={handleSamplerPick} />
  {/if}

  <!-- Mode-specific controls -->
  {#if mode === 'rgb'}
    <ColorWheel {color} onchange={handleColorChange} />
    <RGBSliders {color} onchange={handleColorChange} />
    <HexInput {color} onchange={handleColorChange} />
  {:else}
    <ColorTemperature {kelvin} onchange={handleKelvinChange} />
  {/if}

  <!-- Color history -->
  <ColorHistory bind:this={colorHistoryRef} onselect={handleHistorySelect} />
</div>
