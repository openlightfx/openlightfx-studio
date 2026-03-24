<script lang="ts">
  import type { EffectKeyframe, EffectType } from '$lib/types';

  let {
    effect,
    onchange,
  }: {
    effect: EffectKeyframe;
    onchange?: (field: string, value: unknown) => void;
  } = $props();

  const ALL_EFFECT_TYPES: EffectType[] = [
    'LIGHTNING', 'FLAME', 'FLASHBANG', 'EXPLOSION', 'PULSE', 'STROBE',
    'SIREN', 'AURORA', 'CANDLE', 'GUNFIRE', 'NEON', 'BREATHING', 'SPARK',
  ];

  // Which effect types use which params
  const PARAM_DEFS: Record<string, {
    label: string;
    min: number; max: number; step: number; isFloat: boolean;
    effects: Set<EffectType>;
  }> = {
    flash_count: {
      label: 'Flash Count',
      min: 1, max: 20, step: 1, isFloat: false,
      effects: new Set(['LIGHTNING', 'FLASHBANG', 'EXPLOSION', 'GUNFIRE', 'SIREN', 'STROBE']),
    },
    flicker_rate_hz: {
      label: 'Flicker Rate (Hz)',
      min: 0.5, max: 30, step: 0.5, isFloat: true,
      effects: new Set(['FLAME', 'CANDLE', 'NEON', 'AURORA']),
    },
    pulse_rate_hz: {
      label: 'Pulse Rate (Hz)',
      min: 0.1, max: 5, step: 0.1, isFloat: true,
      effects: new Set(['PULSE', 'BREATHING']),
    },
    decay_ms: {
      label: 'Decay (ms)',
      min: 0, max: 5000, step: 10, isFloat: false,
      effects: new Set(['EXPLOSION', 'LIGHTNING', 'GUNFIRE']),
    },
    randomness: {
      label: 'Randomness',
      min: 0, max: 1, step: 0.01, isFloat: true,
      effects: new Set(['FLAME', 'CANDLE', 'AURORA', 'NEON', 'SPARK']),
    },
  };

  let applicableParams = $derived(
    Object.entries(PARAM_DEFS).filter(([, def]) => def.effects.has(effect.effectType))
  );

  function rgbToHex(c: { r: number; g: number; b: number }): string {
    return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function updateParam(key: string, value: number) {
    onchange?.('effectParams', { ...effect.effectParams, [key]: value });
  }
</script>

<div class="flex flex-col gap-3 text-sm">
  <!-- Effect Type -->
  <div>
    <label class="block text-xs text-[var(--text-muted)] mb-1">Effect Type</label>
    <select
      class="input"
      value={effect.effectType}
      onchange={(e) => onchange?.('effectType', (e.target as HTMLSelectElement).value)}
    >
      {#each ALL_EFFECT_TYPES as et}
        <option value={et}>{et.charAt(0) + et.slice(1).toLowerCase()}</option>
      {/each}
    </select>
  </div>

  <!-- Intensity -->
  <div>
    <label class="block text-xs text-[var(--text-muted)] mb-1">
      Intensity: {effect.intensity}%
    </label>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      class="w-full accent-[var(--accent)]"
      value={effect.intensity}
      oninput={(e) => onchange?.('intensity', parseInt((e.target as HTMLInputElement).value))}
    />
  </div>

  <!-- Duration -->
  <div>
    <label class="block text-xs text-[var(--text-muted)] mb-1">Duration (ms)</label>
    <input
      type="number"
      min="100"
      max="30000"
      step="100"
      class="input"
      value={effect.durationMs}
      oninput={(e) => {
        const v = parseInt((e.target as HTMLInputElement).value);
        if (!isNaN(v)) onchange?.('durationMs', Math.max(100, Math.min(30000, v)));
      }}
    />
  </div>

  <!-- Primary Color -->
  <div>
    <label class="block text-xs text-[var(--text-muted)] mb-1">Primary Color</label>
    <div class="flex items-center gap-2">
      <div
        class="w-7 h-7 rounded border border-[var(--surface2)]"
        style="background: rgb({effect.primaryColor.r},{effect.primaryColor.g},{effect.primaryColor.b})"
      ></div>
      <input
        type="color"
        class="w-7 h-7 cursor-pointer"
        value={rgbToHex(effect.primaryColor)}
        oninput={(e) => onchange?.('primaryColor', hexToRgb((e.target as HTMLInputElement).value))}
      />
    </div>
  </div>

  <!-- Secondary Color -->
  <div>
    <label class="block text-xs text-[var(--text-muted)] mb-1">Secondary Color</label>
    <div class="flex items-center gap-2">
      <div
        class="w-7 h-7 rounded border border-[var(--surface2)]"
        style="background: rgb({effect.secondaryColor.r},{effect.secondaryColor.g},{effect.secondaryColor.b})"
      ></div>
      <input
        type="color"
        class="w-7 h-7 cursor-pointer"
        value={rgbToHex(effect.secondaryColor)}
        oninput={(e) => onchange?.('secondaryColor', hexToRgb((e.target as HTMLInputElement).value))}
      />
    </div>
  </div>

  <!-- Type-specific Params -->
  {#if applicableParams.length > 0}
    <div class="pt-2 border-t border-[var(--surface2)]">
      <h4 class="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
        Effect Parameters
      </h4>
      {#each applicableParams as [key, def]}
        <div class="mb-3">
          <label class="block text-xs text-[var(--text-muted)] mb-1">
            {def.label}: {def.isFloat
              ? (effect.effectParams[key] ?? def.min).toFixed(def.step < 1 ? 2 : 1)
              : Math.round(effect.effectParams[key] ?? def.min)}
          </label>
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            class="w-full accent-[var(--accent)]"
            value={effect.effectParams[key] ?? def.min}
            oninput={(e) => {
              const v = def.isFloat
                ? parseFloat((e.target as HTMLInputElement).value)
                : parseInt((e.target as HTMLInputElement).value);
              updateParam(key, v);
            }}
          />
        </div>
      {/each}
    </div>
  {/if}

  <!-- Required Capability -->
  {#if effect.requiredCapability}
    <div class="pt-2 border-t border-[var(--surface2)]">
      <h4 class="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
        Required Capability
      </h4>
      <p class="text-xs text-[var(--accent2)] bg-[var(--surface2)] rounded px-2 py-1 font-mono">
        {effect.requiredCapability}
      </p>
    </div>
  {/if}

  <!-- Fallback -->
  <div class="pt-2 border-t border-[var(--surface2)]">
    <h4 class="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
      Fallback (incapable bulbs)
    </h4>
    <div class="flex items-center gap-2 mb-2">
      <label class="text-xs text-[var(--text-muted)]">Color</label>
      <div
        class="w-6 h-6 rounded border border-[var(--surface2)]"
        style="background: rgb({effect.fallbackColor.r},{effect.fallbackColor.g},{effect.fallbackColor.b})"
      ></div>
      <input
        type="color"
        class="w-6 h-6 cursor-pointer"
        value={rgbToHex(effect.fallbackColor)}
        oninput={(e) => onchange?.('fallbackColor', hexToRgb((e.target as HTMLInputElement).value))}
      />
    </div>
    <div>
      <label class="block text-xs text-[var(--text-muted)] mb-1">
        Brightness: {effect.fallbackBrightness}%
      </label>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        class="w-full accent-[var(--accent)]"
        value={effect.fallbackBrightness}
        oninput={(e) =>
          onchange?.('fallbackBrightness', parseInt((e.target as HTMLInputElement).value))}
      />
    </div>
  </div>
</div>
