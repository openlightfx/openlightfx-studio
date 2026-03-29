<script lang="ts">
  import Popover from '$lib/components/shared/Popover.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import ColorPicker from '$lib/components/color/ColorPicker.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { EditEffectCommand } from '$lib/commands/edit-effect.js';
  import { DeleteEffectCommand } from '$lib/commands/delete-effect.js';
  import { CompositeCommand } from '$lib/commands/composite.js';
  import { getEffectDisplayInfo } from '$lib/services/effect-defaults.js';
  import { rgbToCssString } from '$lib/services/color-utils.js';
  import type { EffectKeyframe, RGBColor, ColorMode } from '$lib/types/track.js';

  let {
    anchorRect,
    onclose,
  }: {
    anchorRect: { x: number; y: number; width: number; height: number };
    onclose: () => void;
  } = $props();

  let showPrimaryPicker = $state(false);
  let showSecondaryPicker = $state(false);
  let showFallbackPicker = $state(false);

  const selectedEffects = $derived(
    timelineStore.selectedEffectIds
      .map((id) => projectStore.file?.track.effectKeyframes.find((e) => e.id === id))
      .filter((e): e is EffectKeyframe => e !== undefined)
  );

  const single = $derived(selectedEffects.length === 1 ? selectedEffects[0] : null);
  const multi = $derived(selectedEffects.length > 1);

  function getMixed<K extends keyof EffectKeyframe>(key: K): EffectKeyframe[K] | null {
    if (selectedEffects.length === 0) return null;
    const first = selectedEffects[0][key];
    return selectedEffects.every((e) => JSON.stringify(e[key]) === JSON.stringify(first))
      ? first
      : null;
  }

  function applyPatch(patch: Partial<EffectKeyframe>): void {
    if (selectedEffects.length === 1) {
      undoStore.execute(new EditEffectCommand(selectedEffects[0].id, patch, projectStore));
    } else if (selectedEffects.length > 1) {
      const cmds = selectedEffects.map((e) => new EditEffectCommand(e.id, patch, projectStore));
      undoStore.execute(new CompositeCommand(`Edit ${cmds.length} effects`, cmds));
    }
  }

  function handleDelete(): void {
    const cmds = selectedEffects.map((e) => new DeleteEffectCommand(e.id, projectStore));
    if (cmds.length === 1) {
      undoStore.execute(cmds[0]);
    } else {
      undoStore.execute(new CompositeCommand(`Delete ${cmds.length} effects`, cmds));
    }
    timelineStore.clearSelection();
    onclose();
  }

  // Param slider helpers
  function getParamMin(key: string): number {
    if (key === 'randomness') return 0;
    if (key.includes('hz')) return 0.1;
    return 0;
  }

  function getParamMax(key: string): number {
    if (key === 'flash_count') return 20;
    if (key === 'randomness') return 1;
    if (key.includes('hz')) return 30;
    return 5000;
  }

  function getParamStep(key: string): number {
    if (key === 'flash_count') return 1;
    if (key === 'randomness') return 0.05;
    if (key.includes('hz')) return 0.1;
    return 50;
  }

  const CAPABILITY_OPTIONS: { value: string; label: string }[] = [
    { value: 'CAPABILITY_ANY', label: 'Any' },
    { value: 'CAPABILITY_RGB', label: 'RGB' },
    { value: 'CAPABILITY_FAST_TRANSITION', label: 'Fast Transition' },
    { value: 'CAPABILITY_FAST_RGB', label: 'Fast RGB' },
  ];
</script>

