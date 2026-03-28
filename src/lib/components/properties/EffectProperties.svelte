<script lang="ts">
  import type {
    EffectKeyframe,
    RGBColor,
    RequiredCapability,
    EffectType,
  } from '$lib/types/index.js';
  import type { EffectParamDef } from '$lib/types/effects.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { getEffectDefinition } from '$lib/effects/registry.js';
  import { TextInput, Select, Slider } from '$lib/components/shared/index.js';
  import { rgbToHex, hexToRgb, rgbToCssString } from '$lib/services/color-utils.js';

  let {
    effectKeyframeId,
  }: {
    effectKeyframeId: string;
  } = $props();

  const effect = $derived(
    projectStore.project.file.track.effectKeyframes.find(
      (e: EffectKeyframe) => e.id === effectKeyframeId
    )
  );

  const definition = $derived.by(() => {
    if (!effect) return null;
    try {
      return getEffectDefinition(effect.effectType);
    } catch {
      return null;
    }
  });

  // Applicable params for the current effect type
  const applicableParams = $derived(definition?.params ?? []);

  const primaryHex = $derived(effect ? rgbToHex(effect.primaryColor).toUpperCase() : '');
  const secondaryHex = $derived(effect ? rgbToHex(effect.secondaryColor).toUpperCase() : '');
  const fallbackHex = $derived(effect ? rgbToHex(effect.fallbackColor).toUpperCase() : '');

  function update(updates: Partial<EffectKeyframe>) {
    projectStore.updateEffectKeyframe(effectKeyframeId, updates);
  }

  // --- Intensity ---
  function handleIntensity(value: number) {
    update({ intensity: value });
  }

  // --- Duration ---
  function handleDuration(value: string) {
    const ms = parseInt(value, 10);
    if (!Number.isNaN(ms) && ms >= 100 && ms <= 30000) {
      update({ durationMs: ms });
    }
  }

  // --- Primary color ---
  function handlePrimaryR(value: number) {
    if (!effect) return;
    update({ primaryColor: { ...effect.primaryColor, r: Math.round(value) } });
  }
  function handlePrimaryG(value: number) {
    if (!effect) return;
    update({ primaryColor: { ...effect.primaryColor, g: Math.round(value) } });
  }
  function handlePrimaryB(value: number) {
    if (!effect) return;
    update({ primaryColor: { ...effect.primaryColor, b: Math.round(value) } });
  }
  function handlePrimaryHex(value: string) {
    const parsed = hexToRgb(value);
    if (parsed) update({ primaryColor: parsed });
  }

  // --- Secondary color ---
  function handleSecondaryR(value: number) {
    if (!effect) return;
    update({ secondaryColor: { ...effect.secondaryColor, r: Math.round(value) } });
  }
  function handleSecondaryG(value: number) {
    if (!effect) return;
    update({ secondaryColor: { ...effect.secondaryColor, g: Math.round(value) } });
  }
  function handleSecondaryB(value: number) {
    if (!effect) return;
    update({ secondaryColor: { ...effect.secondaryColor, b: Math.round(value) } });
  }
  function handleSecondaryHex(value: string) {
    const parsed = hexToRgb(value);
    if (parsed) update({ secondaryColor: parsed });
  }

  // --- Fallback color ---
  function handleFallbackR(value: number) {
    if (!effect) return;
    update({ fallbackColor: { ...effect.fallbackColor, r: Math.round(value) } });
  }
  function handleFallbackG(value: number) {
    if (!effect) return;
    update({ fallbackColor: { ...effect.fallbackColor, g: Math.round(value) } });
  }
  function handleFallbackB(value: number) {
    if (!effect) return;
    update({ fallbackColor: { ...effect.fallbackColor, b: Math.round(value) } });
  }
  function handleFallbackHex(value: string) {
    const parsed = hexToRgb(value);
    if (parsed) update({ fallbackColor: parsed });
  }

  // --- Fallback brightness ---
  function handleFallbackBrightness(value: number) {
    update({ fallbackBrightness: value });
  }

  // --- Effect params ---
  function handleEffectParam(key: string, value: number) {
    if (!effect) return;
    const newParams = { ...effect.effectParams.params, [key]: value };
    update({ effectParams: { params: newParams } });
  }

  // --- Required capability ---
  function handleCapability(value: string) {
    update({ requiredCapability: value as RequiredCapability });
  }

  const capabilityOptions: { value: string; label: string }[] = [
    { value: 'CAPABILITY_ANY', label: 'Any' },
    { value: 'CAPABILITY_RGB', label: 'RGB' },
    { value: 'CAPABILITY_FAST_TRANSITION', label: 'Fast Transition' },
    { value: 'CAPABILITY_FAST_RGB', label: 'Fast RGB' },
  ];

  // Collapsible sections
  let showColors = $state(true);
  let showFallback = $state(true);
  let showParams = $state(true);
</script>

