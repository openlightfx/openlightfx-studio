<script lang="ts">
	import type { Channel } from '$lib/types';
	import ChannelHeader from './ChannelHeader.svelte';

	let {
		channels,
		channelOrder,
		mutedChannels,
		soloedChannels,
		selectedChannelId,
		onselect,
		onreorder,
		ontoggleMute,
		ontoggleSolo,
		onaddChannel,
		onrenameChannel,
		ondeleteChannel
	}: {
		channels: Channel[];
		channelOrder: string[];
		mutedChannels: Set<string>;
		soloedChannels: Set<string>;
		selectedChannelId: string | null;
		onselect: (channelId: string) => void;
		onreorder: (channelOrder: string[]) => void;
		ontoggleMute: (channelId: string) => void;
		ontoggleSolo: (channelId: string) => void;
		onaddChannel: () => void;
		onrenameChannel: (channelId: string, name: string) => void;
		ondeleteChannel: (channelId: string) => void;
	} = $props();

	let draggedId = $state<string | null>(null);
	let dropTargetIndex = $state<number | null>(null);

	const channelMap = $derived(new Map(channels.map((c) => [c.id, c])));

	const orderedChannels = $derived(
		channelOrder
			.map((id) => channelMap.get(id))
			.filter((c): c is Channel => c !== undefined)
	);

	function handleDragStart(e: DragEvent, channelId: string) {
		draggedId = channelId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', channelId);
		}
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTargetIndex = index;
	}

	function handleDragLeave() {
		dropTargetIndex = null;
	}

	function handleDrop(e: DragEvent, targetIndex: number) {
		e.preventDefault();
		if (!draggedId) return;

		const fromIndex = channelOrder.indexOf(draggedId);
		if (fromIndex === -1 || fromIndex === targetIndex) {
			draggedId = null;
			dropTargetIndex = null;
			return;
		}

		const newOrder = [...channelOrder];
		newOrder.splice(fromIndex, 1);
		const insertAt = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
		newOrder.splice(insertAt, 0, draggedId);
		onreorder(newOrder);

		draggedId = null;
		dropTargetIndex = null;
	}

	function handleDragEnd() {
		draggedId = null;
		dropTargetIndex = null;
	}
</script>

<div class="flex flex-col h-full" style="background: var(--surface);">
	<!-- Channel list -->
	<div class="flex-1 overflow-y-auto">
		{#each orderedChannels as channel, index (channel.id)}
			<div
				class="relative"
				draggable="true"
				ondragstart={(e) => handleDragStart(e, channel.id)}
				ondragover={(e) => handleDragOver(e, index)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, index)}
				ondragend={handleDragEnd}
			>
				<!-- Drop indicator -->
				{#if dropTargetIndex === index && draggedId !== channel.id}
					<div class="absolute top-0 left-0 right-0 h-0.5 bg-[var(--accent)] z-10"></div>
				{/if}

				<ChannelHeader
					{channel}
					isMuted={mutedChannels.has(channel.id)}
					isSoloed={soloedChannels.has(channel.id)}
					isSelected={selectedChannelId === channel.id}
					groupColor={null}
					onselect={() => onselect(channel.id)}
					ontoggleMute={() => ontoggleMute(channel.id)}
					ontoggleSolo={() => ontoggleSolo(channel.id)}
					onrename={(name) => onrenameChannel(channel.id, name)}
					ondelete={() => ondeleteChannel(channel.id)}
					onduplicate={() => {}}
				/>
			</div>
		{/each}

		<!-- Drop indicator at bottom -->
		{#if dropTargetIndex === orderedChannels.length}
			<div class="h-0.5 bg-[var(--accent)]"></div>
		{/if}
	</div>

	<!-- Add Channel button -->
	<div class="p-2 border-t border-[var(--surface2)]">
		<button
			class="btn btn-ghost w-full text-xs flex items-center justify-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--accent)]"
			onclick={onaddChannel}
			ondragover={(e) => handleDragOver(e, orderedChannels.length)}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, orderedChannels.length)}
		>
			<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			Add Channel
		</button>
	</div>
</div>
