<script lang="ts">
  let {
    value,
    options,
    label,
    onchange,
  }: {
    value: string;
    options: { value: string; label: string }[];
    label?: string;
    onchange: (value: string) => void;
  } = $props();

  const selectId = $derived(`select-${label?.replace(/\s+/g, '-').toLowerCase() ?? 'field'}`);

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    onchange(target.value);
  }
</script>

<div class="flex flex-col gap-1.5">
  {#if label}
    <label for={selectId} class="text-xs font-medium text-textMuted">{label}</label>
  {/if}

  <div class="relative">
    <select
      id={selectId}
      {value}
      onchange={handleChange}
      class="w-full appearance-none rounded-md border border-surface2 bg-surface2 px-3 py-1.5 pr-8 text-sm text-text-base transition-colors hover:border-surface3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg"
    >
      {#each options as opt (opt.value)}
        <option value={opt.value} selected={opt.value === value}>{opt.label}</option>
      {/each}
    </select>

    <!-- Custom dropdown arrow -->
    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
      <svg
        class="h-4 w-4 text-textMuted"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </div>
  </div>
</div>
