<script lang="ts">
  import type {
    Keyframe,
    RGBColor,
    ColorMode,
    InterpolationMode,
  } from '$lib/types/index.js';
  import {
    MIN_COLOR_TEMPERATURE,
    MAX_COLOR_TEMPERATURE,
    COLOR_TEMPERATURE_STEP,
  } from '$lib/types/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { TextInput, Select, Slider } from '$lib/components/shared/index.js';
  import { rgbToHex, hexToRgb, rgbToCssString, kelvinToRgb } from '$lib/services/color-utils.js';

  let {
    keyframeIds,
  }: {
    keyframeIds: string[];
  } = $props();

  const keyframes = $derived(
    keyframeIds
      .map((id) => projectStore.project.file.track.keyframes.find((kf: Keyframe) => kf.id === id))
      .filter((kf): kf is Keyframe => kf !== undefined)
  );

  const isMulti = $derived(keyframes.length > 1);
  const single = $derived(keyframes.length === 1 ? keyframes[0] : null);

  // Derive shared/mixed values for multi-select display
  function sharedValue<T>(getter: (kf: Keyframe) => T): T | null {
    if (keyframes.length === 0) return null;
    const first = getter(keyframes[0]);
    const allSame = keyframes.every((kf) => {
      const val = getter(kf);
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val) === JSON.stringify(first);
      }
      return val === first;
    });
    return allSame ? first : null;
  }

  const sharedColorMode = $derived(sharedValue((kf) => kf.colorMode));
  const sharedColor = $derived(sharedValue((kf) => kf.color));
  const sharedColorTemp = $derived(sharedValue((kf) => kf.colorTemperature));
  const sharedBrightness = $derived(sharedValue((kf) => kf.brightness));
  const sharedTransition = $derived(sharedValue((kf) => kf.transitionMs));
  const sharedInterpolation = $derived(sharedValue((kf) => kf.interpolation));
  const sharedPower = $derived(sharedValue((kf) => kf.powerOn));
  const sharedChannelId = $derived(sharedValue((kf) => kf.channelId));

  // Color mode for the editor: use shared value or default to RGB
  let colorModeOverride = $state<ColorMode | null>(null);
  const activeColorMode = $derived(colorModeOverride ?? sharedColorMode ?? 'RGB');

  // Reset override when selection changes
  $effect(() => {
    keyframeIds; // track dependency
    colorModeOverride = null;
  });

  const hexColor = $derived(sharedColor ? rgbToHex(sharedColor).toUpperCase() : '');
  const kelvinPreview = $derived(sharedColorTemp != null ? kelvinToRgb(sharedColorTemp) : null);

  function formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  function updateAll(updates: Partial<Keyframe>) {
    for (const kf of keyframes) {
      projectStore.updateKeyframe(kf.id, updates);
    }
  }

  // --- Color Mode ---
  function handleColorModeChange(value: string) {
    const mode = value as ColorMode;
    colorModeOverride = mode;
    updateAll({ colorMode: mode });
  }

  // --- RGB ---
  function handleColorR(value: number) {
    const base = sharedColor ?? { r: 0, g: 0, b: 0 };
    updateAll({ color: { ...base, r: Math.round(value) } });
  }

  function handleColorG(value: number) {
    const base = sharedColor ?? { r: 0, g: 0, b: 0 };
    updateAll({ color: { ...base, g: Math.round(value) } });
  }

  function handleColorB(value: number) {
    const base = sharedColor ?? { r: 0, g: 0, b: 0 };
    updateAll({ color: { ...base, b: Math.round(value) } });
  }

  function handleHexInput(value: string) {
    const parsed = hexToRgb(value);
    if (parsed) {
      updateAll({ color: parsed });
    }
  }

  // --- Color Temperature ---
  function handleKelvin(value: number) {
    updateAll({ colorTemperature: value });
  }

  // --- Other fields ---
  function handleBrightness(value: number) {
    updateAll({ brightness: value });
  }

  function handleTransition(value: string) {
    const ms = parseInt(value, 10);
    if (!Number.isNaN(ms) && ms >= 0) {
      updateAll({ transitionMs: ms });
    }
  }

  function handleInterpolation(value: string) {
    updateAll({ interpolation: value as InterpolationMode });
  }

  function handlePowerToggle() {
    const newPower = sharedPower === null ? true : !sharedPower;
    updateAll({ powerOn: newPower });
  }

  const interpolationOptions = [
    { value: 'STEP', label: 'Step' },
    { value: 'LINEAR', label: 'Linear' },
  ];

  const colorModeOptions = [
    { value: 'RGB', label: 'RGB' },
    { value: 'COLOR_TEMPERATURE', label: 'Color Temperature' },
  ];
</script>

