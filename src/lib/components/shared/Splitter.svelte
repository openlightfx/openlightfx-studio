<script lang="ts">
	let {
		direction,
		minSize,
		initialSize,
		onresize
	}: {
		direction: 'horizontal' | 'vertical';
		minSize: number;
		initialSize: number;
		onresize: (size: number) => void;
	} = $props();

	let dragging = $state(false);
	let startPos = 0;
	let startSize = 0;

	const isHorizontal = $derived(direction === 'horizontal');

	function handlePointerDown(e: PointerEvent) {
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		dragging = true;
		startPos = isHorizontal ? e.clientX : e.clientY;
		startSize = initialSize;
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
		const newSize = Math.max(minSize, startSize + delta);
		onresize(newSize);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!dragging) return;
		const target = e.currentTarget as HTMLElement;
		target.releasePointerCapture(e.pointerId);
		dragging = false;
	}
</script>

<div
	class="flex-shrink-0 {isHorizontal
		? 'w-1 cursor-col-resize h-full'
		: 'h-1 cursor-row-resize w-full'}
		{dragging ? 'bg-accent' : 'bg-[var(--surface2)] hover:bg-accent'} transition-colors"
	role="separator"
	aria-orientation={direction}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
></div>
