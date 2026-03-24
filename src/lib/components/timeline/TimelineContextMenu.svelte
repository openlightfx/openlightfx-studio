<script lang="ts">
  import type { EffectType } from '$lib/types';

  let {
    x = 0,
    y = 0,
    channelId,
    timestampMs = 0,
    hasSelection = false,
    hasClipboard = false,
    hasEffectSelected = false,
    channelSoloed = false,
    onaddKeyframe,
    onaddEffect,
    onaddSceneMarker,
    oneditProperties,
    onduplicate,
    oncut,
    oncopy,
    onpaste,
    ondelete,
    onselectAllInChannel,
    onflattenToKeyframes,
    onchannelProperties,
    onclose,
  }: {
    x?: number;
    y?: number;
    channelId: string;
    timestampMs?: number;
    hasSelection?: boolean;
    hasClipboard?: boolean;
    hasEffectSelected?: boolean;
    channelSoloed?: boolean;
    onaddKeyframe?: () => void;
    onaddEffect?: (type: EffectType) => void;
    onaddSceneMarker?: () => void;
    oneditProperties?: () => void;
    onduplicate?: () => void;
    oncut?: () => void;
    oncopy?: () => void;
    onpaste?: () => void;
    ondelete?: () => void;
    onselectAllInChannel?: () => void;
    onflattenToKeyframes?: () => void;
    onchannelProperties?: () => void;
    onclose?: () => void;
  } = $props();

  const EFFECT_TYPES: EffectType[] = [
    'LIGHTNING', 'FLAME', 'FLASHBANG', 'EXPLOSION', 'PULSE', 'STROBE',
    'SIREN', 'AURORA', 'CANDLE', 'GUNFIRE', 'NEON', 'BREATHING', 'SPARK',
  ];

  let effectSubmenuOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();

  // Clamp position to viewport
  let clampedX = $derived(Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 240));
  let clampedY = $derived(Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 480));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose?.();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      onclose?.();
    }
  }

  function formatEffectName(type: EffectType): string {
    return type.charAt(0) + type.slice(1).toLowerCase();
  }

  function handleAction(action: (() => void) | undefined) {
    if (action) {
      action();
      onclose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50"
  onmousedown={handleBackdropClick}
  onkeydown={handleKeydown}
>
  <div
    bind:this={menuEl}
    class="absolute min-w-[200px] bg-[var(--surface)] border border-[var(--surface2)] rounded-lg shadow-xl py-1 text-sm text-[var(--text)]"
    style="left: {clampedX}px; top: {clampedY}px;"
    role="menu"
  >
    <!-- Add Keyframe -->
    <button class="menu-item" onclick={() => handleAction(onaddKeyframe)} role="menuitem">
      Add Keyframe Here
    </button>

    <!-- Add Effect submenu -->
    <div
      class="relative"
      onmouseenter={() => (effectSubmenuOpen = true)}
      onmouseleave={() => (effectSubmenuOpen = false)}
    >
      <button class="menu-item flex items-center justify-between" role="menuitem">
        <span>Add Effect Here</span>
        <span class="ml-4 text-[var(--text-muted)]">▶</span>
      </button>
      {#if effectSubmenuOpen}
        <div
          class="absolute left-full top-0 min-w-[160px] bg-[var(--surface)] border border-[var(--surface2)] rounded-lg shadow-xl py-1"
          role="menu"
        >
          {#each EFFECT_TYPES as et}
            <button
              class="menu-item"
              onclick={() => { onaddEffect?.(et); onclose?.(); }}
              role="menuitem"
            >
              {formatEffectName(et)}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Add Scene Marker -->
    <button class="menu-item" onclick={() => handleAction(onaddSceneMarker)} role="menuitem">
      Add Scene Marker Here
    </button>

    <!-- Separator -->
    <div class="my-1 border-t border-[var(--surface2)]"></div>

    <!-- Edit Properties -->
    <button
      class="menu-item"
      class:opacity-40={!hasSelection}
      disabled={!hasSelection}
      onclick={() => handleAction(oneditProperties)}
      role="menuitem"
    >
      Edit Properties
    </button>

    <!-- Duplicate -->
    <button
      class="menu-item"
      class:opacity-40={!hasSelection}
      disabled={!hasSelection}
      onclick={() => handleAction(onduplicate)}
      role="menuitem"
    >
      Duplicate
    </button>

    <!-- Separator -->
    <div class="my-1 border-t border-[var(--surface2)]"></div>

    <!-- Cut -->
    <button
      class="menu-item"
      class:opacity-40={!hasSelection}
      disabled={!hasSelection}
      onclick={() => handleAction(oncut)}
      role="menuitem"
    >
      Cut
    </button>

    <!-- Copy -->
    <button
      class="menu-item"
      class:opacity-40={!hasSelection}
      disabled={!hasSelection}
      onclick={() => handleAction(oncopy)}
      role="menuitem"
    >
      Copy
    </button>

    <!-- Paste -->
    <button
      class="menu-item"
      class:opacity-40={!hasClipboard}
      disabled={!hasClipboard}
      onclick={() => handleAction(onpaste)}
      role="menuitem"
    >
      Paste
    </button>

    <!-- Delete -->
    <button
      class="menu-item"
      class:opacity-40={!hasSelection}
      disabled={!hasSelection}
      onclick={() => handleAction(ondelete)}
      role="menuitem"
    >
      Delete
    </button>

    <!-- Separator -->
    <div class="my-1 border-t border-[var(--surface2)]"></div>

    <!-- Select All in Channel -->
    <button
      class="menu-item"
      onclick={() => handleAction(onselectAllInChannel)}
      role="menuitem"
    >
      Select All in Channel
    </button>

    <!-- Separator -->
    <div class="my-1 border-t border-[var(--surface2)]"></div>

    <!-- Flatten to Keyframes -->
    <button
      class="menu-item"
      class:opacity-40={!hasEffectSelected}
      disabled={!hasEffectSelected}
      onclick={() => handleAction(onflattenToKeyframes)}
      role="menuitem"
    >
      Flatten to Keyframes
    </button>

    <!-- Separator -->
    <div class="my-1 border-t border-[var(--surface2)]"></div>

    <!-- Channel Properties -->
    <button class="menu-item" onclick={() => handleAction(onchannelProperties)} role="menuitem">
      Channel Properties
    </button>
  </div>
</div>

<style>
  .menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    cursor: pointer;
    background: none;
    border: none;
    color: var(--text);
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  .menu-item:not(:disabled):hover {
    background: var(--surface2);
  }
  .menu-item:disabled {
    cursor: default;
  }
</style>
