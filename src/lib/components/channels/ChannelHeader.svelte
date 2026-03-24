<script lang="ts">
	import type { Channel, ContextMenuItem } from '$lib/types';
	import ContextMenu from '$lib/components/shared/ContextMenu.svelte';

	let {
		channel,
		isMuted,
		isSoloed,
		isSelected,
		groupColor,
		onselect,
		ontoggleMute,
		ontoggleSolo,
		onrename,
		ondelete,
		onduplicate
	}: {
		channel: Channel;
		isMuted: boolean;
		isSoloed: boolean;
		isSelected: boolean;
		groupColor: string | null;
		onselect: () => void;
		ontoggleMute: () => void;
		ontoggleSolo: () => void;
		onrename: (name: string) => void;
		ondelete: () => void;
		onduplicate: () => void;
	} = $props();

	let editing = $state(false);
	let editValue = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	let contextMenuVisible = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let confirmingDelete = $state(false);

	function startEditing() {
		editValue = channel.displayName;
		editing = true;
		// Focus input after render
		requestAnimationFrame(() => editInput?.select());
	}

	function commitEdit() {
		if (editing) {
			const trimmed = editValue.trim();
			if (trimmed && trimmed !== channel.displayName) {
				onrename(trimmed);
			}
			editing = false;
		}
	}

	function cancelEdit() {
		editing = false;
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') commitEdit();
		else if (e.key === 'Escape') cancelEdit();
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		contextMenuVisible = true;
		confirmingDelete = false;
	}

	function handleDeleteClick() {
		if (confirmingDelete) {
			ondelete();
			confirmingDelete = false;
		} else {
			confirmingDelete = true;
		}
	}

	const contextMenuItems: ContextMenuItem[] = $derived([
		{ label: 'Rename', icon: '✏️', action: startEditing },
		{ label: 'Duplicate', icon: '📋', action: onduplicate },
		{ separator: true, label: '' },
		{ label: confirmingDelete ? 'Confirm Delete?' : 'Delete', icon: '🗑️', action: handleDeleteClick },
		{ separator: true, label: '' },
		{ label: 'Properties', icon: '⚙️', action: onselect }
	]);
</script>

<div
	class="flex items-center gap-1.5 px-2 h-[var(--lane-height)] border-b border-[var(--surface2)] cursor-pointer select-none transition-colors
		{isSelected ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--surface2)]/50'}
		{isMuted ? 'opacity-50' : ''}"
	style="{isSoloed ? `border-left: 3px solid var(--accent2);` : groupColor ? `border-left: 3px solid ${groupColor};` : 'border-left: 3px solid transparent;'}"
	onclick={onselect}
	ondblclick={startEditing}
	oncontextmenu={handleContextMenu}
	role="button"
	tabindex="0"
>
	<!-- Group indicator -->
	{#if groupColor}
		<span class="text-xs" title="Grouped" style="color: {groupColor};">🔗</span>
	{/if}

	<!-- Channel name -->
	<div class="flex-1 min-w-0">
		{#if editing}
			<input
				bind:this={editInput}
				bind:value={editValue}
				class="input w-full text-xs px-1 py-0.5"
				onblur={commitEdit}
				onkeydown={handleEditKeydown}
			/>
		{:else}
			<span class="text-xs font-medium text-[var(--text)] truncate block">
				{channel.displayName}
			</span>
		{/if}
	</div>

	<!-- Solo / Mute buttons -->
	<button
		class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors
			{isSoloed
			? 'bg-[var(--accent2)] text-black'
			: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
		onclick={(e) => { e.stopPropagation(); ontoggleSolo(); }}
		title="Solo"
	>
		S
	</button>
	<button
		class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors
			{isMuted
			? 'bg-[var(--danger)] text-white'
			: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
		onclick={(e) => { e.stopPropagation(); ontoggleMute(); }}
		title="Mute"
	>
		M
	</button>
</div>

<ContextMenu
	x={contextMenuX}
	y={contextMenuY}
	visible={contextMenuVisible}
	items={contextMenuItems}
	onclose={() => { contextMenuVisible = false; confirmingDelete = false; }}
/>
