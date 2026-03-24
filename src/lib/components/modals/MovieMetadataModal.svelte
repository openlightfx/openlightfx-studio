<script lang="ts">
	import type { MovieReference } from '$lib/types';
	import Modal from '$lib/components/shared/Modal.svelte';

	let {
		open,
		metadata,
		prefillData = null,
		onclose,
		onsave
	}: {
		open: boolean;
		metadata: MovieReference;
		prefillData?: Partial<MovieReference> | null;
		onclose: () => void;
		onsave: (metadata: MovieReference) => void;
	} = $props();

	let title = $state('');
	let year = $state(new Date().getFullYear());
	let imdbId = $state('');
	let tmdbId = $state('');
	let runtimeMinutes = $state(0);

	let imdbError = $state('');
	let tmdbError = $state('');

	// Sync form state when the modal opens or metadata changes
	$effect(() => {
		if (open) {
			title = prefillData?.title ?? metadata.title ?? '';
			year = prefillData?.year ?? metadata.year ?? new Date().getFullYear();
			imdbId = prefillData?.imdbId ?? metadata.imdbId ?? '';
			runtimeMinutes = prefillData?.runtimeMinutes ?? metadata.runtimeMinutes ?? 0;
			tmdbId = '';
			imdbError = '';
			tmdbError = '';
		}
	});

	function validateImdbId(value: string): boolean {
		if (!value) return true;
		if (!/^tt\d{7,}$/.test(value)) {
			imdbError = 'Must match format: tt followed by 7+ digits (e.g. tt1234567)';
			return false;
		}
		imdbError = '';
		return true;
	}

	function validateTmdbId(value: string): boolean {
		if (!value) return true;
		if (!/^\d+$/.test(value)) {
			tmdbError = 'TMDB ID must be a numeric value';
			return false;
		}
		tmdbError = '';
		return true;
	}

	function handleSave() {
		const imdbValid = validateImdbId(imdbId);
		const tmdbValid = validateTmdbId(tmdbId);

		if (!imdbValid || !tmdbValid) return;

		onsave({
			title,
			year: Number(year) || new Date().getFullYear(),
			imdbId,
			runtimeMinutes: Number(runtimeMinutes) || 0
		});
	}
</script>

<Modal {open} title="Movie Metadata" {onclose}>
	{#snippet children()}
		<div class="flex flex-col gap-4">
			<!-- Title -->
			<label class="flex flex-col gap-1">
				<span class="text-sm text-[var(--text-muted)]">Movie Title</span>
				<input
					type="text"
					bind:value={title}
					placeholder="e.g. Blade Runner 2049"
					class="input-field"
				/>
			</label>

			<!-- Year -->
			<label class="flex flex-col gap-1">
				<span class="text-sm text-[var(--text-muted)]">Year</span>
				<input
					type="number"
					bind:value={year}
					min="1888"
					max="2099"
					class="input-field"
				/>
			</label>

			<!-- Runtime -->
			<label class="flex flex-col gap-1">
				<span class="text-sm text-[var(--text-muted)]">Runtime (minutes)</span>
				<input
					type="number"
					bind:value={runtimeMinutes}
					min="0"
					class="input-field"
				/>
			</label>

			<!-- IMDB ID -->
			<label class="flex flex-col gap-1">
				<span class="text-sm text-[var(--text-muted)]">IMDB ID</span>
				<input
					type="text"
					bind:value={imdbId}
					placeholder="tt1234567"
					class="input-field"
					oninput={() => validateImdbId(imdbId)}
				/>
				{#if imdbError}
					<span class="text-xs text-red-400">{imdbError}</span>
				{/if}
			</label>

			<!-- TMDB ID -->
			<label class="flex flex-col gap-1">
				<span class="text-sm text-[var(--text-muted)]">TMDB ID</span>
				<input
					type="text"
					bind:value={tmdbId}
					placeholder="12345"
					class="input-field"
					oninput={() => validateTmdbId(tmdbId)}
				/>
				{#if tmdbError}
					<span class="text-xs text-red-400">{tmdbError}</span>
				{/if}
				<span class="text-xs text-[var(--text-muted)]">
					Find your movie on
					<span class="text-[var(--accent2)]">themoviedb.org</span>
					and copy the numeric ID from the URL
				</span>
			</label>
		</div>
	{/snippet}

	{#snippet footer()}
		<button
			class="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
			onclick={onclose}
		>
			Cancel
		</button>
		<button
			class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
			style="background: var(--accent);"
			onclick={handleSave}
		>
			Save
		</button>
	{/snippet}
</Modal>

<style>
	:global(.input-field) {
		background: var(--bg);
		border: 1px solid var(--surface2);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		color: var(--text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}

	:global(.input-field:focus) {
		border-color: var(--accent);
	}

	:global(.input-field::placeholder) {
		color: var(--text-muted);
	}
</style>
