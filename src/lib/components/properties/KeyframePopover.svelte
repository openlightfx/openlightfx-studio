<script lang="ts">
  import Popover from '$lib/components/shared/Popover.svelte';
  import Slider from '$lib/components/shared/Slider.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import Toggle from '$lib/components/shared/Toggle.svelte';
  import IconButton from '$lib/components/shared/IconButton.svelte';
  import ColorPicker from '$lib/components/color/ColorPicker.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { EditKeyframeCommand } from '$lib/commands/edit-keyframe.js';
  import { CompositeCommand } from '$lib/commands/composite.js';
  import { rgbToHex, rgbToCssString } from '$lib/services/color-utils.js';
  import type { RGBColor, ColorMode, InterpolationMode, Keyframe } from '$lib/types/track.js';

  let {
    anchorRect,
    isOpen = $bindable(),
  }: {
    anchorRect: { x: number; y: number; width: number; height: number };
    isOpen: boolean;
  } = $props();

  // Derived selected keyframes
  let selectedKeyframes = $derived(
    timelineStore.selectedKeyframeIds
      .map((id) => projectStore.getKeyframes().find((kf) => kf.id === id))
      .filter((kf): kf is Keyframe => kf != null)
  );

  let isMulti = $derived(selectedKeyframes.length > 1);

  // Mixed-value helpers
  function allSame<T>(values: T[]): boolean {
    return values.length > 0 && values.every((v) => v === values[0]);
  }
  function allSameDeep<T>(values: T[], keyFn: (v: T) => unknown): boolean {
    if (values.length === 0) return false;
    const first = JSON.stringify(keyFn(values[0]));
    return values.every((v) => JSON.stringify(keyFn(v)) === first);
  }

  // Shared computed values from selection
  let sharedColorMode = $derived(
    allSame(selectedKeyframes.map((kf) => kf.colorMode))
      ? (selectedKeyframes[0]?.colorMode ?? 'RGB')
      : ('RGB' as ColorMode)
  );
  let sharedColor = $derived(
    allSameDeep(selectedKeyframes, (kf) => kf.color)
      ? (selectedKeyframes[0]?.color ?? { r: 0, g: 0, b: 0 })
      : { r: 128, g: 128, b: 128 }
  );
  let colorMixed = $derived(isMulti && !allSameDeep(selectedKeyframes, (kf) => kf.color));

  let sharedColorTemperature = $derived(
    allSame(selectedKeyframes.map((kf) => kf.colorTemperature))
      ? (selectedKeyframes[0]?.colorTemperature ?? 6500)
      : 6500
  );

  let sharedBrightness = $derived(
    allSame(selectedKeyframes.map((kf) => kf.brightness))
      ? (selectedKeyframes[0]?.brightness ?? 0)
      : 50
  );
  let brightnessMixed = $derived(isMulti && !allSame(selectedKeyframes.map((kf) => kf.brightness)));

  let sharedTransitionMs = $derived(
    allSame(selectedKeyframes.map((kf) => kf.transitionMs))
      ? (selectedKeyframes[0]?.transitionMs ?? 0)
      : 0
  );
  let transitionMixed = $derived(isMulti && !allSame(selectedKeyframes.map((kf) => kf.transitionMs)));

  let sharedInterpolation = $derived(
    allSame(selectedKeyframes.map((kf) => kf.interpolation))
      ? (selectedKeyframes[0]?.interpolation ?? 'STEP')
      : ('STEP' as InterpolationMode)
  );
  let interpolationMixed = $derived(isMulti && !allSame(selectedKeyframes.map((kf) => kf.interpolation)));

  let sharedPowerOn = $derived(
    allSame(selectedKeyframes.map((kf) => kf.powerOn))
      ? (selectedKeyframes[0]?.powerOn ?? false)
      : false
  );
  let powerMixed = $derived(isMulti && !allSame(selectedKeyframes.map((kf) => kf.powerOn)));

  // Local reactive state for sliders (synced from shared on selection change)
  let brightness = $state(0);
  let transitionMs = $state(0);
  let interpolation = $state<InterpolationMode>('STEP');
  let powerOn = $state(false);

  // Track whether the local state was just synced from selection (to avoid echo)
  let syncingFromSelection = false;

  $effect(() => {
    syncingFromSelection = true;
    brightness = sharedBrightness * 100;
    transitionMs = sharedTransitionMs;
    interpolation = sharedInterpolation;
    powerOn = sharedPowerOn;
    // Allow microtask to clear the flag
    Promise.resolve().then(() => { syncingFromSelection = false; });
  });

  // ColorPicker expanded state
  let colorPickerOpen = $state(false);

  // Dispatch a patch to all selected keyframes
  function applyPatch(patch: Partial<Keyframe>) {
    if (selectedKeyframes.length === 0) return;
    const commands = selectedKeyframes.map(
      (kf) => new EditKeyframeCommand(kf.id, patch, projectStore)
    );
    if (commands.length === 1) {
      undoStore.execute(commands[0]);
    } else {
      undoStore.execute(new CompositeCommand('Edit keyframes', commands));
    }
  }

  function handleColorChange(color: RGBColor, mode: ColorMode, temp: number) {
    applyPatch({ color: { ...color }, colorMode: mode, colorTemperature: temp });
  }

  // Slider/select change handlers invoked from native input events
  function handleBrightnessInput(e: Event) {
    if (syncingFromSelection) return;
    applyPatch({ brightness: Number((e.target as HTMLInputElement).value) / 100 });
  }

  function handleTransitionInput(e: Event) {
    if (syncingFromSelection) return;
    applyPatch({ transitionMs: Number((e.target as HTMLInputElement).value) });
  }

  function handleInterpolationChange(e: Event) {
    if (syncingFromSelection) return;
    applyPatch({ interpolation: (e.target as HTMLSelectElement).value as InterpolationMode });
  }

  function handlePowerToggle() {
    if (syncingFromSelection) return;
    applyPatch({ powerOn });
  }

  const interpolationOptions = [
    { value: 'STEP', label: 'Step' },
    { value: 'LINEAR', label: 'Linear' },
  ];
