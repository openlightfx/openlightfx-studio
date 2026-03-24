<script lang="ts">
  import { onMount } from 'svelte';

  let {
    direction = 'horizontal',
    onresize,
  }: {
    direction?: 'horizontal' | 'vertical';
    onresize?: (delta: number) => void;
  } = $props();

  let dragging = $state(false);
  let startPos = 0;

  function handlePointerDown(e: PointerEvent) {
    dragging = true;
    startPos = direction === 'horizontal' ? e.clientX : e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!dragging) return;
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    startPos = currentPos;
    onresize?.(delta);
  }

  function handlePointerUp() {
    dragging = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex-shrink-0 transition-colors"
  class:w-1={direction === 'horizontal'}
  class:h-1={direction === 'vertical'}
  class:cursor-col-resize={direction === 'horizontal'}
  class:cursor-row-resize={direction === 'vertical'}
  class:bg-accent={dragging}
  class:bg-transparent={!dragging}
  class:hover:bg-[var(--surface2)]={!dragging}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  role="separator"
></div>
