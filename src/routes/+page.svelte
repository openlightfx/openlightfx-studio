<script lang="ts">
  import { onMount } from 'svelte';
  import EditorScreen from '$lib/components/EditorScreen.svelte';
  import BulbsScreen from '$lib/components/rooms/BulbsScreen.svelte';
  import LibraryScreen from '$lib/components/LibraryScreen.svelte';
  import MovieSelectionScreen from '$lib/components/MovieSelectionScreen.svelte';
  import RoomsScreen from '$lib/components/rooms/RoomsScreen.svelte';
  import { loadBulbs, loadRooms } from '$lib/api/rooms';
  import { StudioSession } from '$lib/studio/session.svelte';
  import { dispatchEditorCommand } from '$lib/studio/editor-commands';

  const session = new StudioSession();
  let hashRoute = $state('');
  let bootedEditorRoute = '';
  let localDev = $state(false);

  onMount(() => {
    localDev = !/\/OpenLightFX\/studio\//i.test(location.pathname);
    const syncSavedRoute = () => {
      hashRoute = location.hash;
      bootedEditorRoute = hashRoute;
    };
    const updateRoute = () => {
      const nextRoute = location.hash || '';
      if (session.dirty && hashRoute.startsWith('#/edit/') && nextRoute !== hashRoute) {
        history.replaceState(null, '', hashRoute);
        session.pendingRoute = nextRoute;
        return;
      }
      hashRoute = nextRoute;
      if (hashRoute) localStorage.setItem('olfx-last-route', hashRoute);
      if (hashRoute.startsWith('#/edit/') && hashRoute !== bootedEditorRoute) {
        bootedEditorRoute = hashRoute;
        void session.boot();
      } else if (!hashRoute.startsWith('#/edit/')) {
        bootedEditorRoute = '';
        session.cancelBoot();
      }
    };
    updateRoute();
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('olfx-editor-route-replaced', syncSavedRoute);
    if (!location.hash) {
      void Promise.all([loadRooms(), loadBulbs()])
        .then(([rooms, bulbs]) => {
          if (location.hash) return;
          const lastRoute = localStorage.getItem('olfx-last-route');
          const validLastRoute =
            /^#\/(bulbs|rooms(?:\/[^/?]+)?|library|movie\/[^/?]+|edit\/[^/?]+\/[^/?]+)$/.test(
              lastRoute ?? ''
            );
          location.hash = validLastRoute
            ? lastRoute!
            : bulbs.length === 0
              ? '#/bulbs'
              : rooms.length === 0
                ? '#/rooms'
                : '#/library';
        })
        .catch(() => {
          if (!location.hash) location.hash = '#/rooms';
        });
    }

    const stopAutosave = session.startAutosave();
    let frame = 0;
    const loop = () => {
      session.syncFromVideo();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('hashchange', updateRoute);
      window.removeEventListener('olfx-editor-route-replaced', syncSavedRoute);
      stopAutosave();
      cancelAnimationFrame(frame);
    };
  });

  function onKeydown(event: KeyboardEvent) {
    if (!hashRoute.startsWith('#/edit/')) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
    dispatchEditorCommand(event, {
      session,
      target,
      modal:
        Boolean(target?.closest('[role="dialog"], .modal-backdrop')) ||
        Boolean(document.querySelector('[role="dialog"]')),
      menu:
        Boolean(target?.closest('[role="menu"]')) ||
        Boolean(document.querySelector('[role="menu"]')),
      activeGesture: document.body.dataset.editorGesture === 'active',
    });
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  onbeforeunload={(event) => {
    if (session.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }}
/>

{#if localDev}<aside class="dev-notice" aria-label="Local development">
    Local dev — connect to Emby to load movies and preview lights. Local video files are not
    supported.
  </aside>{/if}

{#if !hashRoute}
  <div class="route-loading" role="status">Loading OpenLightFX Studio…</div>
{:else if hashRoute.startsWith('#/bulbs')}
  <BulbsScreen />
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
  .dev-notice {
    position: fixed;
    right: 8px;
    bottom: 0;
    z-index: 10;
    padding: 4px 8px;
    color: var(--text-muted);
    background: var(--header-bg);
    font-size: 11px;
    pointer-events: none;
  }
  .route-loading {
    min-height: 100vh;
    padding: 2rem;
    color: var(--text);
    background: var(--bg);
  }
</style>
