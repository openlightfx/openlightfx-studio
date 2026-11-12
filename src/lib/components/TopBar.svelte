<script lang="ts">
  import { editor } from '$lib/state/editor.svelte';

  let menu = $state<null | 'file' | 'edit' | 'view'>(null);

  function toggle(name: 'file' | 'edit' | 'view') {
    menu = menu === name ? null : name;
  }

  function run(fn: () => void) {
    menu = null;
    fn();
  }
</script>

<svelte:window
  onclick={(event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.menu')) menu = null;
  }}
/>

<header class="top">
  <div class="brand"><i></i> OpenLightFX</div>
  <button class="title-btn" onclick={() => (editor.modal = 'settings')} title="Track settings">
    {editor.track.metadata.title || 'Untitled'}
  </button>
  <nav class="menus">
    <div class="menu">
      <button onclick={() => toggle('file')}>File</button>
      {#if menu === 'file'}
        <div class="pop">
          <button onclick={() => run(() => (editor.modal = 'new'))}>New…</button>
          <button onclick={() => run(() => editor.loadSample())}>Load sample</button>
          <button onclick={() => run(() => editor.pickImport())}>Import .lightfx <kbd>Ctrl+O</kbd></button>
          <button onclick={() => run(() => editor.download())}>Export .lightfx <kbd>Ctrl+Shift+S</kbd></button>
          <button onclick={() => run(() => (editor.modal = 'library'))}>Emby library…</button>
          <button onclick={() => run(() => editor.saveToBackend())}>Save <kbd>Ctrl+S</kbd></button>
          <button onclick={() => run(() => (editor.modal = 'settings'))}>Track settings…</button>
        </div>
      {/if}
    </div>
    <div class="menu">
      <button onclick={() => toggle('edit')}>Edit</button>
      {#if menu === 'edit'}
        <div class="pop">
          <button disabled={editor.undoCount === 0} onclick={() => run(() => editor.undo())}>Undo <kbd>Ctrl+Z</kbd></button>
          <button disabled={editor.redoCount === 0} onclick={() => run(() => editor.redo())}>Redo <kbd>Ctrl+Shift+Z</kbd></button>
          <button onclick={() => run(() => editor.cut())}>Cut <kbd>Ctrl+X</kbd></button>
          <button onclick={() => run(() => editor.copy())}>Copy <kbd>Ctrl+C</kbd></button>
          <button disabled={!editor.clipboard} onclick={() => run(() => editor.paste())}>Paste <kbd>Ctrl+V</kbd></button>
          <button onclick={() => run(() => editor.duplicate())}>Duplicate <kbd>Ctrl+D</kbd></button>
          <button onclick={() => run(() => editor.deleteSelected())}>Delete <kbd>Del</kbd></button>
          <button onclick={() => run(() => editor.selectAll())}>Select all <kbd>Ctrl+A</kbd></button>
        </div>
      {/if}
    </div>
    <div class="menu">
      <button onclick={() => toggle('view')}>View</button>
      {#if menu === 'view'}
        <div class="pop">
          <button onclick={() => run(() => editor.zoomPlayhead(1.25))}>Zoom in <kbd>+</kbd></button>
          <button onclick={() => run(() => editor.zoomPlayhead(0.8))}>Zoom out <kbd>-</kbd></button>
          <button onclick={() => run(() => editor.fit())}>Fit movie <kbd>F</kbd></button>
          <button onclick={() => run(() => editor.toggleSnap())}>
            {editor.snapEnabled ? 'Snap on' : 'Snap off'} <kbd>S</kbd>
          </button>
          <button onclick={() => run(() => (editor.modal = 'mapping'))}>Bulb mapping…</button>
          <button onclick={() => run(() => (editor.modal = 'shortcuts'))}>Shortcuts <kbd>?</kbd></button>
        </div>
      {/if}
    </div>
  </nav>
  <span class="spacer"></span>
  <div class="cluster">
    <button class="icon-btn" class:on={editor.snapEnabled} onclick={() => editor.toggleSnap()} title="Snap (S)">
      Snap
    </button>
    <button
      class="icon-btn"
      class:on={editor.hardwarePreview}
      onclick={() => editor.setHardwarePreview(!editor.hardwarePreview)}
      title="Drive mapped bulbs while editing"
    >
      Bulbs
    </button>
    <button class="icon-btn" disabled={editor.undoCount === 0} onclick={() => editor.undo()} title="Undo">Undo</button>
    <button class="icon-btn" disabled={editor.redoCount === 0} onclick={() => editor.redo()} title="Redo">Redo</button>
    <button class="text-btn" onclick={() => (editor.modal = 'mapping')}>Map</button>
    <span
      class="badge {editor.backend}"
      title={editor.backendMessage}
    >{editor.backend}</span>
  </div>
</header>
