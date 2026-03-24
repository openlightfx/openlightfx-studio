<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';

	let {
		open,
		validationErrors = [],
		durationWarning = null,
		hasMovieMetadata = false,
		onclose,
		onexport,
		onopenmoviemodal
	}: {
		open: boolean;
		validationErrors?: string[];
		durationWarning?: string | null;
		hasMovieMetadata?: boolean;
		onclose: () => void;
		onexport: (type: 'lightfx' | 'marketplace' | 'project') => void;
		onopenmoviemodal?: () => void;
	} = $props();

	let hasErrors = $derived(validationErrors.length > 0);

	function handleExport(type: 'lightfx' | 'marketplace' | 'project') {
		if (type === 'marketplace' && !hasMovieMetadata && onopenmoviemodal) {
			onopenmoviemodal();
			return;
		}
		onexport(type);
	}
</script>

<Modal {open} title="Export Track" {onclose}>
	{#snippet children()}
		<div class="flex flex-col gap-4">
			<!-- Validation summary -->
			{#if hasErrors}
				<div class="rounded-lg p-3 border border-red-500/30" style="background: rgba(239, 68, 68, 0.08);">
					<h3 class="text-sm font-medium text-red-400 mb-2">
						Validation Errors ({validationErrors.length})
					</h3>
					<ul class="list-disc list-inside text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
						{#each validationErrors as error}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Duration mismatch warning -->
			{#if durationWarning}
				<div class="rounded-lg p-3 border border-yellow-500/30" style="background: rgba(234, 179, 8, 0.08);">
					<div class="flex items-start gap-2">
						<span class="text-yellow-400 text-sm mt-0.5">⚠</span>
						<span class="text-xs text-yellow-300">{durationWarning}</span>
					</div>
				</div>
			{/if}

			<!-- Movie metadata prompt -->
			{#if !hasMovieMetadata}
				<div class="rounded-lg p-3 border border-[var(--accent)]/30" style="background: rgba(108, 99, 255, 0.08);">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-[var(--text-muted)]">
							Movie metadata is missing. Required for marketplace publishing.
						</span>
						{#if onopenmoviemodal}
							<button
								class="px-3 py-1 text-xs rounded-md whitespace-nowrap font-medium text-white transition-colors"
								style="background: var(--accent);"
								onclick={onopenmoviemodal}
							>
								Add Metadata
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Export options -->
			<div class="flex flex-col gap-2">
				<button
					class="export-option group"
					onclick={() => handleExport('lightfx')}
					disabled={hasErrors}
				>
					<div class="flex items-center gap-3">
						<div
							class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
							style="background: var(--surface2);"
						>
							<svg class="w-4 h-4 text-[var(--accent2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
						</div>
						<div class="text-left">
							<div class="text-sm font-medium text-[var(--text)]">Export .lightfx</div>
							<div class="text-xs text-[var(--text-muted)]">Protobuf binary for playback in Emby</div>
						</div>
					</div>
				</button>

				<button
					class="export-option group"
					onclick={() => handleExport('marketplace')}
					disabled={hasErrors}
				>
					<div class="flex items-center gap-3">
						<div
							class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
							style="background: var(--surface2);"
						>
							<svg class="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
							</svg>
						</div>
						<div class="text-left">
							<div class="text-sm font-medium text-[var(--text)]">Export for Marketplace</div>
							<div class="text-xs text-[var(--text-muted)]">Publish to the OpenLightFX community</div>
						</div>
					</div>
				</button>

				<button
					class="export-option group"
					onclick={() => handleExport('project')}
				>
					<div class="flex items-center gap-3">
						<div
							class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
							style="background: var(--surface2);"
						>
							<svg class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
							</svg>
						</div>
						<div class="text-left">
							<div class="text-sm font-medium text-[var(--text)]">Save Project</div>
							<div class="text-xs text-[var(--text-muted)]">Full project file with editor state</div>
						</div>
					</div>
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<button
			class="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
			onclick={onclose}
		>
			Close
		</button>
	{/snippet}
</Modal>

<style>
	.export-option {
		width: 100%;
		padding: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid var(--surface2);
		background: transparent;
		cursor: pointer;
		transition: all 0.15s;
	}

	.export-option:hover:not(:disabled) {
		background: var(--surface2);
		border-color: var(--accent);
	}

	.export-option:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
