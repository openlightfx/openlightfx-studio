<script lang="ts">
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { clipboardStore } from '$lib/stores/clipboard.svelte.js';
  import {
    copySelectedKeyframes,
    cutSelectedKeyframes,
    pasteKeyframes,
    selectAllInActiveChannel,
    deleteSelected,
    openProject,
    openVideo,
    saveProject,
    saveProjectAs,
    importLightFX,
    showAbout,
  } from '$lib/services/edit-actions.js';
  import type { PanelSizes } from '$lib/types/index.js';
  import { DEFAULT_PANEL_SIZES } from '$lib/types/index.js';

  let {
    onresetlayout,
  }: {
    onresetlayout?: () => void;
  } = $props();

  // Menu state
  let openMenuId = $state<string | null>(null);

  interface MenuItem {
    id: string;
    label: string;
    shortcut?: string;
    action?: () => void;
    disabled?: boolean;
    separator?: boolean;
    submenu?: MenuItem[];
  }

  interface Menu {
    id: string;
    label: string;
    items: MenuItem[];
  }

  const hasSelection = $derived(
    timelineStore.selection.keyframeIds.length > 0 ||
      timelineStore.selection.effectKeyframeIds.length > 0 ||
      timelineStore.selection.sceneMarkerIds.length > 0
  );
  const hasActiveChannel = $derived(timelineStore.selection.activeChannelId !== null);

  const menus: Menu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New Project', action: () => uiStore.openModal('new-project') },
        {
          id: 'open',
          label: 'Open Project',
          shortcut: 'Ctrl+O',
          action: () => openProject(),
        },
        {
          id: 'open-video',
          label: 'Open Video',
          action: () => openVideo(),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'save',
          label: 'Save',
          shortcut: 'Ctrl+S',
          action: () => saveProject(),
        },
        {
          id: 'save-as',
          label: 'Save As',
          shortcut: 'Ctrl+Shift+S',
          action: () => saveProjectAs(),
        },
        { id: 'sep2', label: '', separator: true },
        {
          id: 'export',
          label: 'Export .lightfx',
          shortcut: 'Ctrl+E',
          action: () => uiStore.openModal('export'),
        },
        {
          id: 'import',
          label: 'Import .lightfx',
          action: () => importLightFX(),
        },
        { id: 'sep3', label: '', separator: true },
        {
          id: 'scene-detect',
          label: 'Auto-Detect Scenes…',
          action: () => uiStore.openModal('scene-detection'),
        },
        { id: 'sep4', label: '', separator: true },
        {
          id: 'publish',
          label: 'Publish to Marketplace',
          disabled: true,
          action: () => uiStore.openModal('publish'),
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'undo',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          get disabled() {
            return !undoStore.canUndo;
          },
          action: () => undoStore.undo(),
        },
        {
          id: 'redo',
          label: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          get disabled() {
            return !undoStore.canRedo;
          },
          action: () => undoStore.redo(),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'cut',
          label: 'Cut',
          shortcut: 'Ctrl+X',
          get disabled() {
            return !hasSelection;
          },
          action: () => cutSelectedKeyframes(),
        },
        {
          id: 'copy',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          get disabled() {
            return !hasSelection;
          },
          action: () => copySelectedKeyframes(),
        },
        {
          id: 'paste',
          label: 'Paste',
          shortcut: 'Ctrl+V',
          get disabled() {
            return !clipboardStore.hasContent || !hasActiveChannel;
          },
          action: () => pasteKeyframes(),
        },
        {
          id: 'delete',
          label: 'Delete',
          shortcut: 'Delete',
          get disabled() {
            return !hasSelection;
          },
          action: () => deleteSelected(),
        },
        { id: 'sep2', label: '', separator: true },
        {
          id: 'select-all',
          label: 'Select All in Channel',
          shortcut: 'Ctrl+A',
          get disabled() {
            return !hasActiveChannel;
          },
          action: () => selectAllInActiveChannel(),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'overlay',
          label: 'Toggle Overlay',
          action: () => uiStore.toggleOverlay(),
        },
        {
          id: 'snapping',
          label: 'Toggle Snapping',
          action: () => uiStore.toggleSnapping(),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'zoom-in',
          label: 'Zoom In',
          shortcut: 'Ctrl+=',
          action: () => timelineStore.zoomIn(),
        },
        {
          id: 'zoom-out',
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          action: () => timelineStore.zoomOut(),
        },
        {
          id: 'zoom-fit',
          label: 'Zoom to Fit',
          shortcut: 'Ctrl+0',
          get disabled() {
            return !videoStore.state.isLoaded;
          },
          action: () => timelineStore.zoomToFit(videoStore.state.durationMs),
        },
        { id: 'sep2', label: '', separator: true },
        {
          id: 'reset-layout',
          label: 'Reset Panel Layout',
          action: () => onresetlayout?.(),
        },
      ],
    },
    {
      id: 'playback',
      label: 'Playback',
      items: [
        {
          id: 'play-pause',
          label: 'Play / Pause',
          shortcut: 'Space',
          action: () => videoStore.togglePlayback(),
        },
        {
          id: 'step-fwd',
          label: 'Frame Step Forward',
          shortcut: '→',
          action: () => videoStore.stepForward(),
        },
        {
          id: 'step-bwd',
          label: 'Frame Step Backward',
          shortcut: '←',
          action: () => videoStore.stepBackward(),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'speed',
          label: 'Speed',
          submenu: [
            { id: 'speed-025', label: '0.25×', action: () => videoStore.setSpeed(0.25) },
            { id: 'speed-05', label: '0.5×', action: () => videoStore.setSpeed(0.5) },
            { id: 'speed-1', label: '1×', action: () => videoStore.setSpeed(1) },
            { id: 'speed-2', label: '2×', action: () => videoStore.setSpeed(2) },
            { id: 'speed-4', label: '4×', action: () => videoStore.setSpeed(4) },
          ],
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          id: 'shortcuts',
          label: 'Keyboard Shortcuts',
          shortcut: '?',
          action: () => uiStore.openModal('keyboard-shortcuts'),
        },
        {
          id: 'welcome',
          label: 'Welcome Tour',
          action: () => uiStore.openModal('welcome'),
        },
        { id: 'sep1', label: '', separator: true },
        { id: 'about', label: 'About', action: () => showAbout() },
      ],
    },
  ];

  function handleMenuClick(menuId: string) {
    openMenuId = openMenuId === menuId ? null : menuId;
  }

  function handleMenuEnter(menuId: string) {
    if (openMenuId !== null) {
      openMenuId = menuId;
    }
  }

  function handleItemClick(item: MenuItem) {
    if (item.disabled || item.separator) return;
    item.action?.();
    openMenuId = null;
  }

  function handleBackdropClick() {
    openMenuId = null;
  }

  let hoveredSubmenuId = $state<string | null>(null);
