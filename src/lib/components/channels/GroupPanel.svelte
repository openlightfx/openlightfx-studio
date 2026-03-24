<script lang="ts">
	import type { Channel, ChannelGroup, GroupMode, ChannelGroupOffset } from '$lib/types';

	let {
		groups,
		channels,
		oncreateGroup,
		onupdateGroup,
		ondeleteGroup,
		onunlinkChannel,
		onrelinkChannel
	}: {
		groups: ChannelGroup[];
		channels: Channel[];
		oncreateGroup: (group: ChannelGroup) => void;
		onupdateGroup: (group: ChannelGroup) => void;
		ondeleteGroup: (groupId: string) => void;
		onunlinkChannel: (groupId: string, channelId: string) => void;
		onrelinkChannel: (groupId: string, channelId: string) => void;
	} = $props();

	let creating = $state(false);
	let newGroupName = $state('');
	let newGroupMode = $state<GroupMode>('GROUP_MIRROR');
	let selectedChannelIds = $state<Set<string>>(new Set());
	let expandedGroupId = $state<string | null>(null);
	let unlinkedChannels = $state<Set<string>>(new Set());

	const groupModes: { value: GroupMode; label: string; description: string }[] = [
		{ value: 'GROUP_MIRROR', label: 'Mirror', description: 'All channels show the same color' },
		{ value: 'GROUP_SPREAD', label: 'Spread', description: 'Colors spread across channels with timing offsets' },
		{ value: 'GROUP_ALTERNATE', label: 'Alternate', description: 'Channels alternate between colors' }
	];

	function toggleChannelSelection(id: string) {
		const next = new Set(selectedChannelIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedChannelIds = next;
	}

	function handleCreateGroup() {
		if (!newGroupName.trim() || selectedChannelIds.size < 2) return;

		const channelIds = [...selectedChannelIds];
		const defaultTiming = newGroupMode === 'GROUP_SPREAD' ? 150 : 0;

		const offsets: ChannelGroupOffset[] = channelIds.map((cid, i) => ({
			channelId: cid,
			hueOffset: 0,
			brightnessOffset: 0,
			timingOffsetMs: newGroupMode === 'GROUP_SPREAD' ? i * defaultTiming : 0
		}));

		const group: ChannelGroup = {
			id: `group-${Date.now()}`,
			name: newGroupName.trim(),
			mode: newGroupMode,
			channelIds,
			offsets,
			defaultTimingOffsetMs: defaultTiming
		};

		oncreateGroup(group);
		resetCreateForm();
	}

	function resetCreateForm() {
		creating = false;
		newGroupName = '';
		newGroupMode = 'GROUP_MIRROR';
		selectedChannelIds = new Set();
	}

	function handleModeChange(group: ChannelGroup, mode: GroupMode) {
		const defaultTiming = mode === 'GROUP_SPREAD' ? 150 : 0;
		const updatedOffsets = group.offsets.map((o, i) => ({
			...o,
			timingOffsetMs: mode === 'GROUP_SPREAD' ? i * defaultTiming : 0
		}));
		onupdateGroup({ ...group, mode, offsets: updatedOffsets, defaultTimingOffsetMs: defaultTiming });
	}

	function handleOffsetChange(
		group: ChannelGroup,
		channelId: string,
		field: keyof ChannelGroupOffset,
		value: number
	) {
		const updatedOffsets = group.offsets.map((o) =>
			o.channelId === channelId ? { ...o, [field]: value } : o
		);
		onupdateGroup({ ...group, offsets: updatedOffsets });
	}

	function handleUnlink(groupId: string, channelId: string) {
		const key = `${groupId}:${channelId}`;
		unlinkedChannels = new Set([...unlinkedChannels, key]);
		onunlinkChannel(groupId, channelId);
	}

	function handleRelink(groupId: string, channelId: string) {
		const key = `${groupId}:${channelId}`;
		const next = new Set(unlinkedChannels);
		next.delete(key);
		unlinkedChannels = next;
		onrelinkChannel(groupId, channelId);
	}

	function isUnlinked(groupId: string, channelId: string): boolean {
		return unlinkedChannels.has(`${groupId}:${channelId}`);
	}

	function getChannelName(id: string): string {
		return channels.find((c) => c.id === id)?.displayName ?? id;
	}
</script>

<div class="flex flex-col gap-3 p-3" style="background: var(--surface);">
	<div class="flex items-center justify-between">
		<span class="text-sm font-semibold text-[var(--text)]">Channel Groups</span>
		<button
			class="btn btn-ghost text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
			onclick={() => (creating = !creating)}
		>
			{creating ? 'Cancel' : '+ New Group'}
		</button>
	</div>

	<!-- Create new group form -->
	{#if creating}
		<div class="flex flex-col gap-2 p-3 rounded-lg border border-[var(--accent)]/30" style="background: var(--bg);">
			<input
				type="text"
				class="input text-xs px-2 py-1.5"
				placeholder="Group name"
				bind:value={newGroupName}
			/>

			<!-- Mode select -->
			<div class="flex gap-1">
				{#each groupModes as mode}
					<button
						class="flex-1 px-2 py-1 rounded text-xs transition-colors
							{newGroupMode === mode.value
							? 'bg-[var(--accent)] text-white'
							: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
						onclick={() => (newGroupMode = mode.value)}
						title={mode.description}
					>
						{mode.label}
					</button>
				{/each}
			</div>

			<!-- Channel selection -->
			<div class="flex flex-col gap-1">
				<span class="text-xs text-[var(--text-muted)]">Select channels (min 2):</span>
				<div class="flex flex-wrap gap-1">
					{#each channels as ch}
						<button
							class="px-2 py-0.5 rounded text-xs transition-colors
								{selectedChannelIds.has(ch.id)
								? 'bg-[var(--accent)] text-white'
								: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
							onclick={() => toggleChannelSelection(ch.id)}
						>
							{ch.displayName}
						</button>
					{/each}
				</div>
			</div>

			<button
				class="btn btn-primary text-xs"
				disabled={!newGroupName.trim() || selectedChannelIds.size < 2}
				onclick={handleCreateGroup}
			>
				Create Group
			</button>
		</div>
	{/if}

	<!-- Existing groups -->
	{#if groups.length === 0 && !creating}
		<p class="text-xs text-[var(--text-muted)] text-center py-4">
			No channel groups yet. Create one to link channels together.
		</p>
	{/if}

	{#each groups as group (group.id)}
		<div class="rounded-lg border border-[var(--surface2)] overflow-hidden">
			<!-- Group header -->
			<button
				class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--surface2)]/50"
				style="background: var(--surface2);"
				onclick={() => (expandedGroupId = expandedGroupId === group.id ? null : group.id)}
			>
				<span class="text-xs text-[var(--text-muted)]">
					{expandedGroupId === group.id ? '▼' : '▶'}
				</span>
				<span class="text-xs font-medium text-[var(--text)] flex-1">{group.name}</span>
				<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
					{group.mode.replace('GROUP_', '')}
				</span>
				<span class="text-[10px] text-[var(--text-muted)]">
					{group.channelIds.length} ch
				</span>
			</button>

			<!-- Expanded content -->
			{#if expandedGroupId === group.id}
				<div class="p-3 flex flex-col gap-2" style="background: var(--bg);">
					<!-- Mode selector -->
					<div class="flex gap-1">
						{#each groupModes as mode}
							<button
								class="flex-1 px-2 py-1 rounded text-xs transition-colors
									{group.mode === mode.value
									? 'bg-[var(--accent)] text-white'
									: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
								onclick={() => handleModeChange(group, mode.value)}
								title={mode.description}
							>
								{mode.label}
							</button>
						{/each}
					</div>

					<!-- Per-channel offsets -->
					{#each group.offsets as offset (offset.channelId)}
						{@const linked = !isUnlinked(group.id, offset.channelId)}
						<div class="flex flex-col gap-1 p-2 rounded border border-[var(--surface2)]
							{linked ? '' : 'opacity-50'}">
							<div class="flex items-center justify-between">
								<span class="text-xs text-[var(--text)]">
									{linked ? '🔗' : '⛓️‍💥'} {getChannelName(offset.channelId)}
								</span>
								<button
									class="text-[10px] px-1.5 py-0.5 rounded transition-colors
										{linked
										? 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--danger)]'
										: 'bg-[var(--accent)]/20 text-[var(--accent)]'}"
									onclick={() =>
										linked
											? handleUnlink(group.id, offset.channelId)
											: handleRelink(group.id, offset.channelId)}
								>
									{linked ? 'Unlink' : 'Relink'}
								</button>
							</div>

							{#if linked}
								<div class="grid grid-cols-3 gap-2">
									<!-- Hue offset -->
									<div class="flex flex-col gap-0.5">
										<span class="text-[10px] text-[var(--text-muted)]">Hue</span>
										<input
											type="number"
											min="-180"
											max="180"
											value={offset.hueOffset}
											class="input text-[10px] px-1 py-0.5 w-full"
											onchange={(e) =>
												handleOffsetChange(group, offset.channelId, 'hueOffset', parseInt(e.currentTarget.value) || 0)}
										/>
									</div>
									<!-- Brightness offset -->
									<div class="flex flex-col gap-0.5">
										<span class="text-[10px] text-[var(--text-muted)]">Bright</span>
										<input
											type="number"
											min="-100"
											max="100"
											value={offset.brightnessOffset}
											class="input text-[10px] px-1 py-0.5 w-full"
											onchange={(e) =>
												handleOffsetChange(group, offset.channelId, 'brightnessOffset', parseInt(e.currentTarget.value) || 0)}
										/>
									</div>
									<!-- Timing offset -->
									<div class="flex flex-col gap-0.5">
										<span class="text-[10px] text-[var(--text-muted)]">Timing</span>
										<input
											type="number"
											min="0"
											max="2000"
											step="10"
											value={offset.timingOffsetMs}
											class="input text-[10px] px-1 py-0.5 w-full"
											onchange={(e) =>
												handleOffsetChange(group, offset.channelId, 'timingOffsetMs', Math.max(0, Math.min(2000, parseInt(e.currentTarget.value) || 0)))}
										/>
									</div>
								</div>
							{/if}
						</div>
					{/each}

					<!-- Delete group -->
					<button
						class="btn btn-danger text-xs mt-1"
						onclick={() => ondeleteGroup(group.id)}
					>
						Delete Group
					</button>
				</div>
			{/if}
		</div>
	{/each}
</div>
