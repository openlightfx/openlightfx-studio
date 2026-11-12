<script lang="ts">
  import { onMount } from 'svelte';
  import { formatDuration } from '$lib/engine/time';
  import { editor } from '$lib/state/editor.svelte';
  import { saveAutosave } from '$lib/storage/autosave';
  import Clock from './lib/components/Clock.svelte';
  import Inspector from './lib/components/Inspector.svelte';
  import Modals from './lib/components/Modals.svelte';
  import Timeline from './lib/components/Timeline.svelte';
  import TopBar from './lib/components/TopBar.svelte';
  import VideoStage from './lib/components/VideoStage.svelte';

  let importFile = $state<HTMLInputElement | null>(null);
  let videoFile = $state<HTMLInputElement | null>(null);

  const viewLabel = $derived.by(() => {
    const ms = editor.viewportW / Math.max(editor.pixelsPerMs, 1e-9);
    return formatDuration(ms);
  });

  function typing(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (editor.modal) editor.modal = null;
      else {
        editor.cancelDrag();
        editor.clearSelection();
      }
      return;
    }
    if (typing(event.target) || editor.modal) return;
    const meta = event.metaKey || event.ctrlKey;
    const frame = 1000 / editor.fps;
    if (event.key === ' ') {
      event.preventDefault();
      void editor.togglePlay();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      editor.deleteSelected();
      return;
    }
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      editor.redo();
      return;
    }
    if (meta && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      editor.copy();
      return;
    }
    if (meta && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      editor.cut();
      return;
    }
    if (meta && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      editor.paste();
      return;
    }
    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      editor.duplicate();
      return;
    }
    if (meta && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      editor.selectAll();
      return;
    }
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (event.shiftKey) editor.download();
      else void editor.saveToBackend();
      return;
    }
    if (meta && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      editor.pickImport();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const sign = event.key === 'ArrowLeft' ? -1 : 1;
      const delta = event.shiftKey ? 1000 : event.altKey ? frame * 5 : frame;
      editor.nudge(sign * delta);
      return;
    }
    if (event.key === 'Home') {
      editor.setPlayhead(0);
      return;
    }
    if (event.key === 'End') {
      editor.setPlayhead(editor.track.metadata.durationMs);
      return;
    }
    if (event.key === '[') {
      editor.jump(-1);
      return;
    }
    if (event.key === ']') {
      editor.jump(1);
      return;
    }
    if (event.key === 'k') {
      const id = editor.activeChannelId();
      if (id) editor.addKeyframeAt(id, editor.playheadMs);
      return;
    }
    if (event.key === 'E' && event.shiftKey) {
      const id = editor.activeChannelId();
      if (id) editor.addEffectAt(id, editor.playheadMs);
      return;
    }
    if ((event.key === 'm' || event.key === 'M') && !meta) {
      editor.addMarkerAt(editor.playheadMs);
      return;
    }
    if (event.key === 's' && !meta) {
      editor.toggleSnap();
      return;
    }
    if (event.key === 'f' && !meta) {
      editor.fit();
      return;
    }
    if (event.key === '?' || (event.shiftKey && event.key === '/')) {
      editor.modal = 'shortcuts';
      return;
    }
    if (event.key === '+' || event.key === '=') {
      editor.zoomPlayhead(1.2);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      editor.zoomPlayhead(1 / 1.2);
      return;
    }
    if (event.key === 'j') editor.setPlayhead(editor.playheadMs - 5000);
    if (event.key === 'l') editor.setPlayhead(editor.playheadMs + 5000);
  }

  $effect(() => {
    if (!editor.loaded) return;
    const revision = editor.docRev;
    if (revision < 0) return;
    const timer = setTimeout(() => {
      void saveAutosave(editor.persisted());
    }, 450);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    editor.registerPickers({ importFile, videoFile });
  });

  onMount(() => {
    window.addEventListener('keydown', onKey);
    void editor.init();
    return () => window.removeEventListener('keydown', onKey);
  });

  async function onImport() {
    const file = importFile?.files?.[0];
    if (!file) return;
    editor.importBytes(new Uint8Array(await file.arrayBuffer()));
    if (importFile) importFile.value = '';
  }

  function onVideo() {
    const file = videoFile?.files?.[0];
    if (!file) return;
    editor.setLocalVideo(file);
    if (videoFile) videoFile.value = '';
  }
</script>

{#if !editor.loaded}
  <div class="boot">Opening Studio…</div>
{:else}
  <div class="app">
    <TopBar />
    <div class="stage">
      <VideoStage />
      <Inspector />
    </div>
    <Timeline />
    <footer class="status">
      <Clock />
      <span>view {viewLabel}</span>
      <span>
        {editor.selection.keyframes.length + editor.selection.effects.length + editor.selection.markers.length} selected
      </span>
      <span class="grow" class:warn={editor.issues.length > 0}>
        {editor.issues.length ? editor.issues[0].message : editor.backendMessage}
      </span>
      <span>{editor.lastAction}</span>
      <span>tc {editor.fps}</span>
    </footer>
  </div>
{/if}

<Modals />

<div class="toasts" aria-live="polite">
  {#each editor.toasts as toast (toast.id)}
    <div class="toast" class:error={toast.kind === 'error'}>{toast.text}</div>
  {/each}
</div>

<input bind:this={importFile} type="file" accept=".lightfx,application/octet-stream" hidden onchange={onImport} />
<input bind:this={videoFile} type="file" accept="video/*" hidden onchange={onVideo} />
