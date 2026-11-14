<script lang="ts">
  import { onMount } from 'svelte';
  import EditorScreen from '$lib/components/EditorScreen.svelte';
  import LibraryScreen from '$lib/components/LibraryScreen.svelte';
  import MovieSelectionScreen from '$lib/components/MovieSelectionScreen.svelte';
  import RoomsScreen from '$lib/components/rooms/RoomsScreen.svelte';
  import { loadRooms } from '$lib/api/rooms';
  import { StudioSession } from '$lib/studio/session.svelte';

  const session = new StudioSession();
  let hashRoute = $state('');
  let bootedEditorRoute = '';

  onMount(() => {
    const updateRoute = () => {
      hashRoute = location.hash || '';
      if (hashRoute) localStorage.setItem('olfx-last-route', hashRoute);
      if (hashRoute.startsWith('#/edit/') && hashRoute !== bootedEditorRoute) {
        bootedEditorRoute = hashRoute;
        void session.boot().then(() => {
          document.body.dataset.frameP95Ms = String(session.frameP95);
        });
      } else if (!hashRoute.startsWith('#/edit/')) {
        bootedEditorRoute = '';
        session.cancelBoot();
      }
    };
    updateRoute();
    window.addEventListener('hashchange', updateRoute);
    if (!location.hash) {
      void loadRooms()
        .then((rooms) => {
          if (location.hash) return;
          const lastRoute = localStorage.getItem('olfx-last-route');
          const validLastRoute =
            /^#\/(rooms(?:\/[^/?]+)?|library|movie\/[^/?]+|edit\/[^/?]+\/[^/?]+)$/.test(
              lastRoute ?? ''
            );
          location.hash =
            rooms.length === 0 ? '#/rooms' : validLastRoute ? lastRoute! : '#/library';
        })
        .catch(() => {
          if (!location.hash) location.hash = '#/rooms';
        });
    }

    document.body.dataset.frameP95Ms = String(session.frameP95);
    const stopAutosave = session.startAutosave();
    let frame = 0;
    const loop = () => {
      session.syncFromVideo();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('hashchange', updateRoute);
      stopAutosave();
      cancelAnimationFrame(frame);
    };
  });

  function onKeydown(event: KeyboardEvent) {
    if (!hashRoute.startsWith('#/edit/')) return;
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      if (typing) return;
      event.preventDefault();
      session.helpOpen = true;
      return;
    }
    if (typing) return;
    if (target?.tagName === 'BUTTON' && event.key === ' ') return;

    const key = event.key;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && key.toLowerCase() === 's') {
      event.preventDefault();
      void session.save();
      return;
    }
    if (ctrl && event.shiftKey && key.toLowerCase() === 'z') {
      event.preventDefault();
      session.redo();
      return;
    }
    if (ctrl && key.toLowerCase() === 'z') {
      event.preventDefault();
      session.undo();
      return;
    }
    if (key === ' ' || key === 'Spacebar') {
      event.preventDefault();
      session.togglePlay();
      return;
    }
    if (key === 'k' || key === 'K') {
      session.addAtPlayhead();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      session.deleteSelection();
      return;
    }
    if (key === 'ArrowRight' && event.shiftKey) {
      event.preventDefault();
      session.skip(1);
      return;
    }
    if (key === 'ArrowLeft' && event.shiftKey) {
      event.preventDefault();
      session.skip(-1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      session.step(1);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      session.step(-1);
      return;
    }
    if (key === 'i' || key === 'I') {
      void session.eyedrop();
      return;
    }
    if (key === ']' || key === '[' || key === '\\' || key === '+' || key === '=' || key === '0') {
      session.zoomKey(key, ctrl);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if !hashRoute}
  <div class="route-loading" role="status">Loading OpenLightFX Studio…</div>
{:else if hashRoute.startsWith('#/rooms')}
  <RoomsScreen />
{:else if hashRoute.startsWith('#/library')}
  <LibraryScreen />
{:else if hashRoute.startsWith('#/movie/')}
  <MovieSelectionScreen />
{:else if hashRoute.startsWith('#/edit/')}
  <EditorScreen {session} bindVideo={(node) => session.bindVideo(node)} />
{:else}
  <div class="route-loading" role="alert">
    That Studio page could not be found. <a href="#/library">Open the Library</a>
  </div>
{/if}

<style>
  :global(html),
  :global(body) {
    min-height: 100%;
    margin: 0;
  }
  .route-loading {
    min-height: 100vh;
    padding: 2rem;
    color: #ddd;
    background: #0b0b16;
  }
</style>