</script>

<!-- Invisible backdrop to close menus when clicking outside -->
{#if openMenuId}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" onmousedown={handleBackdropClick}></div>
{/if}

<header
  class="flex h-menubar-h items-center bg-surface border-b border-surface2 text-xs no-select relative z-50"
>
  <!-- Logo -->
  <div class="flex items-center px-2">
    <img src="/logo.svg" alt="OpenLightFX" class="h-5 w-5" />
  </div>

  <!-- Menus -->
  <nav class="flex items-center h-full">
    {#each menus as menu (menu.id)}
      <div class="relative h-full">
        <button
          class="h-full px-3 transition-colors
            {openMenuId === menu.id
            ? 'bg-surface2 text-text-base'
            : 'text-textMuted hover:bg-surface2 hover:text-text-base'}"
          onclick={() => handleMenuClick(menu.id)}
          onmouseenter={() => handleMenuEnter(menu.id)}
        >
          {menu.label}
        </button>

        {#if openMenuId === menu.id}
          <div
            class="absolute left-0 top-full min-w-[200px] bg-surface border border-surface2 rounded-b-md shadow-lg py-1 z-50 animate-fade-in"
          >
            {#each menu.items as item (item.id)}
              {#if item.separator}
                <div class="border-t border-surface2 my-1"></div>
              {:else if item.submenu}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="relative"
                  onmouseenter={() => (hoveredSubmenuId = item.id)}
                  onmouseleave={() => (hoveredSubmenuId = null)}
                >
                  <div
                    class="flex items-center justify-between px-3 py-1.5 text-text-base hover:bg-surface2 cursor-default"
                  >
                    <span>{item.label}</span>
                    <span class="text-textMuted ml-4">▸</span>
                  </div>
                  {#if hoveredSubmenuId === item.id}
                    <div
                      class="absolute left-full top-0 min-w-[120px] bg-surface border border-surface2 rounded-md shadow-lg py-1 z-50"
                    >
                      {#each item.submenu as sub (sub.id)}
                        <button
                          class="flex w-full items-center px-3 py-1.5 text-left text-text-base hover:bg-surface2"
                          onclick={() => handleItemClick(sub)}
                        >
                          {sub.label}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else}
                <button
                  class="flex w-full items-center justify-between px-3 py-1.5 text-left
                    {item.disabled
                    ? 'text-textMuted/50 cursor-not-allowed'
                    : 'text-text-base hover:bg-surface2'}"
                  disabled={item.disabled}
                  onclick={() => handleItemClick(item)}
                >
                  <span>{item.label}</span>
                  {#if item.shortcut}
                    <span class="text-textMuted text-2xs ml-4">{item.shortcut}</span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </nav>
</header>
