<script lang="ts">
  import type { RGBColor } from '$lib/types/index.js';
  import { rgbToHex, hexToRgb } from '$lib/services/color-utils.js';

  let {
    color,
    onchange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
  } = $props();

  let hexValue = $state('');
  let error = $state('');

  // Sync hex input from external color changes
  $effect(() => {
    hexValue = rgbToHex(color).toUpperCase().slice(1);
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    hexValue = target.value.replace(/^#/, '').toUpperCase();
    error = '';
  }

  function handleBlur() {
    const parsed = hexToRgb(hexValue);
    if (parsed) {
      error = '';
      onchange(parsed);
    } else {
      error = 'Invalid hex color';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center gap-1.5">
    <label for="hex-input" class="text-xs font-medium text-textMuted">Hex</label>
    <div
      class="flex flex-1 items-center rounded border bg-surface2 {error
        ? 'border-danger'
        : 'border-surface2 hover:border-surface3'} focus-within:ring-1 focus-within:ring-accent"
    >
      <span class="pl-2 text-xs text-textMuted">#</span>
      <input
        id="hex-input"
        type="text"
        value={hexValue}
        oninput={handleInput}
        onblur={handleBlur}
        onkeydown={handleKeydown}
        maxlength="6"
        class="w-full bg-transparent px-1 py-1 text-xs font-mono text-text-base focus:outline-none"
        aria-label="Hex color value"
        aria-invalid={!!error}
      />
    </div>
  </div>

  {#if error}
    <p class="text-xs text-danger">{error}</p>
  {/if}

  <div class="flex items-center gap-3 text-xs tabular-nums text-textMuted">
    <span>R: {color.r}</span>
    <span>G: {color.g}</span>
    <span>B: {color.b}</span>
  </div>
</div>