{#if effect}
  <div class="flex flex-col gap-4">
    <!-- Effect type (read-only) -->
    <section class="flex items-center gap-2">
      {#if definition}
        <span class="text-lg" title={definition.name}>{definition.icon}</span>
      {/if}
      <div class="flex flex-col">
        <span class="text-sm font-medium text-text-base"
          >{definition?.name ?? effect.effectType}</span
        >
        {#if definition?.description}
          <span class="text-2xs text-textMuted">{definition.description}</span>
        {/if}
      </div>
    </section>

    <hr class="border-surface2" />

    <!-- Intensity & Duration -->
    <section class="flex flex-col gap-3">
      <Slider
        value={effect.intensity}
        min={0}
        max={100}
        step={1}
        label="Intensity"
        onchange={handleIntensity}
      />

      <TextInput
        value={String(effect.durationMs)}
        label="Duration (ms)"
        type="number"
        placeholder="2000"
        oninput={handleDuration}
      />
    </section>

    <hr class="border-surface2" />

    <!-- Colors -->
    <section class="flex flex-col gap-3">
      <button
        class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-textMuted"
        onclick={() => (showColors = !showColors)}
        aria-expanded={showColors}
      >
        Colors
        <svg
          class="h-3.5 w-3.5 transition-transform {showColors ? 'rotate-180' : ''}"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      {#if showColors}
        <!-- Primary -->
        <h5 class="text-xs text-textMuted">Primary Color</h5>
        <div class="flex items-center gap-3">
          <div
            class="h-8 w-8 shrink-0 rounded-md border border-surface3 shadow-sm"
            style="background-color: {rgbToCssString(effect.primaryColor)};"
          ></div>
          <TextInput value={primaryHex.slice(1)} placeholder="FF0000" oninput={handlePrimaryHex} />
        </div>
        <Slider
          value={effect.primaryColor.r}
          min={0}
          max={255}
          step={1}
          label="R"
          onchange={handlePrimaryR}
        />
        <Slider
          value={effect.primaryColor.g}
          min={0}
          max={255}
          step={1}
          label="G"
          onchange={handlePrimaryG}
        />
        <Slider
          value={effect.primaryColor.b}
          min={0}
          max={255}
          step={1}
          label="B"
          onchange={handlePrimaryB}
        />

        <!-- Secondary -->
        <h5 class="mt-2 text-xs text-textMuted">Secondary Color</h5>
        <div class="flex items-center gap-3">
          <div
            class="h-8 w-8 shrink-0 rounded-md border border-surface3 shadow-sm"
            style="background-color: {rgbToCssString(effect.secondaryColor)};"
          ></div>
          <TextInput
            value={secondaryHex.slice(1)}
            placeholder="0000FF"
            oninput={handleSecondaryHex}
          />
        </div>
        <Slider
          value={effect.secondaryColor.r}
          min={0}
          max={255}
          step={1}
          label="R"
          onchange={handleSecondaryR}
        />
        <Slider
          value={effect.secondaryColor.g}
          min={0}
          max={255}
          step={1}
          label="G"
          onchange={handleSecondaryG}
        />
        <Slider
          value={effect.secondaryColor.b}
          min={0}
          max={255}
          step={1}
          label="B"
          onchange={handleSecondaryB}
        />
      {/if}
    </section>

    <hr class="border-surface2" />

    <!-- Effect-specific params -->
    {#if applicableParams.length > 0}
      <section class="flex flex-col gap-3">
        <button
          class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-textMuted"
          onclick={() => (showParams = !showParams)}
          aria-expanded={showParams}
        >
          Effect Parameters
          <svg
            class="h-3.5 w-3.5 transition-transform {showParams ? 'rotate-180' : ''}"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clip-rule="evenodd"
            />
          </svg>
        </button>

        {#if showParams}
          {#each applicableParams as param (param.key)}
            <Slider
              value={effect.effectParams.params[param.key] ?? param.default}
              min={param.min}
              max={param.max}
              step={param.type === 'integer' ? 1 : 0.1}
              label={param.label}
              onchange={(v) => handleEffectParam(param.key, v)}
            />
          {/each}
        {/if}
      </section>

      <hr class="border-surface2" />
    {/if}

    <!-- Required Capability -->
    <section class="flex flex-col gap-3">
      <Select
        value={effect.requiredCapability}
        options={capabilityOptions}
        label="Required Capability"
        onchange={handleCapability}
      />
    </section>

    <hr class="border-surface2" />

    <!-- Fallback -->
    <section class="flex flex-col gap-3">
      <button
        class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-textMuted"
        onclick={() => (showFallback = !showFallback)}
        aria-expanded={showFallback}
      >
        Fallback
        <svg
          class="h-3.5 w-3.5 transition-transform {showFallback ? 'rotate-180' : ''}"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      {#if showFallback}
        <h5 class="text-xs text-textMuted">Fallback Color</h5>
        <div class="flex items-center gap-3">
          <div
            class="h-8 w-8 shrink-0 rounded-md border border-surface3 shadow-sm"
            style="background-color: {rgbToCssString(effect.fallbackColor)};"
          ></div>
          <TextInput
            value={fallbackHex.slice(1)}
            placeholder="FFFFFF"
            oninput={handleFallbackHex}
          />
        </div>
        <Slider
          value={effect.fallbackColor.r}
          min={0}
          max={255}
          step={1}
          label="R"
          onchange={handleFallbackR}
        />
        <Slider
          value={effect.fallbackColor.g}
          min={0}
          max={255}
          step={1}
          label="G"
          onchange={handleFallbackG}
        />
        <Slider
          value={effect.fallbackColor.b}
          min={0}
          max={255}
          step={1}
          label="B"
          onchange={handleFallbackB}
        />

        <Slider
          value={effect.fallbackBrightness}
          min={0}
          max={100}
          step={1}
          label="Fallback Brightness"
          onchange={handleFallbackBrightness}
        />
      {/if}
    </section>
  </div>
{:else}
  <p class="text-sm text-textMuted">Effect keyframe not found.</p>
{/if}
