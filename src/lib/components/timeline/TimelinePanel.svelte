<script lang="ts">
  import type { TimelineHitResult, SelectionRect } from '$lib/types/index.js';
  import type { ContextMenu, ContextMenuItem } from '$lib/types/ui.js';
  import type { EffectType } from '$lib/types/index.js';
  import TimelineCanvas from './TimelineCanvas.svelte';
  import TimelineInteraction from './TimelineInteraction.svelte';
  import Minimap from './Minimap.svelte';
  import ContextMenuComponent from '$lib/components/shared/ContextMenu.svelte';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { EFFECT_DEFINITIONS } from '$lib/effects/definitions.js';

  let contextMenu: ContextMenu | null = $state(null);
  let lastHit: TimelineHitResult | null = $state(null);
  let selectionRect: SelectionRect | null = $state(null);
  let canvasRef: TimelineCanvas | undefined = $state();

  // Keep cursor in view during playback
  $effect(() => {
    const currentTimeMs = videoStore.state.currentTimeMs;
    if (videoStore.state.isPlaying) {
      timelineStore.ensureVisible(currentTimeMs);
    }
  });

  // ---- CLIPBOARD ----
  let clipboard: {
    type: 'keyframes' | 'effect';
    data: unknown;
    sourceChannelId: string;
    baseTimestampMs: number;
  } | null = $state(null);

  function hasTarget(): boolean {
    return !!(lastHit && (lastHit.type === 'keyframe' || lastHit.type === 'effect' || lastHit.type === 'scene-marker'));
  }

  function hasSelection(): boolean {
    const sel = timelineStore.selection;
    return sel.keyframeIds.length > 0 || sel.effectKeyframeIds.length > 0 || sel.sceneMarkerIds.length > 0;
  }

  // ---- CONTEXT MENU BUILDER ----
  function buildContextMenuItems(hit: TimelineHitResult): ContextMenuItem[] {
    const isTarget = hit.type === 'keyframe' || hit.type === 'effect' || hit.type === 'scene-marker';
    const hasSel = hasSelection() || isTarget;
    const channelId = hit.channelId;

    // Effect submenu
    const effectSubmenu: ContextMenuItem[] = EFFECT_DEFINITIONS.map((def) => ({
      id: `add-effect-${def.type}`,
      label: `${def.icon} ${def.name}`,
      enabled: !!channelId,
      action: () => {
        if (!channelId) return;
        projectStore.addEffectKeyframe({
          channelId,
          timestampMs: hit.timestampMs,
          durationMs: def.defaultDurationMs,
          effectType: def.type as EffectType,
          intensity: def.defaultIntensity,
          primaryColor: { ...def.defaultPrimaryColor },
          secondaryColor: { ...def.defaultSecondaryColor },
          effectParams: { params: {} },
          requiredCapability: def.requiredCapability,
          fallbackColor: { ...def.defaultFallbackColor },
          fallbackBrightness: def.defaultFallbackBrightness,
        });
      },
    }));

    const items: ContextMenuItem[] = [
      {
        id: 'add-keyframe',
        label: 'Add Keyframe Here',
        enabled: !!channelId,
        icon: '◆',
        shortcut: 'K',
        action: () => {
          if (channelId) {
            projectStore.addKeyframe(channelId, hit.timestampMs);
          }
        },
      },
      {
        id: 'add-effect',
        label: 'Add Effect Here',
        enabled: !!channelId,
        icon: '⚡',
        submenu: effectSubmenu,
      },
      {
        id: 'add-scene-marker',
        label: 'Add Scene Marker Here',
        enabled: true,
        icon: '🏷',
        action: () => {
          projectStore.addSceneMarker(hit.timestampMs, `Scene ${projectStore.sceneMarkers.length + 1}`);
        },
      },
      { id: 'sep-1', label: '', enabled: false, separator: true },
      {
        id: 'edit-properties',
        label: 'Edit Properties',
        enabled: isTarget,
        icon: '✏️',
        action: () => {
          if (hit.type === 'keyframe' && hit.keyframeId) {
            uiStore.setPropertiesContext({ type: 'keyframe', keyframeIds: [hit.keyframeId] });
          } else if (hit.type === 'effect' && hit.effectKeyframeId) {
            uiStore.setPropertiesContext({ type: 'effect', effectKeyframeId: hit.effectKeyframeId });
          } else if (hit.type === 'scene-marker' && hit.sceneMarkerId) {
            uiStore.setPropertiesContext({ type: 'scene-marker', sceneMarkerId: hit.sceneMarkerId });
          }
        },
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        enabled: isTarget,
        icon: '📋',
        shortcut: 'Ctrl+D',
        action: () => {
          duplicateSelection(hit);
        },
      },
      {
        id: 'copy-to-all-channels',
        label: 'Copy to All Other Channels',
        enabled: hit.type === 'keyframe' && projectStore.channels.length > 1,
        icon: '⊞',
        action: () => {
          if (hit.type !== 'keyframe' || !hit.keyframeId) return;
          const count = projectStore.copyKeyframeToAllChannels(hit.keyframeId);
          if (count > 0) {
            toastStore.success(`Copied keyframe to ${count} channel${count !== 1 ? 's' : ''}`);
          }
        },
      },
      { id: 'sep-2', label: '', enabled: false, separator: true },
      {
        id: 'cut',
        label: 'Cut',
        enabled: hasSel,
        shortcut: 'Ctrl+X',
        action: () => {
          copySelection(hit);
          deleteSelection(hit);
        },
      },
      {
        id: 'copy',
        label: 'Copy',
        enabled: hasSel,
        shortcut: 'Ctrl+C',
        action: () => {
          copySelection(hit);
        },
      },
      {
        id: 'paste',
        label: 'Paste',
        enabled: !!clipboard,
        shortcut: 'Ctrl+V',
        action: () => {
          pasteClipboard(hit);
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        enabled: hasSel,
        shortcut: 'Del',
        action: () => {
          deleteSelection(hit);
        },
      },
      { id: 'sep-3', label: '', enabled: false, separator: true },
      {
        id: 'select-all-channel',
        label: 'Select All in Channel',
        enabled: !!channelId,
        action: () => {
          if (!channelId) return;
          const kfIds = projectStore.keyframes
            .filter((kf) => kf.channelId === channelId)
            .map((kf) => kf.id);
          timelineStore.selectAllInChannel(channelId, kfIds);
        },
      },
      { id: 'sep-4', label: '', enabled: false, separator: true },
      {
        id: 'flatten-to-keyframes',
        label: 'Flatten to Keyframes',
        enabled: hit.type === 'effect' && !!hit.effectKeyframeId,
        icon: '📐',
        action: () => {
          if (hit.type === 'effect' && hit.effectKeyframeId) {
            flattenEffect(hit.effectKeyframeId);
          }
        },
      },
      { id: 'sep-5', label: '', enabled: false, separator: true },
      {
        id: 'channel-properties',
        label: 'Channel Properties',
        enabled: !!channelId,
        icon: '⚙️',
        action: () => {
          if (channelId) {
            uiStore.setPropertiesContext({ type: 'channel', channelId });
          }
        },
      },
    ];

    return items;
  }

  // ---- CLIPBOARD OPERATIONS ----
  function copySelection(hit: TimelineHitResult): void {
    const sel = timelineStore.selection;
    if (sel.keyframeIds.length > 0) {
      const kfs = sel.keyframeIds
        .map((id) => projectStore.getKeyframe(id))
        .filter((kf): kf is NonNullable<typeof kf> => !!kf);
      if (kfs.length === 0) return;
      const baseTs = Math.min(...kfs.map((kf) => kf.timestampMs));
      clipboard = {
        type: 'keyframes',
        data: kfs.map((kf) => ({ ...kf })),
        sourceChannelId: kfs[0].channelId,
        baseTimestampMs: baseTs,
      };
    } else if (hit.type === 'keyframe' && hit.keyframeId) {
      const kf = projectStore.getKeyframe(hit.keyframeId);
      if (kf) {
        clipboard = {
          type: 'keyframes',
          data: [{ ...kf }],
          sourceChannelId: kf.channelId,
          baseTimestampMs: kf.timestampMs,
        };
      }
    }
  }

  function pasteClipboard(hit: TimelineHitResult): void {
    if (!clipboard) return;
    const targetChannelId = hit.channelId || clipboard.sourceChannelId;
    const pasteTimestampMs = hit.timestampMs;

    if (clipboard.type === 'keyframes') {
      const kfs = clipboard.data as Array<{
        channelId: string;
        timestampMs: number;
        colorMode: string;
        color: { r: number; g: number; b: number };
        colorTemperature: number;
        brightness: number;
        transitionMs: number;
        interpolation: string;
        powerOn: boolean;
      }>;
      for (const kf of kfs) {
        const offset = kf.timestampMs - clipboard.baseTimestampMs;
        projectStore.addKeyframe(targetChannelId, pasteTimestampMs + offset, {
          colorMode: kf.colorMode as 'RGB' | 'COLOR_TEMPERATURE',
          color: { ...kf.color },
          colorTemperature: kf.colorTemperature,
          brightness: kf.brightness,
          transitionMs: kf.transitionMs,
          interpolation: kf.interpolation as 'STEP' | 'LINEAR',
          powerOn: kf.powerOn,
        });
      }
    }
  }

  function deleteSelection(hit: TimelineHitResult): void {
    const sel = timelineStore.selection;

    // Delete selected keyframes (STU-029l: multi-select delete)
    if (sel.keyframeIds.length > 0) {
      for (const id of [...sel.keyframeIds]) {
        projectStore.removeKeyframe(id);
      }
    } else if (hit.type === 'keyframe' && hit.keyframeId) {
      projectStore.removeKeyframe(hit.keyframeId);
    }

    // Delete selected effects
    if (sel.effectKeyframeIds.length > 0) {
      for (const id of [...sel.effectKeyframeIds]) {
        projectStore.removeEffectKeyframe(id);
      }
    } else if (hit.type === 'effect' && hit.effectKeyframeId) {
      projectStore.removeEffectKeyframe(hit.effectKeyframeId);
    }

    // Delete selected scene markers
    if (sel.sceneMarkerIds.length > 0) {
      for (const id of [...sel.sceneMarkerIds]) {
        projectStore.removeSceneMarker(id);
      }
    } else if (hit.type === 'scene-marker' && hit.sceneMarkerId) {
      projectStore.removeSceneMarker(hit.sceneMarkerId);
    }

    timelineStore.clearSelection();
  }

  function duplicateSelection(hit: TimelineHitResult): void {
    const OFFSET_MS = 500;

    if (hit.type === 'keyframe' && hit.keyframeId) {
      const kf = projectStore.getKeyframe(hit.keyframeId);
      if (kf) {
        projectStore.addKeyframe(kf.channelId, kf.timestampMs + OFFSET_MS, {
          colorMode: kf.colorMode,
          color: { ...kf.color },
          colorTemperature: kf.colorTemperature,
          brightness: kf.brightness,
          transitionMs: kf.transitionMs,
          interpolation: kf.interpolation,
          powerOn: kf.powerOn,
        });
      }
    } else if (hit.type === 'effect' && hit.effectKeyframeId) {
      const ef = projectStore.getEffectKeyframe(hit.effectKeyframeId);
      if (ef) {
        const { id, ...rest } = ef;
        projectStore.addEffectKeyframe({
          ...rest,
          timestampMs: ef.timestampMs + ef.durationMs + OFFSET_MS,
        });
      }
    } else if (hit.type === 'scene-marker' && hit.sceneMarkerId) {
      const marker = projectStore.getSceneMarker(hit.sceneMarkerId);
      if (marker) {
        projectStore.addSceneMarker(marker.timestampMs + OFFSET_MS, `${marker.label} (copy)`);
      }
    }
  }

  function flattenEffect(effectKeyframeId: string): void {
    const ef = projectStore.getEffectKeyframe(effectKeyframeId);
    if (!ef) return;

    // Generate keyframes from effect at regular intervals
    const intervalMs = uiStore.state.minKeyframeIntervalMs;
    const steps = Math.max(1, Math.floor(ef.durationMs / intervalMs));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ts = ef.timestampMs + t * ef.durationMs;
      const brightness = Math.round(ef.intensity * (1 - Math.abs(2 * t - 1)));
      projectStore.addKeyframe(ef.channelId, ts, {
        color: { ...ef.primaryColor },
        brightness: Math.max(0, Math.min(100, brightness)),
        powerOn: true,
      });
    }
    projectStore.removeEffectKeyframe(effectKeyframeId);
  }

  // ---- EVENT HANDLERS ----
  function handleContextMenu(e: MouseEvent, hit: TimelineHitResult): void {
    lastHit = hit;
    contextMenu = {
      x: e.clientX,
      y: e.clientY,
      items: buildContextMenuItems(hit),
    };
  }

  function handleSelectionRect(rect: SelectionRect | null): void {
    selectionRect = rect;
  }

  function handleDoubleClickKeyframe(keyframeId: string): void {
    uiStore.setPropertiesContext({ type: 'keyframe', keyframeIds: [keyframeId] });
  }

  function closeContextMenu(): void {
    contextMenu = null;
    lastHit = null;
  }
</script>

<div class="flex flex-col h-full select-none">
  <!-- Main timeline area -->
  <div class="relative flex-1 min-h-0">
    <TimelineCanvas bind:this={canvasRef} {selectionRect} />
    <TimelineInteraction
      oncontextmenu={handleContextMenu}
      onselectionrect={handleSelectionRect}
      ondoubleclickkeyframe={handleDoubleClickKeyframe}
    />
  </div>

  <!-- Minimap -->
  <div class="border-t border-surface2 shrink-0">
    <Minimap />
  </div>

  <!-- Context menu -->
  <ContextMenuComponent menu={contextMenu} onclose={closeContextMenu} />
</div>
