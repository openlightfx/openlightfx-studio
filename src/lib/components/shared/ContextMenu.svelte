<script lang="ts">
  import type { ContextMenu, ContextMenuItem } from '$lib/types/ui.js';

  let {
    menu,
    onclose,
  }: {
    menu: ContextMenu | null;
    onclose: () => void;
  } = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let activeSubmenu: string | null = $state(null);

  // Adjust position to keep menu in viewport
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  $effect(() => {
    if (!menu || !menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    adjustedX = menu.x + rect.width > vw ? vw - rect.width - 8 : menu.x;
    adjustedY = menu.y + rect.height > vh ? vh - rect.height - 8 : menu.y;
  });

  $effect(() => {
    if (!menu) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onclose();
      }
    }

    function handleClick(e: MouseEvent) {
      if (menuEl && !menuEl.contains(e.target as Node)) {
        onclose();
      }
    }

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('mousedown', handleClick);
    };
  });

  function handleItemClick(item: ContextMenuItem) {
    if (!item.enabled || item.submenu) return;
    item.action?.();
    onclose();
  }
</script>

{#if menu}
  <div
    bind:this={menuEl}
    class="animate-fade-in fixed z-[90] min-w-[180px] rounded-lg border border-surface2 bg-surface py-1 shadow-xl"
    style="left: {adjustedX}px; top: {adjustedY}px;"
    role="menu"
  >
    {#each menu.items as item (item.id)}
      {#if item.separator}
        <div class="my-1 border-t border-surface2" role="separator"></div>
      {:else}
        <div
          class="relative"
          role="none"
          onmouseenter={() => {
            if (item.submenu) activeSubmenu = item.id;
          }}
          onmouseleave={() => {
            if (item.submenu) activeSubmenu = null;
          }}
        >
          <button
            role="menuitem"
            disabled={!item.enabled}
            onclick={() => handleItemClick(item)}
            class="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors
              {item.enabled
              ? 'text-text-base hover:bg-surface2'
              : 'cursor-default text-textMuted/50'}"
          >
            {#if item.icon}
              <span class="w-4 text-center text-xs" aria-hidden="true">{item.icon}</span>
            {:else}
              <span class="w-4"></span>
            {/if}
            <span class="flex-1">{item.label}</span>
            {#if item.shortcut}
              <span class="ml-4 text-xs text-textMuted">{item.shortcut}</span>
            {/if}
            {#if item.submenu}
              <span class="text-xs text-textMuted" aria-hidden="true">▸</span>
            {/if}
          </button>

          <!-- Submenu -->
          {#if item.submenu && activeSubmenu === item.id}
            <div
              class="animate-fade-in absolute left-full top-0 z-[91] min-w-[160px] rounded-lg border border-surface2 bg-surface py-1 shadow-xl"
              role="menu"
            >
              {#each item.submenu as sub (sub.id)}
                {#if sub.separator}
                  <div class="my-1 border-t border-surface2" role="separator"></div>
                {:else}
                  <button
                    role="menuitem"
                    disabled={!sub.enabled}
                    onclick={() => {
                      if (sub.enabled) {
                        sub.action?.();
                        onclose();
                      }
                    }}
                    class="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors
                      {sub.enabled
                      ? 'text-text-base hover:bg-surface2'
                      : 'cursor-default text-textMuted/50'}"
                  >
                    {#if sub.icon}
                      <span class="w-4 text-center text-xs" aria-hidden="true">{sub.icon}</span>
                    {:else}
                      <span class="w-4"></span>
                    {/if}
                    <span class="flex-1">{sub.label}</span>
                    {#if sub.shortcut}
                      <span class="ml-4 text-xs text-textMuted">{sub.shortcut}</span>
                    {/if}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}
