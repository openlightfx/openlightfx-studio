<script lang="ts">
  import { EFFECT_TYPES, getEffectDisplayInfo, getDefaultEffectParams } from '$lib/services/effect-defaults.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { AddEffectCommand } from '$lib/commands/add-effect.js';
  import { generateId } from '$lib/services/id.js';
  import type { EffectType } from '$lib/types/track.js';

  let { onclose }: { onclose?: () => void } = $props();

  function addEffect(effectType: EffectType): void {
    if (!projectStore.file) return;
    const channelId = timelineStore.activeChannelId ?? projectStore.file.track.channels[0]?.id;
    if (!channelId) return;

    const info = getEffectDisplayInfo(effectType);
    const params = getDefaultEffectParams(effectType);

    const effect = {
      id: generateId(),
      channelId,
      timestampMs: videoStore.currentTimeMs,
      durationMs: info.defaultDurationMs,
      effectType,
      intensity: 80,
      primaryColor: { r: 255, g: 255, b: 255 },
      secondaryColor: { r: 0, g: 0, b: 0 },
      effectParams: { params },
      requiredCapability: 'CAPABILITY_ANY' as const,
      fallbackColor: { r: 128, g: 128, b: 128 },
      fallbackBrightness: 50,
    };

    undoStore.execute(new AddEffectCommand(effect, projectStore));
    timelineStore.clearSelection();
    timelineStore.selectedEffectIds = [effect.id];
    onclose?.();
  }
</script>

<div class="grid grid-cols-2 gap-2 p-3 max-h-[60vh] overflow-y-auto">
  {#each EFFECT_TYPES as effectType}
    {@const info = getEffectDisplayInfo(effectType)}
    <button
      class="flex items-start gap-2 p-3 rounded-lg bg-surface2 hover:bg-surface3 border border-surface3 transition-colors text-left"
      onclick={() => addEffect(effectType)}
    >
      <span class="text-lg shrink-0" style="color: {info.color}">{info.icon}</span>
      <div class="min-w-0">
        <p class="text-sm font-medium text-text-base">{info.label}</p>
        <p class="text-xs text-textMuted mt-0.5 line-clamp-2">{info.description}</p>
      </div>
    </button>
  {/each}
</div>
