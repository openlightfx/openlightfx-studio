<script lang="ts">
	import type { ContextMenuItem } from '$lib/types';

	let {
		x,
		y,
		visible,
		items,
		onclose
	}: {
		x: number;
		y: number;
		visible: boolean;
		items: ContextMenuItem[];
		onclose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let adjustedX = $state(0);
	let adjustedY = $state(0);
	let activeSubmenu = $state<number | null>(null);

	$effect(() => {
		if (visible && menuEl) {
			const rect = menuEl.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;

			adjustedX = x + rect.width > vw ? vw - rect.width - 8 : x;
			adjustedY = y + rect.height > vh ? vh - rect.height - 8 : y;
		}
	});

	$effect(() => {
		if (!visible) return;

		function handleClick(e: MouseEvent) {
			if (menuEl && !menuEl.contains(e.target as Node)) {
				onclose();
			}
		}

		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') onclose();
		}

		document.addEventListener('click', handleClick, true);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClick, true);
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	function handleItemClick(item: ContextMenuItem) {
		if (item.disabled || item.separator) return;
		item.action?.();
		onclose();
	}
</script>

{#if visible}
	<div
		bind:this={menuEl}
		class="fixed z-50 min-w-[180px] rounded-lg shadow-xl border border-[var(--surface2)] py-1 text-sm"
		style="left: {adjustedX}px; top: {adjustedY}px; background: var(--surface);"
		role="menu"
	>
		{#each items as item, i}
			{#if item.separator}
				<div class="my-1 border-t border-[var(--surface2)]"></div>
			{:else}
				<div
					class="relative"
					role="menuitem"
					onmouseenter={() => {
						if (item.submenu) activeSubmenu = i;
					}}
					onmouseleave={() => {
						if (item.submenu) activeSubmenu = null;
					}}
				>
					<button
						class="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer
							{item.disabled
							? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
							: 'text-[var(--text)] hover:bg-[var(--surface2)]'}"
						disabled={item.disabled}
						onclick={() => handleItemClick(item)}
					>
						{#if item.icon}
							<span class="w-4 text-center text-xs">{item.icon}</span>
						{:else}
							<span class="w-4"></span>
						{/if}
						<span class="flex-1">{item.label}</span>
						{#if item.submenu}
							<span class="text-[var(--text-muted)] text-xs ml-2">▶</span>
						{/if}
					</button>

					<!-- Submenu -->
					{#if item.submenu && activeSubmenu === i}
						<div
							class="absolute left-full top-0 ml-1 min-w-[160px] rounded-lg shadow-xl border border-[var(--surface2)] py-1"
							style="background: var(--surface);"
							role="menu"
						>
							{#each item.submenu as sub}
								{#if sub.separator}
									<div class="my-1 border-t border-[var(--surface2)]"></div>
								{:else}
									<button
										class="w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer
											{sub.disabled
											? 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
											: 'text-[var(--text)] hover:bg-[var(--surface2)]'}"
										disabled={sub.disabled}
										onclick={() => {
											if (!sub.disabled) {
												sub.action?.();
												onclose();
											}
										}}
									>
										{#if sub.icon}
											<span class="w-4 text-center text-xs">{sub.icon}</span>
										{:else}
											<span class="w-4"></span>
										{/if}
										<span class="flex-1">{sub.label}</span>
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
