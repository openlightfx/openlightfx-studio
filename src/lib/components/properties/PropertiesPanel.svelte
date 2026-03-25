<script lang="ts">
  import type { PropertiesContext } from '$lib/types/index.js';
  import type { Channel, EffectKeyframe } from '$lib/types/index.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { getEffectDefinition } from '$lib/effects/registry.js';
  import TrackProperties from './TrackProperties.svelte';
  import ChannelProperties from './ChannelProperties.svelte';
  import KeyframeProperties from './KeyframeProperties.svelte';
  import EffectProperties from './EffectProperties.svelte';
  import SceneMarkerProperties from './SceneMarkerProperties.svelte';

  const context = $derived(uiStore.state.propertiesContext);

  const panelTitle = $derived.by(() => {
    switch (context.type) {
      case 'track':
        return 'Track Properties';
      case 'channel': {
        const ch = projectStore.project.file.track.channels.find(
          (c: Channel) => c.id === context.channelId
        );
        return ch ? `Channel: ${ch.displayName || ch.id}` : 'Channel';
      }
      case 'keyframe':
        return context.keyframeIds.length > 1
          ? `Keyframes (${context.keyframeIds.length})`
          : 'Keyframe';
      case 'effect': {
        const ek = projectStore.project.file.track.effectKeyframes.find(
          (e: EffectKeyframe) => e.id === context.effectKeyframeId
        );
        if (ek) {
          try {
            const def = getEffectDefinition(ek.effectType);
            return `Effect: ${def.name}`;
          } catch {
            return 'Effect';
          }
        }
        return 'Effect';
      }
      case 'scene-marker':
        return 'Scene Marker';
      default:
        return 'Properties';
    }
  });
</script>

<aside
  class="flex h-full w-full flex-col border-l border-surface2 bg-surface"
  aria-label="Properties panel"
>
  <!-- Panel Header -->
  <div class="flex h-9 shrink-0 items-center border-b border-surface2 px-3">
    <h3 class="truncate text-xs font-semibold uppercase tracking-wider text-textMuted">
      {panelTitle}
    </h3>
  </div>

  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto p-3">
    {#if context.type === 'track'}
      <TrackProperties />
    {:else if context.type === 'channel'}
      <ChannelProperties channelId={context.channelId} />
    {:else if context.type === 'keyframe'}
      <KeyframeProperties keyframeIds={context.keyframeIds} />
    {:else if context.type === 'effect'}
      <EffectProperties effectKeyframeId={context.effectKeyframeId} />
    {:else if context.type === 'scene-marker'}
      <SceneMarkerProperties sceneMarkerId={context.sceneMarkerId} />
    {/if}
  </div>
</aside>
