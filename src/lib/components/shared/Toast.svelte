<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { Toast } from '$lib/types';

	const borderColors: Record<Toast['type'], string> = {
		success: 'border-l-success',
		error: 'border-l-danger',
		warning: 'border-l-warning',
		info: 'border-l-accent2'
	};

	const icons: Record<Toast['type'], string> = {
		success: '✓',
		error: '✕',
		warning: '⚠',
		info: 'ℹ'
	};

	const iconColors: Record<Toast['type'], string> = {
		success: 'text-success',
		error: 'text-danger',
		warning: 'text-warning',
		info: 'text-accent2'
	};

	const scheduled = new Set<string>();

	$effect(() => {
		for (const toast of toastStore.toasts) {
			if (!scheduled.has(toast.id)) {
				scheduled.add(toast.id);
				setTimeout(() => {
					toastStore.remove(toast.id);
					scheduled.delete(toast.id);
				}, toast.duration);
			}
		}
	});
</script>

{#if toastStore.toasts.length > 0}
	<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
		{#each toastStore.toasts as toast (toast.id)}
			<div
				class="flex items-start gap-3 border-l-4 {borderColors[toast.type]} rounded-lg px-4 py-3 shadow-xl backdrop-blur-sm"
				style="background: rgba(26, 26, 46, 0.92);"
				role="alert"
				animate:flip={{ duration: 200 }}
				in:fly={{ x: 300, duration: 300 }}
				out:fly={{ x: 300, duration: 200 }}
			>
				<span class="text-sm font-bold mt-0.5 {iconColors[toast.type]}">{icons[toast.type]}</span>
				<p class="flex-1 text-sm text-[var(--text)]">{toast.message}</p>
				<button
					class="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm leading-none mt-0.5 cursor-pointer"
					onclick={() => toastStore.remove(toast.id)}
					aria-label="Dismiss"
				>
					✕
				</button>
			</div>
		{/each}
	</div>
{/if}
