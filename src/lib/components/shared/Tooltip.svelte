<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		text,
		position = 'top',
		children
	}: {
		text: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		children: Snippet;
	} = $props();

	let show = $state(false);
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;

	function handleEnter() {
		hoverTimer = setTimeout(() => {
			show = true;
		}, 300);
	}

	function handleLeave() {
		clearTimeout(hoverTimer);
		show = false;
	}

	const positionClasses: Record<string, string> = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
		left: 'right-full top-1/2 -translate-y-1/2 mr-2',
		right: 'left-full top-1/2 -translate-y-1/2 ml-2'
	};

	const arrowClasses: Record<string, string> = {
		top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--surface2)] border-x-transparent border-b-transparent',
		bottom:
			'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--surface2)] border-x-transparent border-t-transparent',
		left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--surface2)] border-y-transparent border-r-transparent',
		right:
			'right-full top-1/2 -translate-y-1/2 border-r-[var(--surface2)] border-y-transparent border-l-transparent'
	};
</script>

<div
	class="relative inline-flex"
	onmouseenter={handleEnter}
	onmouseleave={handleLeave}
	role="tooltip"
>
	{@render children()}

	{#if show && text}
		<div
			class="absolute z-50 pointer-events-none {positionClasses[position]}"
		>
			<div
				class="relative px-2 py-1 rounded text-xs whitespace-nowrap"
				style="background: var(--surface2); color: var(--text);"
			>
				{text}
				<span
					class="absolute w-0 h-0 border-4 {arrowClasses[position]}"
				></span>
			</div>
		</div>
	{/if}
</div>