{#if keyframes.length === 0}
  <p class="text-sm text-textMuted">No keyframes selected.</p>
{:else}
  <div class="flex flex-col gap-4">
    {#if isMulti}
      <div class="rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">
        {keyframes.length} keyframes selected
      </div>
    {/if}

    <!-- Read-only info -->
    {#if single}
      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Channel</span>
          <span class="text-xs font-mono text-text-base">{single.channelId}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Timestamp</span>
          <span class="text-xs font-mono text-text-base">{formatTimestamp(single.timestampMs)}</span>
        </div>
      </section>

      <hr class="border-surface2" />
    {:else if sharedChannelId}
      <div class="flex items-center justify-between">
        <span class="text-xs text-textMuted">Channel</span>
        <span class="text-xs font-mono text-text-base">{sharedChannelId}</span>
      </div>
      <hr class="border-surface2" />
    {/if}

    <!-- Color Mode Toggle -->
    <section class="flex flex-col gap-3">
      <Select
        value={activeColorMode}
        options={colorModeOptions}
        label="Color Mode"
        onchange={handleColorModeChange}
      />

      {#if activeColorMode === 'RGB'}
        <!-- Color swatch + hex -->
        <div class="flex items-center gap-3">
          <div
            class="h-8 w-8 shrink-0 rounded-md border border-surface3 shadow-sm"
            style="background-color: {sharedColor ? rgbToCssString(sharedColor) : '#000'};"
            title="Keyframe color"
          ></div>
          <TextInput
            value={hexColor ? hexColor.slice(1) : '--'}
            label="Hex"
            placeholder="FF0000"
            oninput={handleHexInput}
          />
        </div>

        <!-- RGB Sliders -->
        <Slider
          value={sharedColor?.r ?? 0}
          min={0} max={255} step={1}
          label="R"
          onchange={handleColorR}
        />
        <Slider
          value={sharedColor?.g ?? 0}
          min={0} max={255} step={1}
          label="G"
          onchange={handleColorG}
        />
        <Slider
          value={sharedColor?.b ?? 0}
          min={0} max={255} step={1}
          label="B"
          onchange={handleColorB}
        />
      {:else}
        <!-- Color Temperature -->
        <div class="flex items-center gap-3">
          {#if kelvinPreview}
            <div
              class="h-8 w-8 shrink-0 rounded-md border border-surface3 shadow-sm"
              style="background-color: {rgbToCssString(kelvinPreview)};"
              title="Color temperature preview"
            ></div>
          {/if}
          <span class="text-sm text-text-base">
            {sharedColorTemp != null ? `${sharedColorTemp}K` : '--'}
          </span>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="kelvin-slider" class="text-xs font-medium text-textMuted">Temperature</label>
            <span class="text-xs tabular-nums text-text-base">{sharedColorTemp ?? '--'}K</span>
          </div>
          <input
            id="kelvin-slider"
            type="range"
            min={MIN_COLOR_TEMPERATURE}
            max={MAX_COLOR_TEMPERATURE}
            step={COLOR_TEMPERATURE_STEP}
            value={sharedColorTemp ?? 2700}
            oninput={(e) => handleKelvin(Number((e.target as HTMLInputElement).value))}
            class="kelvin-slider h-1.5 w-full cursor-pointer appearance-none rounded-full"
            aria-label="Color temperature"
          />
          <div class="flex justify-between text-2xs text-textMuted">
            <span>Warm</span>
            <span>Cool</span>
          </div>
        </div>
      {/if}
    </section>

    <hr class="border-surface2" />

    <!-- Brightness -->
    <section class="flex flex-col gap-3">
      <Slider
        value={sharedBrightness ?? 50}
        min={0} max={100} step={1}
        label="Brightness"
        onchange={handleBrightness}
      />
    </section>

    <hr class="border-surface2" />

    <!-- Transition & Interpolation -->
    <section class="flex flex-col gap-3">
      <TextInput
        value={sharedTransition != null ? String(sharedTransition) : '--'}
        label="Transition Duration (ms)"
        type="number"
        placeholder="0"
        oninput={handleTransition}
      />

      <Select
        value={sharedInterpolation ?? 'STEP'}
        options={interpolationOptions}
        label="Interpolation"
        onchange={handleInterpolation}
      />
    </section>

    <hr class="border-surface2" />

    <!-- Power State -->
    <section class="flex items-center justify-between">
      <label for="kf-power" class="text-xs font-medium text-textMuted">Power</label>
      <button
        id="kf-power"
        role="switch"
        aria-checked={sharedPower ?? false}
        aria-label="Toggle power state"
        onclick={handlePowerToggle}
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors
          {sharedPower ? 'bg-accent' : sharedPower === null ? 'bg-surface3' : 'bg-surface3'}"
      >
        <span
          class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform
            {sharedPower ? 'translate-x-4' : 'translate-x-0.5'}"
        ></span>
      </button>
      {#if sharedPower === null}
        <span class="text-2xs text-textMuted">(mixed)</span>
      {/if}
    </section>
  </div>
{/if}

<style>
  .kelvin-slider {
    background: linear-gradient(
      to right,
      #ff8a00 0%,
      #ffcc77 20%,
      #fff5e6 40%,
      #ffffff 55%,
      #cce0ff 75%,
      #99bbff 100%
    );
  }

  .kelvin-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
    cursor: pointer;
    box-shadow: 0 0 4px rgba(108, 99, 255, 0.4);
  }

  .kelvin-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
    cursor: pointer;
    box-shadow: 0 0 4px rgba(108, 99, 255, 0.4);
  }

  .kelvin-slider:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 9999px;
  }
</style>
