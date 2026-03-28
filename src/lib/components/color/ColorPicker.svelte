<script lang="ts">
  import ColorWheel from './ColorWheel.svelte';
  import RGBSliders from './RGBSliders.svelte';
  import KelvinSlider from './KelvinSlider.svelte';
  import HexInput from './HexInput.svelte';
  import ColorHistory from './ColorHistory.svelte';
  import IconButton from '$lib/components/shared/IconButton.svelte';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import type { RGBColor, ColorMode } from '$lib/types/index.js';

  let {
    color,
    colorMode,
    colorTemperature,
    onchange,
  }: {
    color: RGBColor;
    colorMode: ColorMode;
    colorTemperature: number;
    onchange: (color: RGBColor, colorMode: ColorMode, colorTemperature: number) => void;
  } = $props();

  let historyRef = $state<ReturnType<typeof ColorHistory> | null>(null);

  function setMode(mode: ColorMode) {
    onchange(color, mode, colorTemperature);
  }

  function handleColorChange(newColor: RGBColor) {
    historyRef?.addColor(newColor);
    onchange(newColor, colorMode, colorTemperature);
  }

  function handleKelvinChange(temperature: number, newColor: RGBColor) {
    onchange(newColor, colorMode, temperature);
  }

  function handleHistorySelect(selected: RGBColor) {
    onchange(selected, colorMode, colorTemperature);
  }
</script>

<div class="flex flex-col gap-4 p-3 bg-surface rounded-xl w-[256px]">
  <!-- Mode toggle -->
  <div class="flex bg-surface2 rounded-lg p-0.5 gap-0.5">
    <button
      class="flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
      class:bg-accent={colorMode === 'RGB'}
      class:text-white={colorMode === 'RGB'}
      class:text-textMuted={colorMode !== 'RGB'}
      class:hover:text-text-base={colorMode !== 'RGB'}
      onclick={() => setMode('RGB')}
    >
      RGB
    </button>
    <button
      class="flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
      class:bg-accent={colorMode === 'COLOR_TEMPERATURE'}
      class:text-white={colorMode === 'COLOR_TEMPERATURE'}
      class:text-textMuted={colorMode !== 'COLOR_TEMPERATURE'}
      class:hover:text-text-base={colorMode !== 'COLOR_TEMPERATURE'}
      onclick={() => setMode('COLOR_TEMPERATURE')}
    >
      Kelvin
    </button>
  </div>

  {#if colorMode === 'RGB'}
    <!-- Color wheel -->
    <ColorWheel {color} onchange={handleColorChange} />

    <!-- RGB sliders -->
    <RGBSliders {color} onchange={handleColorChange} />

    <!-- Hex input + eyedropper row -->
    <div class="flex items-end gap-2">
      <div class="flex-1">
        <HexInput {color} onchange={handleColorChange} />
      </div>
      <IconButton
        label="Pick color from video"
        active={uiStore.eyedropperActive}
        onclick={() => uiStore.toggleEyedropper()}
      >
        <!-- Eyedropper icon -->
        <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13.5 2.5a1.414 1.414 0 0 0-2 0l-1 1-1-1-4 4 1 1-4.5 4.5V14h2l4.5-4.5 1 1 4-4-1-1 1-1a1.414 1.414 0 0 0 0-2z" />
        </svg>
      </IconButton>
    </div>
  {:else}
    <!-- Kelvin slider -->
    <KelvinSlider temperature={colorTemperature} onchange={handleKelvinChange} />
  {/if}

  <!-- Color history -->
  <ColorHistory bind:this={historyRef} onselect={handleHistorySelect} />
</div>
