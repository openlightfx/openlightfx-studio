<script lang="ts">
  let {
    effects = [
      { type: 'LIGHTNING', name: 'Lightning', icon: '⚡', color: '#ffffff' },
      { type: 'FLAME', name: 'Flame', icon: '🔥', color: '#ff6b35' },
      { type: 'FLASHBANG', name: 'Flashbang', icon: '💥', color: '#ffffff' },
      { type: 'EXPLOSION', name: 'Explosion', icon: '💣', color: '#ff4500' },
      { type: 'PULSE', name: 'Pulse', icon: '💓', color: '#6c63ff' },
      { type: 'STROBE', name: 'Strobe', icon: '🔦', color: '#ffffff' },
      { type: 'SIREN', name: 'Siren', icon: '🚨', color: '#ff0000' },
      { type: 'AURORA', name: 'Aurora', icon: '🌌', color: '#00ff88' },
      { type: 'CANDLE', name: 'Candle', icon: '🕯️', color: '#ffaa33' },
      { type: 'GUNFIRE', name: 'Gunfire', icon: '🔫', color: '#ffff00' },
      { type: 'NEON', name: 'Neon', icon: '💡', color: '#ff00ff' },
      { type: 'BREATHING', name: 'Breathing', icon: '🫁', color: '#00d9ff' },
      { type: 'SPARK', name: 'Spark', icon: '✨', color: '#ffffff' },
    ],
    collapsed = false,
    ondragstart,
  }: {
    effects?: Array<{ type: string; name: string; icon: string; color: string }>;
    collapsed?: boolean;
    ondragstart?: (effectType: string) => void;
  } = $props();
</script>

{#if !collapsed}
  <div class="flex flex-col bg-[var(--surface)] border-t border-[var(--surface2)]">
    <div class="panel-header">Effects Palette</div>
    <div class="flex flex-wrap gap-1 p-2 max-h-[120px] overflow-y-auto">
      {#each effects as effect}
        <button
          class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-[var(--surface2)] hover:bg-[var(--accent)]/20 transition-colors cursor-grab active:cursor-grabbing"
          draggable="true"
          ondragstart={() => ondragstart?.(effect.type)}
          title={effect.name}
        >
          <span class="text-sm">{effect.icon}</span>
          <span class="text-[var(--text)]">{effect.name}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
