<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';

	let {
		open,
		existingIds,
		onclose,
		oncreate
	}: {
		open: boolean;
		existingIds: string[];
		onclose: () => void;
		oncreate: (channel: { id: string; displayName: string; spatialHint: string }) => void;
	} = $props();

	let channelId = $state('');
	let displayName = $state('');
	let spatialHint = $state('SPATIAL_UNSPECIFIED');

	const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

	const idError = $derived.by(() => {
		if (!channelId) return 'Channel ID is required';
		if (!ID_PATTERN.test(channelId)) return 'Only lowercase letters, numbers, hyphens, underscores (1-64 chars)';
		if (existingIds.includes(channelId)) return 'Channel ID already exists';
		return null;
	});

	const isValid = $derived(!idError && displayName.trim().length > 0);

	const spatialHints = [
		'SPATIAL_UNSPECIFIED',
		'SPATIAL_LEFT',
		'SPATIAL_RIGHT',
		'SPATIAL_CENTER',
		'SPATIAL_SURROUND_LEFT',
		'SPATIAL_SURROUND_RIGHT',
		'SPATIAL_AMBIENT'
	];

	function handleCreate() {
		if (!isValid) return;
		oncreate({
			id: channelId,
			displayName: displayName.trim(),
			spatialHint
		});
		resetForm();
		onclose();
	}

	function handleClose() {
		resetForm();
		onclose();
	}

	function resetForm() {
		channelId = '';
		displayName = '';
		spatialHint = 'SPATIAL_UNSPECIFIED';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && isValid) {
			handleCreate();
		}
	}
</script>

<Modal {open} title="Create Channel" onclose={handleClose}>
	{#snippet children()}
		<div class="flex flex-col gap-4" onkeydown={handleKeydown}>
			<!-- Channel ID -->
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-[var(--text)]" for="channel-id">
					Channel ID
				</label>
				<input
					id="channel-id"
					type="text"
					class="input text-sm px-3 py-2"
					placeholder="e.g. left, surround-right, ambient_01"
					maxlength={64}
					bind:value={channelId}
				/>
				{#if channelId && idError}
					<span class="text-xs text-[var(--danger)]">{idError}</span>
				{:else if channelId && !idError}
					<span class="text-xs text-[var(--success)]">✓ Valid ID</span>
				{/if}
			</div>

			<!-- Display Name -->
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-[var(--text)]" for="display-name">
					Display Name
				</label>
				<input
					id="display-name"
					type="text"
					class="input text-sm px-3 py-2"
					placeholder="e.g. Left Speaker, Ambient"
					bind:value={displayName}
				/>
			</div>

			<!-- Spatial Hint -->
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-[var(--text)]" for="spatial-hint">
					Spatial Hint
				</label>
				<select
					id="spatial-hint"
					class="input text-sm px-3 py-2"
					bind:value={spatialHint}
				>
					{#each spatialHints as hint}
						<option value={hint}>
							{hint.replace('SPATIAL_', '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
						</option>
					{/each}
				</select>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={handleClose}>Cancel</button>
		<button
			class="btn btn-primary"
			disabled={!isValid}
			onclick={handleCreate}
		>
			Create Channel
		</button>
	{/snippet}
</Modal>