{#if selectedEffects.length > 0}
  <Popover {anchorRect} {onclose}>
    <div class="space-y-3 min-w-[16rem]">

      <!-- Effect type header -->
      <div class="flex items-center justify-between gap-2">
        {#if single}
          {@const info = getEffectDisplayInfo(single.effectType)}
          <div class="flex items-center gap-2">
            <span style="color: {info.color}" class="text-base">{info.icon}</span>
            <span class="text-sm font-medium text-text-base">{info.label}</span>
          </div>
        {:else}
          <span class="text-sm text-textMuted">{selectedEffects.length} effects selected</span>
        {/if}
        <Button variant="danger" size="sm" onclick={handleDelete}>
          Delete
        </Button>
      </div>

      <!-- Intensity -->
      <div>
        <label class="block text-xs text-textMuted mb-1">
          Intensity: {getMixed('intensity') ?? '—'}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={getMixed('intensity') ?? 80}
          oninput={(e) => applyPatch({ intensity: Number((e.target as HTMLInputElement).value) })}
          class="w-full h-1.5 rounded-full appearance-none bg-surface3 accent-accent cursor-pointer"
        />
      </div>

      <!-- Duration (single only) -->
      {#if single}
        <div>
          <label class="block text-xs text-textMuted mb-1">
            Duration: {single.durationMs}ms
          </label>
          <input
            type="range"
            min="50"
            max="10000"
            step="50"
            value={single.durationMs}
            oninput={(e) => applyPatch({ durationMs: Number((e.target as HTMLInputElement).value) })}
            class="w-full h-1.5 rounded-full appearance-none bg-surface3 accent-accent cursor-pointer"
          />
        </div>
      {/if}

      <!-- Primary color -->
      <div>
        <label class="block text-xs text-textMuted mb-1">Primary Color</label>
        <div class="flex items-center gap-2">
          <button
            class="w-8 h-8 rounded border border-surface3 cursor-pointer flex-shrink-0"
            style="background-color: {single ? rgbToCssString(single.primaryColor) : (getMixed('primaryColor') ? rgbToCssString(getMixed('primaryColor') as RGBColor) : '#888')}"
            onclick={() => { showPrimaryPicker = !showPrimaryPicker; showSecondaryPicker = false; showFallbackPicker = false; }}
            aria-label="Pick primary color"
          ></button>
          {#if !single && !getMixed('primaryColor')}
            <span class="text-xs text-textMuted italic">Mixed</span>
          {/if}
        </div>
        {#if showPrimaryPicker && single}
          <div class="mt-2">
            <ColorPicker
              color={single.primaryColor}
              colorMode="RGB"
              colorTemperature={6500}
              onchange={(c: RGBColor, _mode: ColorMode, _temp: number) => applyPatch({ primaryColor: c })}
            />
          </div>
        {/if}
      </div>

      <!-- Secondary color -->
      <div>
        <label class="block text-xs text-textMuted mb-1">Secondary Color</label>
        <div class="flex items-center gap-2">
          <button
            class="w-8 h-8 rounded border border-surface3 cursor-pointer flex-shrink-0"
            style="background-color: {single ? rgbToCssString(single.secondaryColor) : (getMixed('secondaryColor') ? rgbToCssString(getMixed('secondaryColor') as RGBColor) : '#888')}"
            onclick={() => { showSecondaryPicker = !showSecondaryPicker; showPrimaryPicker = false; showFallbackPicker = false; }}
            aria-label="Pick secondary color"
          ></button>
          {#if !single && !getMixed('secondaryColor')}
            <span class="text-xs text-textMuted italic">Mixed</span>
          {/if}
        </div>
        {#if showSecondaryPicker && single}
          <div class="mt-2">
            <ColorPicker
              color={single.secondaryColor}
              colorMode="RGB"
              colorTemperature={6500}
              onchange={(c: RGBColor, _mode: ColorMode, _temp: number) => applyPatch({ secondaryColor: c })}
            />
          </div>
        {/if}
      </div>

      <!-- Effect-specific params (single only) -->
      {#if single}
        {#each Object.entries(single.effectParams.params) as [key, value]}
          <div>
            <label class="block text-xs text-textMuted mb-1 capitalize">
              {key.replace(/_/g, ' ')}: {value}
            </label>
            <input
              type="range"
              min={getParamMin(key)}
              max={getParamMax(key)}
              step={getParamStep(key)}
              {value}
              oninput={(e) => {
                const newParams = { ...single!.effectParams.params, [key]: Number((e.target as HTMLInputElement).value) };
                applyPatch({ effectParams: { params: newParams } });
              }}
              class="w-full h-1.5 rounded-full appearance-none bg-surface3 accent-accent cursor-pointer"
            />
          </div>
        {/each}
      {/if}

      <!-- Required capability dropdown -->
      <div>
        <label class="block text-xs text-textMuted mb-1">Required Capability</label>
        <select
          class="w-full bg-surface2 text-text-base text-xs rounded-md px-2 py-1.5 border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50"
          value={getMixed('requiredCapability') ?? 'CAPABILITY_ANY'}
          onchange={(e) => applyPatch({ requiredCapability: (e.target as HTMLSelectElement).value as EffectKeyframe['requiredCapability'] })}
        >
          {#each CAPABILITY_OPTIONS as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
        {#if multi && !getMixed('requiredCapability')}
          <span class="text-xs text-textMuted italic">Mixed values</span>
        {/if}
      </div>

      <!-- Fallback color (single only) -->
      {#if single}
        <div>
          <label class="block text-xs text-textMuted mb-1">Fallback Color</label>
          <div class="flex items-center gap-2">
            <button
              class="w-8 h-8 rounded border border-surface3 cursor-pointer flex-shrink-0"
              style="background-color: {rgbToCssString(single.fallbackColor)}"
              onclick={() => { showFallbackPicker = !showFallbackPicker; showPrimaryPicker = false; showSecondaryPicker = false; }}
              aria-label="Pick fallback color"
            ></button>
          </div>
          {#if showFallbackPicker}
            <div class="mt-2">
              <ColorPicker
                color={single.fallbackColor}
                colorMode="RGB"
                colorTemperature={6500}
                onchange={(c: RGBColor, _mode: ColorMode, _temp: number) => applyPatch({ fallbackColor: c })}
              />
            </div>
          {/if}
        </div>

        <!-- Fallback brightness -->
        <div>
          <label class="block text-xs text-textMuted mb-1">
            Fallback Brightness: {single.fallbackBrightness}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={single.fallbackBrightness}
            oninput={(e) => applyPatch({ fallbackBrightness: Number((e.target as HTMLInputElement).value) })}
            class="w-full h-1.5 rounded-full appearance-none bg-surface3 accent-accent cursor-pointer"
          />
        </div>
      {/if}

    </div>
  </Popover>
{/if}
