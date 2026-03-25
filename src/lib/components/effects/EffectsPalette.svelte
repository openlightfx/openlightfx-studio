<script lang="ts">
  import type { EffectType } from '$lib/types/track.js';
  import type { EffectDefinition } from '$lib/types/effects.js';
  import { getAllEffectTypes, getEffectDefinition } from '$lib/effects/index.js';
  import EffectPreview from './EffectPreview.svelte';

  const effectTypes: EffectType[] = getAllEffectTypes();

  let activePopover: EffectType | null = $state(null);

  function handleDragStart(e: DragEvent, effectType: EffectType) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('application/x-openlightfx-effect', effectType);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function togglePopover(effectType: EffectType) {
    activePopover = activePopover === effectType ? null : effectType;
  }

  function handleKeydown(e: KeyboardEvent, effectType: EffectType) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePopover(effectType);
    }
  }
</script>

<div class="flex flex-col h-full bg-surface">
  <div class="panel-header">
    <span>Effects</span>
    <span class="text-2xs text-textMuted">{effectTypes.length}</span>
  </div>

  <div class="grid grid-cols-2 gap-1.5 p-2 overflow-y-auto flex-1">
    {#each effectTypes as effectType (effectType)}
      {@const def = getEffectDefinition(effectType)}
      <div class="relative">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex flex-col items-center gap-1 rounded-md border border-surface2 bg-surface2/50 p-2
                 cursor-grab select-none transition-colors hover:border-accent/50 hover:bg-surface3
                 active:cursor-grabbing"
          draggable="true"
          role="button"
          tabindex="0"
          ondragstart={(e) => handleDragStart(e, effectType)}
          onclick={() => togglePopover(effectType)}
          onkeydown={(e) => handleKeydown(e, effectType)}
        >
          <div class="flex items-center gap-1.5 w-full">
            <span class="text-base leading-none" aria-hidden="true">{def.icon}</span>
            <span class="text-2xs font-medium text-text-base truncate flex-1">{def.name}</span>
          </div>
          <EffectPreview {effectType} width={80} height={20} />
        </div>

        {#if activePopover === effectType}
          <div
            class="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-surface2 bg-surface p-3 shadow-lg animate-fade-in"
            role="tooltip"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-lg">{def.icon}</span>
              <span class="text-sm font-medium text-text-base">{def.name}</span>
            </div>
            <p class="text-2xs text-textMuted mb-2">{def.description}</p>
            <div class="space-y-1 text-2xs text-textMuted">
              <div class="flex justify-between">
                <span>Duration</span>
                <span class="text-text-base">{def.defaultDurationMs}ms</span>
              </div>
              <div class="flex justify-between">
                <span>Intensity</span>
                <span class="text-text-base">{def.defaultIntensity}%</span>
              </div>
              {#each def.params as param}
                <div class="flex justify-between">
                  <span>{param.label}</span>
                  <span class="text-text-base">{param.default}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
