<script lang="ts">
  import { editor } from '$lib/state/editor.svelte';
</script>

<div class="lights" aria-label="Simulated lights">
  {#each editor.lightBar as lamp (lamp.id)}
    <div class="lamp" title="{lamp.name} {lamp.brightness}%">
      <span
        class="bulb"
        style:background={lamp.color}
        style:box-shadow={`0 0 18px ${lamp.color}`}
      ></span>
      <span class="lamp-name">{lamp.name}</span>
    </div>
  {/each}
</div>
