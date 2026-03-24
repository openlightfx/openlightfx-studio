<script lang="ts">
  let {
    onNewProject,
    onOpenProject,
    onSaveProject,
    onSaveProjectAs,
    onImportTrack,
    onExportTrack,
    onExportMarketplace,
    onPublishMarketplace,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    projectName = 'Untitled',
    isDirty = false,
  }: {
    onNewProject?: () => void;
    onOpenProject?: () => void;
    onSaveProject?: () => void;
    onSaveProjectAs?: () => void;
    onImportTrack?: () => void;
    onExportTrack?: () => void;
    onExportMarketplace?: () => void;
    onPublishMarketplace?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    projectName?: string;
    isDirty?: boolean;
  } = $props();

  let activeMenu = $state<string | null>(null);

  const menus = [
    {
      label: 'File',
      id: 'file',
      items: [
        { label: 'New Project', shortcut: 'Ctrl+N', action: () => onNewProject?.() },
        { label: 'Open Project…', shortcut: 'Ctrl+O', action: () => onOpenProject?.() },
        { separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => onSaveProject?.() },
        { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => onSaveProjectAs?.() },
        { separator: true },
        { label: 'Import .lightfx…', action: () => onImportTrack?.() },
        { label: 'Export .lightfx…', shortcut: 'Ctrl+E', action: () => onExportTrack?.() },
        { separator: true },
        { label: 'Export for Marketplace…', action: () => onExportMarketplace?.() },
        { label: 'Publish to Marketplace…', action: () => onPublishMarketplace?.() },
      ],
    },
    {
      label: 'Edit',
      id: 'edit',
      items: [
        {
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => onUndo?.(),
          disabled: !canUndo,
        },
        {
          label: 'Redo',
          shortcut: 'Ctrl+Shift+Z',
          action: () => onRedo?.(),
          disabled: !canRedo,
        },
        { separator: true },
        { label: 'Cut', shortcut: 'Ctrl+X' },
        { label: 'Copy', shortcut: 'Ctrl+C' },
        { label: 'Paste', shortcut: 'Ctrl+V' },
        { label: 'Delete', shortcut: 'Del' },
        { separator: true },
        { label: 'Select All in Channel', shortcut: 'Ctrl+A' },
      ],
    },
    {
      label: 'View',
      id: 'view',
      items: [
        { label: 'Zoom In', shortcut: 'Ctrl+=' },
        { label: 'Zoom Out', shortcut: 'Ctrl+-' },
        { label: 'Zoom to Fit', shortcut: 'Ctrl+0' },
        { separator: true },
        { label: 'Toggle Lighting Overlay', shortcut: 'L' },
        { label: 'Toggle Effects Palette' },
        { label: 'Toggle Properties Panel' },
        { separator: true },
        { label: 'Dark Mode / Light Mode' },
      ],
    },
    {
      label: 'Help',
      id: 'help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: '?' },
        { separator: true },
        { label: 'About OpenLightFX Studio' },
      ],
    },
  ];

  function handleMenuClick(menuId: string) {
    activeMenu = activeMenu === menuId ? null : menuId;
  }

  function handleMenuEnter(menuId: string) {
    if (activeMenu !== null) {
      activeMenu = menuId;
    }
  }

  function handleItemClick(item: { action?: () => void; disabled?: boolean }) {
    if (item.disabled) return;
    item.action?.();
    activeMenu = null;
  }

  function handleClickOutside() {
    activeMenu = null;
  }
</script>

<svelte:window onclick={handleClickOutside} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex items-center h-7 bg-[var(--surface)] border-b border-[var(--surface2)] text-xs select-none"
  onclick={(e) => e.stopPropagation()}
>
  <!-- Logo -->
  <div class="flex items-center gap-1.5 px-3">
    <img src="/logo.svg" alt="OpenLightFX" class="h-4 w-4" />
    <span class="font-semibold text-[var(--text)]">
      {projectName}{isDirty ? ' •' : ''}
    </span>
  </div>

  <!-- Menu items -->
  {#each menus as menu}
    <div class="relative">
      <button
        class="px-2.5 py-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors rounded-sm"
        class:bg-[var(--surface2)]={activeMenu === menu.id}
        class:text-[var(--text)]={activeMenu === menu.id}
        onclick={(e) => { e.stopPropagation(); handleMenuClick(menu.id); }}
        onmouseenter={() => handleMenuEnter(menu.id)}
      >
        {menu.label}
      </button>

      {#if activeMenu === menu.id}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute left-0 top-full mt-0.5 min-w-[220px] bg-[var(--surface)] border border-[var(--surface2)] rounded-lg shadow-xl shadow-black/40 z-50 py-1"
          onclick={(e) => e.stopPropagation()}
        >
          {#each menu.items as item}
            {#if 'separator' in item && item.separator}
              <div class="my-1 border-t border-[var(--surface2)]"></div>
            {:else}
              <button
                class="w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors rounded-sm"
                class:text-[var(--text-muted)]={item.disabled}
                class:cursor-not-allowed={item.disabled}
                class:text-[var(--text)]={!item.disabled}
                class:hover:bg-[var(--surface2)]={!item.disabled}
                disabled={item.disabled}
                onclick={() => handleItemClick(item)}
              >
                <span>{item.label}</span>
                {#if 'shortcut' in item && item.shortcut}
                  <span class="text-[var(--text-muted)] text-[10px] ml-6">{item.shortcut}</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
