<script lang="ts">
  import { EFFECT_PRESETS, renderEffect, sampleEffectAt, type EffectType } from '$lib/domain';
  import type { StudioSession } from '$lib/studio/session.svelte';

  let { session } = $props<{ session: StudioSession }>();

  function colors(type: EffectType): string[] {
    const preset = EFFECT_PRESETS.find((item) => item.type === type)!;
    const commands = renderEffect({
      effectType: type,
      durationMs: Math.min(preset.defaultDurationMs, 2000),
      intensity: preset.defaultIntensity,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      params: preset.params,
      requiredCapability: preset.requiredCapability,
      fallbackColor: preset.fallbackColor,
      fallbackBrightness: preset.fallbackBrightness,
    });
    const span = Math.max(1, commands.at(-1)?.offsetMs ?? preset.defaultDurationMs);
    return [0, 0.35, 0.7].map((fraction) => {
      const sample = sampleEffectAt(commands, fraction * span);
      return sample ? `rgb(${sample.r}, ${sample.g}, ${sample.b})` : 'transparent';
    });
  }
</script>

<div class="effect-strip" role="group" aria-label="Effects">
  {#each EFFECT_PRESETS as preset (preset.type)}
    {@const swatch = colors(preset.type)}
    <button
      type="button"
      class="effect-chip"
      draggable="true"
      title={`Add ${preset.name} at the playhead. Drag onto a lane to place it. Shift-click adds it on every channel.`}
      aria-label={`Add ${preset.name} effect`}
      onclick={(event) => session.addEffect(preset.type, { allChannels: event.shiftKey })}
      ondragstart={(event) => {
        event.dataTransfer?.setData('application/x-openlightfx-effect', preset.type);
        event.dataTransfer?.setData('text/plain', preset.name);
      }}
    >
      <span class="preview" aria-hidden="true">
        {#each swatch as color, index (index)}
          <i style={`background:${color}`}></i>
        {/each}
      </span>
      <span>{preset.name}</span>
    </button>
  {/each}
</div>

<style>
  .effect-strip {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .effect-chip {
    display: grid;
    gap: 4px;
    flex: 0 0 auto;
    min-width: 72px;
    padding: 4px 6px;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 11px;
    text-align: left;
  }
  .effect-chip:hover {
    border-color: var(--accent);
  }
  .preview {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    height: 8px;
    overflow: hidden;
    border-radius: 99px;
  }
  .preview i {
    display: block;
  }
</style>
