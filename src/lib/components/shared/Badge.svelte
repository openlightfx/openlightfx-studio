<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'accent',
		children
	}: {
		variant?: 'accent' | 'danger' | 'success' | 'warning' | 'muted';
		children: Snippet;
	} = $props();

	const variantClasses: Record<string, string> = {
		accent: 'bg-accent/20 text-accent',
		danger: 'bg-danger/20 text-danger',
		success: 'bg-success/20 text-success',
		warning: 'bg-warning/20 text-warning',
		muted: 'bg-[var(--surface2)] text-[var(--text-muted)]'
	};
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {variantClasses[variant]}">
	{@render children()}
</span>
