<script lang="ts">
  import { rgbToHex, hexToRgb } from '$lib/services/color-utils.js';
  import type { RGBColor } from '$lib/types/index.js';

  let {
    color,
    onchange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
  } = $props();

  let inputValue = $state('');
  let error = $state('');

  // Keep input in sync when external color changes (unless user is typing)
  $effect(() => {
    inputValue = rgbToHex(color);
    error = '';
  });

  function oninput(e: Event) {
    inputValue = (e.target as HTMLInputElement).value;
    error = '';
  }

  function onblur() {
    const trimmed = inputValue.trim();
    // Accept with or without leading #
    const candidate = trimmed.startsWith('#') ? trimmed : '#' + trimmed;
    const parsed = hexToRgb(candidate);
    if (parsed) {
      error = '';
      inputValue = rgbToHex(parsed);
      onchange(parsed);
    } else {
      error = 'Invalid hex color';
      inputValue = rgbToHex(color);
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      inputValue = rgbToHex(color);
      error = '';
      (e.target as HTMLInputElement).blur();
    }
  }
</script>

<div class="flex flex-col gap-1">
  <label for="hex-input" class="text-xs text-textMuted">Hex</label>
  <input
    id="hex-input"
    type="text"
    class="bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px] font-mono uppercase w-full"
    class:border-danger={!!error}
    class:border-surface3={!error}
    value={inputValue}
    placeholder="#RRGGBB"
    maxlength={7}
    {oninput}
    {onblur}
    {onkeydown}
  />
  {#if error}
    <span class="text-xs text-danger">{error}</span>
  {/if}
</div>