</script>

{#if isOpen && selectedKeyframes.length > 0}
  <Popover {anchorRect} onclose={() => (isOpen = false)}>
    <div class="flex flex-col gap-3 w-[280px]">

      <!-- Header: color swatch + hex + multi count -->
      <div class="flex items-center gap-2">
        <button
          class="w-8 h-8 rounded-md border-2 border-surface3 shrink-0 hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-accent/50"
          style="background-color: {rgbToCssString(sharedColor)};"
          title={colorMixed ? 'Mixed colors' : rgbToHex(sharedColor)}
          onclick={() => (colorPickerOpen = !colorPickerOpen)}
          aria-label="Toggle color picker"
        ></button>
        <span class="text-sm font-mono text-text-base flex-1">
          {colorMixed ? '—' : rgbToHex(sharedColor)}
        </span>
        {#if isMulti}
          <span class="text-xs text-textMuted">{selectedKeyframes.length} selected</span>
        {/if}
        <IconButton label="Toggle color picker" onclick={() => (colorPickerOpen = !colorPickerOpen)}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            {#if colorPickerOpen}
              <path d="M12 10L8 6l-4 4" />
            {:else}
              <path d="M4 6l4 4 4-4" />
            {/if}
          </svg>
        </IconButton>
      </div>

      <!-- Inline color picker (expandable) -->
      {#if colorPickerOpen}
        <div class="border-t border-surface3 pt-3">
          <ColorPicker
            color={sharedColor}
            colorMode={sharedColorMode}
            colorTemperature={sharedColorTemperature}
            onchange={handleColorChange}
          />
        </div>
      {/if}

      <div class="border-t border-surface3"></div>

      <!-- Brightness slider -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class:opacity-60={brightnessMixed} onpointerup={handleBrightnessInput}>
        <Slider
          label={brightnessMixed ? 'Bright —' : 'Brightness'}
          bind:value={brightness}
          min={0}
          max={100}
          step={1}
          unit="%"
        />
      </div>

      <!-- Transition duration slider -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class:opacity-60={transitionMixed} onpointerup={handleTransitionInput}>
        <Slider
          label={transitionMixed ? 'Trans —' : 'Transition'}
          bind:value={transitionMs}
          min={0}
          max={2000}
          step={10}
          unit="ms"
        />
      </div>

      <!-- Interpolation select -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class:opacity-60={interpolationMixed} onchange={handleInterpolationChange}>
        <Select
          label={interpolationMixed ? 'Interp —' : 'Interp'}
          bind:value={interpolation}
          options={interpolationOptions}
        />
      </div>

      <!-- Power toggle -->
      <div class="flex items-center justify-between" class:opacity-60={powerMixed}>
        <span class="text-xs text-textMuted">{powerMixed ? 'Power —' : 'Power'}</span>
        <Toggle label="" bind:checked={powerOn} onclick={handlePowerToggle} />
      </div>

      <!-- Eyedropper button -->
      <div class="flex justify-end border-t border-surface3 pt-2">
        <IconButton
          label="Pick color from video"
          active={uiStore.eyedropperActive}
          onclick={() => uiStore.toggleEyedropper()}
        >
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.5 2.5a1.414 1.414 0 0 0-2 0l-1 1-1-1-4 4 1 1-4.5 4.5V14h2l4.5-4.5 1 1 4-4-1-1 1-1a1.414 1.414 0 0 0 0-2z" />
          </svg>
        </IconButton>
      </div>

    </div>
  </Popover>
{/if}
