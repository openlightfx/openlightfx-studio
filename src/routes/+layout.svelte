<script lang="ts">
  import '../app.css';
  import { uiStore } from '$lib/stores/ui.svelte.js';

  let { children } = $props();

  $effect(() => {
    document.documentElement.classList.toggle('dark', uiStore.darkMode);
  });
</script>

{@render children()}
