<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { interpolateAtTime } from '$lib/services/interpolation.js';
  import { rgbToHex, kelvinToRgb } from '$lib/services/color-utils.js';
  import { ContextMenu } from '$lib/components/shared/index.js';
  import type { Channel, RGBColor, SpatialHint } from '$lib/types/index.js';
  import type { ContextMenu as ContextMenuType, ContextMenuItem } from '$lib/types/ui.js';

  let { videoEl }: { videoEl: HTMLVideoElement } = $props();

  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let contextMenu: ContextMenuType | null = $state(null);

  const currentTimeMs = $derived(videoStore.state.currentTimeMs);
  const frameDurationMs = $derived(videoStore.state.frameDurationMs);
  const channels = $derived(projectStore.channels);
  const keyframes = $derived(projectStore.keyframes);

  const spatialChannels = $derived(
    channels.filter((ch) => ch.spatialHint !== 'SPATIAL_UNSPECIFIED')
  );

  // Track video element size
  $effect(() => {
    if (!videoEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth = Math.round(entry.contentRect.width);
        containerHeight = Math.round(entry.contentRect.height);
      }
    });
    observer.observe(videoEl);
    return () => observer.disconnect();
  });

  function getIconPosition(hint: SpatialHint): { x: number; y: number } {
    const w = containerWidth;
    const h = containerHeight;
    switch (hint) {
      case 'SPATIAL_LEFT': return { x: w * 0.08, y: h * 0.08 };
      case 'SPATIAL_CENTER': return { x: w * 0.5, y: h * 0.04 };
      case 'SPATIAL_RIGHT': return { x: w * 0.92, y: h * 0.08 };
      case 'SPATIAL_SURROUND_LEFT': return { x: w * 0.08, y: h * 0.92 };
      case 'SPATIAL_SURROUND_RIGHT': return { x: w * 0.92, y: h * 0.92 };
      case 'SPATIAL_AMBIENT': return { x: w * 0.5, y: h * 0.5 };
      case 'SPATIAL_CEILING': return { x: w * 0.5, y: h * 0.04 };
      case 'SPATIAL_FLOOR': return { x: w * 0.5, y: h * 0.96 };
      case 'SPATIAL_BEHIND_SCREEN': return { x: w * 0.5, y: h * 0.08 };
      default: return { x: w * 0.5, y: h * 0.5 };
    }
  }

  function getChannelDisplayColor(channel: Channel): string {
    const state = interpolateAtTime(channel.id, currentTimeMs, keyframes);
    if (!state || !state.powerOn) return '#333333';
    let color: RGBColor;
    if (state.colorMode === 'COLOR_TEMPERATURE') {
      color = kelvinToRgb(2700);
    } else {
      color = state.color;
    }
    const brightness = state.brightness / 100;
    return `rgb(${Math.round(color.r * brightness)}, ${Math.round(color.g * brightness)}, ${Math.round(color.b * brightness)})`;
  }

  function handleIconClick(e: MouseEvent, channel: Channel) {
    e.preventDefault();
    e.stopPropagation();

    // Check if a keyframe exists near the playhead for this channel
    const nearbyKeyframe = keyframes.find(
      (kf) =>
        kf.channelId === channel.id &&
        Math.abs(kf.timestampMs - currentTimeMs) <= frameDurationMs
    );

    const items: ContextMenuItem[] = [
      {
        id: 'add-keyframe',
        label: 'Add Keyframe at Current Time',
        enabled: true,
        icon: '◆',
        action: () => {
          const kf = projectStore.addKeyframe(channel.id, currentTimeMs);
          // STU-030a: auto-select the newly created keyframe
          timelineStore.selectKeyframe(kf.id);
          uiStore.setPropertiesContext({ type: 'keyframe', keyframeIds: [kf.id] });
        },
      },
      {
        id: 'edit-keyframe',
        label: 'Edit Keyframe',
        enabled: !!nearbyKeyframe,
        icon: '✏',
        action: () => {
          if (nearbyKeyframe) {
            timelineStore.selectKeyframe(nearbyKeyframe.id);
            uiStore.setPropertiesContext({ type: 'keyframe', keyframeIds: [nearbyKeyframe.id] });
          }
        },
      },
    ];

    contextMenu = { x: e.clientX, y: e.clientY, items };
  }

  function closeContextMenu() {
    contextMenu = null;
  }
</script>

<!-- Light icon container, positioned over the video -->
<div
  class="pointer-events-none absolute"
  style="width: {containerWidth}px; height: {containerHeight}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"
  aria-hidden="true"
>
  {#each spatialChannels as channel (channel.id)}
    {@const pos = getIconPosition(channel.spatialHint)}
    {@const displayColor = getChannelDisplayColor(channel)}
    <button
      class="pointer-events-auto absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 shadow-md transition-transform hover:scale-125"
      style="left: {pos.x}px; top: {pos.y}px; background: {displayColor};"
      title="{channel.displayName} ({channel.spatialHint.replace('SPATIAL_', '').toLowerCase()})"
      onclick={(e) => handleIconClick(e, channel)}
    >
      <span class="text-[8px] text-white/80 drop-shadow">💡</span>
    </button>
  {/each}
</div>

<ContextMenu menu={contextMenu} onclose={closeContextMenu} />
