<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { fetchFrame } from '$lib/api/client';
  import type { Channel } from '$lib/domain';
  import type { GenerationOptions, GenerationZone } from '$lib/api/types';

  let {
    open,
    itemId,
    channels,
    busy = false,
    progress = 0,
    throughMs = 0,
    durationMs = 0,
    error = '',
    onstart,
    onclose,
  }: {
    open: boolean;
    itemId: string;
    channels: Channel[];
    busy?: boolean;
    progress?: number;
    throughMs?: number;
    durationMs?: number;
    error?: string;
    onstart: (options: GenerationOptions) => void;
    onclose: () => void;
  } = $props();

  let imageUrl = $state('');
  let imageError = $state('');
  let imageAspect = $state('16 / 9');
  let activeChannelId = $state('');
  let zones = $state<Record<string, GenerationZone>>({});
  let sampleRateFps = $state(1);
  let sceneCutThreshold = $state(0.27);
  let centerExclusionPercent = $state(0);
  let frame = $state<HTMLElement>();
  let dragStart: { x: number; y: number } | null = null;
  let draftZone = $state<GenerationZone | null>(null);

  $effect(() => {
    const visible = open;
    const id = itemId;
    if (!visible || !id) return;
    const controller = new AbortController();
    let url = '';
    imageError = '';
    void fetchFrame(id, 0, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error('The movie frame could not be loaded');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        imageUrl = url;
      })
      .catch(() => {
        if (!controller.signal.aborted)
          imageError = 'Could not load a movie frame for zone selection.';
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      if (imageUrl === url) imageUrl = '';
    };
  });

  $effect(() => {
    const currentChannels = channels;
    if (!currentChannels.length) return;
    if (!currentChannels.some((channel) => channel.id === activeChannelId))
      activeChannelId = currentChannels[0].id;
    const next = { ...zones };
    let changed = false;
    for (const [index, channel] of currentChannels.entries()) {
      if (!next[channel.id]) {
        next[channel.id] = defaultZone(channel, index, currentChannels.length);
        changed = true;
      }
    }
    if (changed) zones = next;
  });

  function defaultZone(channel: Channel, index: number, count: number): GenerationZone {
    const identity = `${channel.id} ${channel.spatialHint}`.toLowerCase().replaceAll('_', '-');
    if (identity.includes('ambient'))
      return { channelId: channel.id, x: 0.04, y: 0.04, width: 0.92, height: 0.92 };
    if (identity.includes('surround-left'))
      return { channelId: channel.id, x: 0, y: 0.5, width: 0.5, height: 0.5 };
    if (identity.includes('surround-right'))
      return { channelId: channel.id, x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
    if (identity.includes('left'))
      return { channelId: channel.id, x: 0, y: 0, width: 0.42, height: 1 };
    if (identity.includes('right'))
      return { channelId: channel.id, x: 0.58, y: 0, width: 0.42, height: 1 };
    if (identity.includes('center'))
      return { channelId: channel.id, x: 0.34, y: 0.15, width: 0.32, height: 0.7 };
    const width = 1 / Math.max(1, count);
    return { channelId: channel.id, x: index * width, y: 0, width, height: 1 };
  }

  function normalizedPoint(event: PointerEvent) {
    const bounds = frame?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function pointerDown(event: PointerEvent) {
    if (busy || !imageUrl || !activeChannelId) return;
    const point = normalizedPoint(event);
    if (!point) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragStart = point;
    draftZone = { channelId: activeChannelId, x: point.x, y: point.y, width: 0, height: 0 };
  }

  function pointerMove(event: PointerEvent) {
    if (!dragStart || !activeChannelId) return;
    const point = normalizedPoint(event);
    if (!point) return;
    draftZone = {
      channelId: activeChannelId,
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    };
  }

  function pointerUp(event: PointerEvent) {
    if (!dragStart || !activeChannelId) return;
    pointerMove(event);
    const zone = draftZone;
    if (zone && zone.width >= 0.02 && zone.height >= 0.02)
      zones = { ...zones, [activeChannelId]: zone };
    dragStart = null;
    draftZone = null;
  }

  function adjustZoneWithKeyboard(event: KeyboardEvent) {
    if (
      busy ||
      !activeChannelId ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return;
    const zone = zones[activeChannelId];
    if (!zone) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.02 : 0.01;
    let next = { ...zone };
    if (event.shiftKey && event.key === 'ArrowRight')
      next.width = Math.min(1 - next.x, next.width + step);
    else if (event.shiftKey && event.key === 'ArrowLeft')
      next.width = Math.max(0.02, next.width - step);
    else if (event.shiftKey && event.key === 'ArrowDown')
      next.height = Math.min(1 - next.y, next.height + step);
    else if (event.shiftKey && event.key === 'ArrowUp')
      next.height = Math.max(0.02, next.height - step);
    else if (event.key === 'ArrowRight') next.x = Math.min(1 - next.width, next.x + step);
    else if (event.key === 'ArrowLeft') next.x = Math.max(0, next.x - step);
    else if (event.key === 'ArrowDown') next.y = Math.min(1 - next.height, next.y + step);
    else if (event.key === 'ArrowUp') next.y = Math.max(0, next.y - step);
    zones = { ...zones, [activeChannelId]: next };
  }

  function start() {
    if (busy || !channels.length || channels.some((channel) => !zones[channel.id])) return;
    onstart({
      sampleRateFps: Math.max(0.1, Math.min(5, sampleRateFps)),
      sceneCutThreshold: Math.max(0.01, Math.min(1, sceneCutThreshold)),
      centerExclusionPercent: Math.max(0, Math.min(90, centerExclusionPercent)),
      zones: channels.map((channel) => zones[channel.id]),
    });
  }

  function clock(ms: number): string {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
</script>

<Modal
  {open}
  title={busy ? 'Generating track keyframes' : 'Pre-fill track'}
  size="lg"
  dismissible={!busy}
  {onclose}
>
  {#if busy}
    <div class="progress-state" role="status" aria-live="polite">
      <p>
        Analyzing the movie as quickly as the server can process it. This job cannot be canceled.
      </p>
      <progress max="1" value={progress}></progress>
      <div class="progress-label">
        <span>{Math.round(progress * 100)}%</span><span
          >{clock(throughMs)} / {clock(durationMs)}</span
        >
      </div>
      <p>Generated keyframes are appearing on the timeline as analysis proceeds.</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  {:else}
    <div class="setup">
      <p class="intro">
        Choose the part of the picture that should drive each track channel. Drag a box on the
        frame; suggested zones are shown for the current layout.
      </p>
      <div class="channel-list" role="group" aria-label="Track channels">
        {#each channels as channel (channel.id)}
          <button
            type="button"
            class:active={activeChannelId === channel.id}
            aria-pressed={activeChannelId === channel.id}
            onclick={() => (activeChannelId = channel.id)}
          >
            <span>{channel.displayName}</span>
            <span class="zone-status">{zones[channel.id] ? 'Zone selected' : 'Draw a zone'}</span>
          </button>
        {/each}
      </div>
      <button
        type="button"
        bind:this={frame}
        class="frame-select"
        class:disabled={!imageUrl || busy}
        style={`aspect-ratio:${imageAspect}`}
        aria-label="Sampling zone editor. Drag to draw a box; use arrow keys to move it and Shift with arrow keys to resize it."
        onkeydown={adjustZoneWithKeyboard}
        onpointerdown={pointerDown}
        onpointermove={pointerMove}
        onpointerup={pointerUp}
        onpointercancel={pointerUp}
      >
        {#if imageUrl}
          <img
            src={imageUrl}
            alt=""
            draggable="false"
            onload={(event) => {
              const target = event.currentTarget as HTMLImageElement;
              if (target.naturalWidth && target.naturalHeight)
                imageAspect = `${target.naturalWidth} / ${target.naturalHeight}`;
            }}
          />
          {#each channels as channel (channel.id)}
            {@const zone =
              channel.id === activeChannelId && draftZone ? draftZone : zones[channel.id]}
            {#if zone}
              <span
                class="zone"
                class:selected={activeChannelId === channel.id}
                style={`left:${zone.x * 100}%;top:${zone.y * 100}%;width:${zone.width * 100}%;height:${zone.height * 100}%`}
                aria-hidden="true"
              >
                <span>{channel.displayName}</span>
              </span>
            {/if}
          {/each}
        {:else}
          <span class="frame-message">{imageError || 'Loading a frame from the movie…'}</span>
        {/if}
      </button>
      <p class="hint">
        Selected channel: {channels.find((channel) => channel.id === activeChannelId)
          ?.displayName ?? 'none'}. Drag to replace its suggested zone, or focus the frame and use
        arrow keys to move/resize it.
      </p>
      <div class="settings">
        <label
          >Samples per second
          <input
            aria-label="Samples per second"
            type="number"
            min="0.1"
            max="5"
            step="0.1"
            bind:value={sampleRateFps}
          />
          <small
            >How often each zone’s color is sampled. Scene changes are detected separately.</small
          >
        </label>
        <label
          >Scene-cut threshold
          <input
            aria-label="Scene-cut threshold"
            type="number"
            min="0.01"
            max="1"
            step="0.01"
            bind:value={sceneCutThreshold}
          />
          <small
            >PySceneDetect content threshold divided by 100. 0.27 is the usual setting (threshold
            27). Lower values add more keyframes.</small
          >
        </label>
        <label
          >Ignore center of each zone (%)
          <input
            aria-label="Center exclusion"
            type="number"
            min="0"
            max="90"
            step="5"
            bind:value={centerExclusionPercent}
          />
          <small>Useful when foreground subjects dominate the selected region.</small>
        </label>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  {/if}
  {#snippet footer()}
    {#if busy}
      <span class="footer-note">Keep Studio open to see the generated keyframes.</span>
    {:else}
      <Button variant="secondary" onclick={onclose}>Back</Button>
      <Button disabled={!imageUrl || !channels.length} onclick={start}>Start generation</Button>
    {/if}
  {/snippet}
</Modal>

<style>
  .setup {
    display: grid;
    gap: 12px;
  }
  .intro,
  .hint,
  .progress-state p {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.45;
  }
  .channel-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .channel-list button {
    display: grid;
    gap: 2px;
    min-width: 112px;
    padding: 7px 10px;
    text-align: left;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .channel-list button.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .zone-status {
    color: var(--text-muted);
    font-size: 11px;
  }
  .frame-select {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    overflow: hidden;
    background: var(--video-bg);
    border: 1px solid var(--border);
    touch-action: none;
    cursor: crosshair;
    text-align: left;
  }
  .frame-select.disabled {
    cursor: wait;
  }
  .frame-select img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
    user-select: none;
  }
  .frame-message {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    color: var(--text-muted);
  }
  .zone {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid var(--text-muted);
    background: color-mix(in srgb, var(--text-muted) 10%, transparent);
    pointer-events: none;
  }
  .zone.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  .zone span {
    position: absolute;
    left: 0;
    top: 0;
    max-width: 100%;
    padding: 2px 5px;
    overflow: hidden;
    color: var(--text);
    background: var(--surface);
    font-size: 10px;
    white-space: nowrap;
  }
  .settings {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .settings label {
    display: grid;
    gap: 4px;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }
  .settings input {
    width: 100%;
    box-sizing: border-box;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .settings small {
    color: var(--text-muted);
    font-weight: 400;
    line-height: 1.35;
  }
  .progress-state {
    display: grid;
    gap: 12px;
    min-height: 150px;
    align-content: center;
  }
  .progress-state progress {
    width: 100%;
    accent-color: var(--accent);
  }
  .progress-label {
    display: flex;
    justify-content: space-between;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  .footer-note {
    margin-right: auto;
    color: var(--text-muted);
    font-size: 12px;
  }
  @media (max-width: 600px) {
    .settings {
      grid-template-columns: 1fr;
    }
  }
</style>
