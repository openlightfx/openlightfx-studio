<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { EffectType, EffectKeyframe, Keyframe, RGBColor, Channel } from '$lib/types/track.js';
  import type { SpreadPattern } from '$lib/types/effects.js';
  import {
    getEffectDefinition,
    getEffectSpreadPattern,
    matchChannelTemplate,
  } from '$lib/effects/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import {
    DEFAULT_RGB_COLOR,
    DEFAULT_BRIGHTNESS,
    DEFAULT_COLOR_MODE,
    DEFAULT_INTERPOLATION,
  } from '$lib/types/track.js';

  let {
    children,
  }: {
    children: Snippet;
  } = $props();

  const DRAG_MIME = 'application/x-openlightfx-effect';

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  /**
   * Compute the drop timestamp from the mouse position.
   * The timeline component can provide data attributes for mapping.
   * Falls back to the current playhead position.
   */
  function getDropTimestampMs(e: DragEvent): number {
    // Look for a data attribute on the drop target or its ancestors
    const target = e.target as HTMLElement | null;
    const timelineEl = target?.closest('[data-timeline-start-ms][data-timeline-px-per-ms]');
    if (timelineEl) {
      const startMs = parseFloat(timelineEl.getAttribute('data-timeline-start-ms') ?? '0');
      const pxPerMs = parseFloat(timelineEl.getAttribute('data-timeline-px-per-ms') ?? '0');
      if (pxPerMs > 0) {
        const rect = timelineEl.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        return Math.max(0, Math.round(startMs + offsetX / pxPerMs));
      }
    }
    return videoStore.state.currentTimeMs;
  }

  /**
   * Resolve the prior state for a channel at a given timestamp.
   * Used to insert a restore keyframe after the effect concludes (STU-059h1).
   */
  function getPriorState(
    channelId: string,
    timestampMs: number
  ): Pick<Keyframe, 'color' | 'colorMode' | 'colorTemperature' | 'brightness' | 'powerOn'> {
    const kfs = projectStore
      .keyframesByChannel(channelId)
      .filter((kf) => kf.timestampMs <= timestampMs)
      .sort((a, b) => b.timestampMs - a.timestampMs);

    if (kfs.length > 0) {
      const prev = kfs[0];
      return {
        color: { ...prev.color },
        colorMode: prev.colorMode,
        colorTemperature: prev.colorTemperature,
        brightness: prev.brightness,
        powerOn: prev.powerOn,
      };
    }

    // Fall back to channel defaults if available, otherwise power off (STU-059h1)
    const channel = projectStore.getChannel(channelId);
    if (channel) {
      return {
        color: { ...channel.defaultColor },
        colorMode: DEFAULT_COLOR_MODE,
        colorTemperature: 2700,
        brightness: channel.defaultBrightness,
        powerOn: channel.defaultBrightness > 0,
      };
    }

    return {
      color: { ...DEFAULT_RGB_COLOR },
      colorMode: DEFAULT_COLOR_MODE,
      colorTemperature: 2700,
      brightness: 0,
      powerOn: false,
    };
  }

  function handleDrop(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DRAG_MIME)) return;
    e.preventDefault();

    const effectType = e.dataTransfer.getData(DRAG_MIME) as EffectType;
    if (!effectType || effectType === 'EFFECT_UNSPECIFIED') return;

    const def = getEffectDefinition(effectType);
    const dropTimestampMs = getDropTimestampMs(e);
    const trackChannels = projectStore.channels;

    if (trackChannels.length === 0) {
      toastStore.warning('No channels in the track. Add channels before placing effects.');
      return;
    }

    // Detect channel template and get spread pattern
    const channelIds = trackChannels.map((ch) => ch.id);
    const templateName = matchChannelTemplate(channelIds);

    let pattern: SpreadPattern | null = null;
    if (templateName) {
      pattern = getEffectSpreadPattern(effectType, templateName);
    }

    // Collect all channel IDs from the spread pattern
    const spreadChannelIds: Set<string> = new Set();
    if (pattern) {
      for (const stage of pattern.stages) {
        for (const id of stage.channelIds) {
          spreadChannelIds.add(id);
        }
      }
    }

    // Determine which channels exist and which are missing
    const existingChannelIds = new Set(channelIds);
    const skippedChannels: string[] = [];

    if (pattern) {
      for (const id of spreadChannelIds) {
        if (!existingChannelIds.has(id)) {
          skippedChannels.push(id);
        }
      }
    }

    // Build the effect keyframes per stage with timing offsets
    let cumulativeDelayMs = 0;

    if (pattern) {
      for (const stage of pattern.stages) {
        cumulativeDelayMs += stage.delayMs;

        for (const channelId of stage.channelIds) {
          if (!existingChannelIds.has(channelId)) continue;

          const effectKf: Omit<EffectKeyframe, 'id'> = {
            channelId,
            timestampMs: dropTimestampMs + cumulativeDelayMs,
            durationMs: def.defaultDurationMs,
            effectType,
            intensity: def.defaultIntensity,
            primaryColor: { ...def.defaultPrimaryColor },
            secondaryColor: { ...def.defaultSecondaryColor },
            effectParams: { params: buildDefaultParams(def) },
            requiredCapability: def.requiredCapability,
            fallbackColor: { ...def.defaultFallbackColor },
            fallbackBrightness: def.defaultFallbackBrightness,
          };

          projectStore.addEffectKeyframe(effectKf);

          // Insert restore keyframe after the effect concludes (STU-059h1)
          const restoreTimestampMs =
            dropTimestampMs + cumulativeDelayMs + def.defaultDurationMs;
          const priorState = getPriorState(channelId, dropTimestampMs + cumulativeDelayMs);

          projectStore.addKeyframe(channelId, restoreTimestampMs, {
            color: priorState.color,
            colorMode: priorState.colorMode,
            colorTemperature: priorState.colorTemperature,
            brightness: priorState.brightness,
            powerOn: priorState.powerOn,
            transitionMs: 0,
            interpolation: DEFAULT_INTERPOLATION,
          });
        }
      }
    } else {
      // No matching template — apply effect to all channels simultaneously
      for (const channelId of channelIds) {
        const effectKf: Omit<EffectKeyframe, 'id'> = {
          channelId,
          timestampMs: dropTimestampMs,
          durationMs: def.defaultDurationMs,
          effectType,
          intensity: def.defaultIntensity,
          primaryColor: { ...def.defaultPrimaryColor },
          secondaryColor: { ...def.defaultSecondaryColor },
          effectParams: { params: buildDefaultParams(def) },
          requiredCapability: def.requiredCapability,
          fallbackColor: { ...def.defaultFallbackColor },
          fallbackBrightness: def.defaultFallbackBrightness,
        };

        projectStore.addEffectKeyframe(effectKf);

        const restoreTimestampMs = dropTimestampMs + def.defaultDurationMs;
        const priorState = getPriorState(channelId, dropTimestampMs);

        projectStore.addKeyframe(channelId, restoreTimestampMs, {
          color: priorState.color,
          colorMode: priorState.colorMode,
          colorTemperature: priorState.colorTemperature,
          brightness: priorState.brightness,
          powerOn: priorState.powerOn,
          transitionMs: 0,
          interpolation: DEFAULT_INTERPOLATION,
        });
      }
    }

    // Show info toast for skipped channels (STU-059c)
    if (skippedChannels.length > 0) {
      toastStore.info(
        `Effect applied. Skipped missing channels: ${skippedChannels.join(', ')}`
      );
    } else {
      const affectedCount = pattern
        ? [...spreadChannelIds].filter((id) => existingChannelIds.has(id)).length
        : channelIds.length;
      toastStore.success(
        `${def.name} effect placed on ${affectedCount} channel${affectedCount !== 1 ? 's' : ''}`
      );
    }
  }

  function buildDefaultParams(def: import('$lib/types/effects.js').EffectDefinition): Record<string, number> {
    const params: Record<string, number> = {};
    for (const p of def.params) {
      params[p.key] = p.default;
    }
    return params;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="contents"
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  {@render children()}
</div>
