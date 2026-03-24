<script lang="ts">
  let {
    value,
    label,
    placeholder = '',
    error,
    oninput,
    type = 'text',
  }: {
    value: string;
    label?: string;
    placeholder?: string;
    error?: string;
    oninput: (value: string) => void;
    type?: 'text' | 'number';
  } = $props();

  const inputId = $derived(`text-input-${label?.replace(/\s+/g, '-').toLowerCase() ?? 'field'}`);

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    oninput(target.value);
  }
</script>

<div class="flex flex-col gap-1.5">
  {#if label}
    <label for={inputId} class="text-xs font-medium text-textMuted">{label}</label>
  {/if}

  <input
    id={inputId}
    {type}
    {value}
    {placeholder}
    oninput={handleInput}
    aria-invalid={!!error}
    aria-describedby={error ? 'input-error' : undefined}
    class="w-full rounded-md border bg-surface2 px-3 py-1.5 text-sm text-text-base placeholder-textMuted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg
      {error ? 'border-danger' : 'border-surface2 hover:border-surface3'}"
  />

  {#if error}
    <p id="input-error" class="text-xs text-danger">{error}</p>
  {/if}
</div>
