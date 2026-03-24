<script lang="ts">
	import { CHANNEL_TEMPLATES } from '$lib/types';
	import Modal from '$lib/components/shared/Modal.svelte';

	let {
		open,
		onclose,
		onapply
	}: {
		open: boolean;
		onclose: () => void;
		onapply: (channels: Array<{ id: string; displayName: string; spatialHint: string }>) => void;
	} = $props();

	let selectedIndex = $state<number | null>(null);

	const selectedTemplate = $derived(
		selectedIndex !== null ? CHANNEL_TEMPLATES[selectedIndex] : null
	);

	function handleApply() {
		if (!selectedTemplate) return;
		onapply(
			selectedTemplate.channels.map((ch) => ({
				id: ch.id,
				displayName: ch.displayName,
				spatialHint: ch.spatialHint
			}))
		);
		selectedIndex = null;
		onclose();
	}

	function handleClose() {
		selectedIndex = null;
		onclose();
	}
</script>

<Modal {open} title="Channel Templates" onclose={handleClose}>
	{#snippet children()}
		<div class="flex flex-col gap-2">
			<p class="text-xs text-[var(--text-muted)] mb-2">
				Select a template to quickly set up channels for your track.
			</p>

			<div class="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
				{#each CHANNEL_TEMPLATES as template, i}
					<button
						class="text-left p-3 rounded-lg border transition-colors cursor-pointer
							{selectedIndex === i
							? 'border-[var(--accent)] bg-[var(--accent)]/10'
							: 'border-[var(--surface2)] hover:border-[var(--text-muted)]'}"
						style="background: {selectedIndex === i ? '' : 'var(--surface2)'};"
						onclick={() => (selectedIndex = i)}
					>
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm font-medium text-[var(--text)]">
								{template.name}
							</span>
							<span class="text-xs text-[var(--text-muted)]">
								{template.channels.length} ch
							</span>
						</div>
						<p class="text-xs text-[var(--text-muted)]">{template.description}</p>
					</button>
				{/each}
			</div>

			<!-- Preview -->
			{#if selectedTemplate}
				<div class="mt-2 p-3 rounded-lg border border-[var(--surface2)]" style="background: var(--bg);">
					<span class="text-xs text-[var(--text-muted)] block mb-1.5">Channel IDs:</span>
					<div class="flex flex-wrap gap-1.5">
						{#each selectedTemplate.channels as ch}
							<span
								class="px-2 py-0.5 rounded text-xs font-mono bg-[var(--surface2)] text-[var(--accent2)]"
							>
								{ch.id}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={handleClose}>Cancel</button>
		<button
			class="btn btn-primary"
			disabled={selectedIndex === null}
			onclick={handleApply}
		>
			Apply Template
		</button>
	{/snippet}
</Modal>
