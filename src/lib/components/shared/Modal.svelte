<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		onclose,
		children,
		footer
	}: {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === dialogEl) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="backdrop:bg-black/60 bg-transparent p-0 m-auto max-w-lg w-full outline-none"
	onclick={handleBackdropClick}
	onkeydown={handleKeydown}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
>
	{#if open}
		<div
			class="rounded-xl shadow-2xl border border-[var(--surface2)] w-full"
			style="background: var(--surface);"
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-[var(--surface2)]">
				<h2 class="text-base font-semibold text-[var(--text)]">{title}</h2>
				<button
					class="btn-icon"
					onclick={onclose}
					aria-label="Close"
				>
					✕
				</button>
			</div>

			<!-- Body -->
			<div class="px-5 py-4">
				{@render children()}
			</div>

			<!-- Footer (optional) -->
			{#if footer}
				<div class="px-5 py-3 border-t border-[var(--surface2)] flex justify-end gap-2">
					{@render footer()}
				</div>
			{/if}
		</div>
	{/if}
</dialog>
