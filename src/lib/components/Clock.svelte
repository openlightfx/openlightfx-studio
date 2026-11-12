<script lang="ts">
  import { onMount } from 'svelte';
  import { formatTimecode } from '$lib/engine/time';
  import { editor } from '$lib/state/editor.svelte';

  let text = $state('0:00:00:00');
  onMount(() => {
    const update = () => {
      text = formatTimecode(editor.playheadMs, editor.fps);
    };
    update();
    const id = setInterval(update, 80);
    return () => clearInterval(id);
  });
</script>

<span class="mono">{text}</span>
