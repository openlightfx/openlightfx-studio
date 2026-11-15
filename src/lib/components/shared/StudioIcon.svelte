<script lang="ts">
  // One stroke-based icon vocabulary for Studio chrome. Lighting colors remain content.
  let { name, size = 20 }: { name: string; size?: number } = $props();
  const paths: Record<string, string> = {
    bulb: 'M9 18h6M10 21h4M8.5 14.5a6 6 0 1 1 7 0C14.5 15.2 15 16 15 16H9s.5-.8-.5-1.5Z',
    room: 'M3 21V3h18v18H3Zm5 0V8h8v13M12 14h.01',
    library: 'M4 4h6v16H4V4Zm10 0h6v16h-6V4ZM4 8h6m4 0h6',
    help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    back: 'M19 12H5m6-6-6 6 6 6',
    play: 'm8 5 11 7-11 7V5Z',
    pause: 'M8 5v14M16 5v14',
    previous: 'M5 5v14M19 5 8 12l11 7V5Z',
    next: 'M19 5v14M5 5l11 7-11 7V5Z',
    rewind: 'm11 5-9 7 9 7V5Zm11 0-9 7 9 7V5Z',
    forward: 'm2 5 9 7-9 7V5Zm11 0 9 7-9 7V5Z',
    undo: 'M3 10h11a6 6 0 0 1 0 12M3 10l6-6M3 10l6 6',
    redo: 'M21 10H10a6 6 0 0 0 0 12m11-12-6-6m6 6-6 6',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
    check: 'm5 12 4 4L19 6',
    screen: 'M3 4h18v13H3V4Zm5 17h8m-4-4v4',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"><path d={paths[name] ?? paths.bulb} /></svg
>
