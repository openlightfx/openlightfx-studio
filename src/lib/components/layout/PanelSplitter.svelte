<script lang="ts">
  let {
    direction,
    onresize,
  }: {
    direction: 'horizontal' | 'vertical';
    onresize: (delta: number) => void;
  } = $props();

  let dragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    dragging = true;
    document.body.style.userSelect = 'none';
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const delta = direction === 'vertical' ? e.movementX : e.movementY;
    onresize(delta);
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    dragging = false;
    document.body.style.userSelect = '';
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  role="separator"
  aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
  tabindex={0}
  class="flex-shrink-0 transition-colors {direction === 'vertical'
    ? 'w-[var(--splitter-size)] cursor-col-resize'
    : 'h-[var(--splitter-size)] cursor-row-resize'}
    {dragging ? 'bg-[var(--splitter-hover)]' : 'bg-[var(--splitter-color)] hover:bg-[var(--splitter-hover)]'}"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
></div>
