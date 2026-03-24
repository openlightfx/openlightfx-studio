<script lang="ts">
	let {
		size = 'md'
	}: {
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const sizeClasses: Record<string, string> = {
		sm: 'w-4 h-4 border-2',
		md: 'w-6 h-6 border-2',
		lg: 'w-10 h-10 border-[3px]'
	};
</script>

<div
	class="animate-spin rounded-full border-accent border-t-transparent {sizeClasses[size]}"
	role="status"
	aria-label="Loading"
></div>
