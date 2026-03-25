<script lang="ts">
  import { Modal } from '$lib/components/shared/index.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';

  let open = $derived(uiStore.state.activeModal === 'about');

  function handleClose() {
    uiStore.closeModal();
  }
</script>

<Modal {open} title="About OpenLightFX Studio" onclose={handleClose} size="sm">
  <div class="flex flex-col items-center gap-4 py-4 text-center">
    <img src="/logo.svg" alt="OpenLightFX" class="h-12 w-12" />

    <div>
      <h2 class="text-lg font-semibold text-text-base">OpenLightFX Studio</h2>
      <p class="mt-1 text-sm text-textMuted">v0.1.0</p>
    </div>

    <p class="max-w-sm text-sm text-textMuted">
      A browser-based lighting track editor for creating synchronized lighting effects for movies
      and video content.
    </p>

    <div class="flex flex-col gap-1 text-xs text-textMuted">
      <p>Built with SvelteKit, Tailwind CSS, and Protobuf</p>
      <p>
        <a
          href="https://github.com/openlightfx"
          target="_blank"
          rel="noopener noreferrer"
          class="text-accent hover:underline"
        >
          github.com/openlightfx
        </a>
      </p>
    </div>
  </div>
</Modal>
