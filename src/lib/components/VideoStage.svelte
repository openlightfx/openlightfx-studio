<script lang="ts">
  import { formatDuration } from '$lib/engine/time';
  import { editor } from '$lib/state/editor.svelte';
  import Clock from './Clock.svelte';
  import LightBar from './LightBar.svelte';

  let video = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    editor.bindVideo(video);
  });

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) editor.setLocalVideo(file);
  }
</script>

<div
  class="video-pane"
  role="region"
  aria-label="Video"
  ondragover={(event) => event.preventDefault()}
  ondrop={onDrop}
>
  <div class="screen">
    {#if editor.videoUrl}
      <!-- Users supply the picture; Studio has no caption track to attach. -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={video}
        src={editor.videoUrl}
        playsinline
        preload="auto"
        onloadedmetadata={() => video && editor.noteVideoDuration(video.duration)}
      ></video>
    {:else}
      <button class="drop" onclick={() => editor.pickVideo()}>
        Open a local video
        <span class="hint">or pick an Emby item when the plugin is connected</span>
      </button>
    {/if}
  </div>
  <LightBar />
  <div class="transport">
    <button class="play" onclick={() => editor.togglePlay()} title="Play or pause (Space)">
      {editor.playing ? 'Pause' : 'Play'}
    </button>
    <button class="ghost" onclick={() => editor.setPlayhead(editor.playheadMs - 5000)}>-5s</button>
    <button class="ghost" onclick={() => editor.setPlayhead(editor.playheadMs + 5000)}>+5s</button>
    <Clock />
    <span class="mono" style="color: var(--faint)">/ {formatDuration(editor.track.metadata.durationMs)}</span>
    <span class="spacer"></span>
    {#if editor.videoName}
      <span class="lamp-name" title={editor.videoName}>{editor.videoName}</span>
    {/if}
    <button class="ghost" onclick={() => editor.pickVideo()}>Video</button>
    {#if editor.videoDurationMs > 0}
      <button class="ghost" onclick={() => editor.useVideoDuration()} title="Set track duration from the video">
        Use video length
      </button>
    {/if}
  </div>
</div>

<style>
  .hint { display: block; margin-top: 6px; color: var(--faint); font-size: 11px; }
  .spacer { flex: 1; }
</style>
