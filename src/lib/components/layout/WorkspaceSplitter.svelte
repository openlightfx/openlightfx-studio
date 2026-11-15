<script lang="ts">
  let { label, orientation, value, min, max, onresize } = $props<{
    label: string;
    orientation: 'vertical' | 'horizontal';
    value: number;
    min: number;
    max: number;
    onresize: (value: number) => void;
  }>();
  let pointerId: number | null = null;
  let startCoordinate = 0;
  let startValue = 0;
  let node: HTMLElement;

  function coordinate(event: PointerEvent) {
    return orientation === 'vertical' ? event.clientX : event.clientY;
  }
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    startCoordinate = coordinate(event);
    startValue = value;
    node.setPointerCapture(pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    const delta = coordinate(event) - startCoordinate;
    onresize(
      Math.max(min, Math.min(max, startValue + (orientation === 'vertical' ? -delta : -delta)))
    );
  }
  function finish(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    const activeId = pointerId;
    pointerId = null;
    if (node.hasPointerCapture(activeId)) node.releasePointerCapture(activeId);
  }
  function cancel(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    onresize(startValue);
    finish(event);
  }
  function installInteractions(element: HTMLElement) {
    element.tabIndex = 0;
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', cancel);
    element.addEventListener('lostpointercapture', cancel);
    element.addEventListener('keydown', keydown);
    return {
      destroy() {
        if (pointerId !== null) cancel(new PointerEvent('pointercancel', { pointerId }));
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', finish);
        element.removeEventListener('pointercancel', cancel);
        element.removeEventListener('lostpointercapture', cancel);
        element.removeEventListener('keydown', keydown);
      },
    };
  }
  function keydown(event: KeyboardEvent) {
    let next: number | undefined;
    if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = value + (event.shiftKey ? 40 : 10);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = value - (event.shiftKey ? 40 : 10);
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onresize(Math.max(min, Math.min(max, next)));
  }
</script>

<section
  bind:this={node}
  class="splitter"
  class:vertical={orientation === 'vertical'}
  role="separator"
  aria-label={label}
  aria-orientation={orientation}
  aria-valuenow={value}
  aria-valuemin={min}
  aria-valuemax={max}
  use:installInteractions
></section>

<style>
  .splitter {
    border: 0;
    padding: 0;
    position: relative;
    z-index: 2;
    background: var(--border);
    touch-action: none;
    outline: none;
  }
  .splitter:focus-visible {
    background: var(--accent);
  }
  .splitter::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .splitter.vertical {
    width: 7px;
    cursor: col-resize;
  }
  .splitter.vertical::after {
    left: -5px;
    right: -5px;
  }
  .splitter:not(.vertical) {
    height: 7px;
    cursor: row-resize;
  }
  .splitter:not(.vertical)::after {
    top: -5px;
    bottom: -5px;
  }
  @media (prefers-reduced-motion: reduce) {
    .splitter {
      transition: none;
    }
  }
</style>
