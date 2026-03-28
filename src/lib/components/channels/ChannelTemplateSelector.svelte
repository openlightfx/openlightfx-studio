<script lang="ts">
  import { CHANNEL_TEMPLATES } from '$lib/types/channels.js';
  import type { ChannelTemplate } from '$lib/types/channels.js';

  let {
    selected = $bindable<ChannelTemplate | null>(null),
    onselect,
    onmanual,
  }: {
    selected?: ChannelTemplate | null;
    onselect: (template: ChannelTemplate) => void;
    onmanual: () => void;
  } = $props();

  function handleSelect(template: ChannelTemplate) {
    selected = template;
    onselect(template);
  }
</script>

<div class="flex flex-col gap-4">
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {#each CHANNEL_TEMPLATES as template (template.name)}
      {@const isSelected = selected?.name === template.name}
      <button
        class="flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50
          {isSelected
            ? 'border-accent bg-accent/10 text-text-base'
            : 'border-surface3 bg-surface2 text-text-base hover:border-accent/50 hover:bg-surface3'}"
        onclick={() => handleSelect(template)}
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-sm">{template.name}</span>
          <span class="shrink-0 rounded-full bg-surface3 px-2 py-0.5 text-xs text-textMuted
            {isSelected ? 'bg-accent/20 text-accent' : ''}">
            {template.channels.length} {template.channels.length === 1 ? 'channel' : 'channels'}
          </span>
        </div>
        <span class="text-xs text-textMuted">{template.description}</span>
      </button>
    {/each}
  </div>

  <div class="flex justify-center pt-1">
    <button
      class="text-xs text-textMuted underline-offset-2 hover:text-text-base hover:underline transition-colors"
      onclick={onmanual}
    >
      Configure manually
    </button>
  </div>
</div>
