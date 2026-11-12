<script lang="ts">
  import { effectParam } from '$lib/engine/effects';
  import { hexToRgb, rgbToHex } from '$lib/engine/color';
  import { formatTimecode } from '$lib/engine/time';
  import {
    EFFECT_TYPES,
    SPATIAL_HINTS,
    type EffectType,
    type Interpolation
  } from '$lib/model/types';
  import { editor } from '$lib/state/editor.svelte';

  const keyframes = $derived(
    editor.track.keyframes.filter((kf) => editor.selection.keyframes.includes(kf.id))
  );
  const effects = $derived(
    editor.track.effectKeyframes.filter((fx) => editor.selection.effects.includes(fx.id))
  );
  const markers = $derived(editor.markers.filter((marker) => editor.selection.markers.includes(marker.id)));
  const channel = $derived(
    editor.track.channels.find((item) => item.id === editor.selection.channelId) ?? null
  );
  const kf = $derived.by(() => {
    const first = keyframes[0];
    if (!first) return null;
    const over = editor.drag?.items.find((item) => item.kind === 'keyframe' && item.id === first.id);
    return over
      ? { ...first, timestampMs: over.timestampMs, transitionMs: over.transitionMs, channelId: over.channelId }
      : first;
  });
  const fx = $derived.by(() => {
    const first = effects[0];
    if (!first) return null;
    const over = editor.drag?.items.find((item) => item.kind === 'effect' && item.id === first.id);
    return over
      ? { ...first, timestampMs: over.timestampMs, durationMs: over.durationMs, channelId: over.channelId }
      : first;
  });

  const paramKeys: Record<string, string[]> = {
    LIGHTNING: ['flash_count', 'decay_ms'],
    FLAME: ['flicker_rate_hz', 'randomness'],
    FLASHBANG: ['flash_count'],
    EXPLOSION: ['flash_count', 'decay_ms'],
    PULSE: ['pulse_rate_hz'],
    STROBE: ['flash_count'],
    SIREN: ['flash_count'],
    AURORA: ['flicker_rate_hz', 'randomness'],
    CANDLE: ['flicker_rate_hz', 'randomness'],
    GUNFIRE: ['flash_count', 'decay_ms'],
    NEON: ['flicker_rate_hz', 'randomness'],
    BREATHING: ['pulse_rate_hz'],
    SPARK: ['randomness']
  };

  function num(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }
</script>

<aside class="inspector">
  <div class="inspector-scroll">
    {#if editor.issues.length}
      <div class="issues">
        {editor.issues[0].code}: {editor.issues[0].message}
        {#if editor.issues.length > 1}
          <div>+{editor.issues.length - 1} more</div>
        {/if}
      </div>
    {/if}

    {#if kf && effects.length === 0}
      <h2>{keyframes.length > 1 ? `${keyframes.length} keyframes` : 'Keyframe'}</h2>
      <div class="form">
        <div class="swatch" style:background={rgbToHex(kf.color)}></div>
        <label class="field">Time
          <input
            type="number"
            min="0"
            step="1"
            value={Math.round(kf.timestampMs)}
            onfocus={() => editor.begin('Time')}
            oninput={(event) => editor.patchSelectedKeyframes({ timestampMs: num(event) })}
            onblur={() => editor.end()}
          />
        </label>
        <label class="field">Color
          <input
            type="color"
            value={rgbToHex(kf.color)}
            onfocus={() => editor.begin('Color')}
            oninput={(event) =>
              editor.patchSelectedKeyframes({
                color: hexToRgb((event.currentTarget as HTMLInputElement).value),
                colorMode: 'RGB'
              })}
            onblur={() => editor.end()}
          />
        </label>
        <div class="row3">
          {#each ['r', 'g', 'b'] as part (part)}
            <label class="field">{part.toUpperCase()}
              <input
                type="number"
                min="0"
                max="255"
                value={kf.color[part as 'r' | 'g' | 'b']}
                onfocus={() => editor.begin('Color')}
                oninput={(event) =>
                  editor.patchSelectedKeyframes({
                    color: { ...kf.color, [part]: num(event) },
                    colorMode: 'RGB'
                  })}
                onblur={() => editor.end()}
              />
            </label>
          {/each}
        </div>
        <label class="field">Brightness {kf.brightness}
          <input
            type="range"
            min="0"
            max="100"
            value={kf.brightness}
            onpointerdown={() => editor.begin('Brightness')}
            oninput={(event) => editor.patchSelectedKeyframes({ brightness: num(event) })}
            onpointerup={() => editor.end()}
          />
        </label>
        <label class="field">Transition {kf.transitionMs} ms
          <input
            type="range"
            min="0"
            max={Math.max(1000, kf.timestampMs)}
            value={kf.transitionMs}
            onpointerdown={() => editor.begin('Transition')}
            oninput={(event) => editor.patchSelectedKeyframes({ transitionMs: num(event) })}
            onpointerup={() => editor.end()}
          />
        </label>
        <div class="row2">
          <label class="field">Interpolation
            <select
              value={kf.interpolation}
              onchange={(event) =>
                editor.patchSelectedKeyframes({
                  interpolation: (event.currentTarget as HTMLSelectElement).value as Interpolation
                })}
            >
              {#if kf.interpolation === 'INTERPOLATION_UNSPECIFIED'}
                <option value="INTERPOLATION_UNSPECIFIED">Unspecified</option>
              {/if}
              <option value="LINEAR">Linear</option>
              <option value="STEP">Step</option>
            </select>
          </label>
          <label class="field">Color mode
            <select
              value={kf.colorMode}
              onchange={(event) =>
                editor.patchSelectedKeyframes({
                  colorMode: (event.currentTarget as HTMLSelectElement).value as 'RGB' | 'COLOR_TEMPERATURE'
                })}
            >
              <option value="RGB">RGB</option>
              <option value="COLOR_TEMPERATURE">Kelvin</option>
            </select>
          </label>
        </div>
        {#if kf.colorMode === 'COLOR_TEMPERATURE'}
          <label class="field">Kelvin {kf.colorTemperature}
            <input
              type="range"
              min="1000"
              max="10000"
              step="50"
              value={kf.colorTemperature}
              onpointerdown={() => editor.begin('Kelvin')}
              oninput={(event) => editor.patchSelectedKeyframes({ colorTemperature: num(event) })}
              onpointerup={() => editor.end()}
            />
          </label>
        {/if}
        <label class="inline">
          <input
            type="checkbox"
            checked={kf.powerOn}
            onchange={(event) =>
              editor.patchSelectedKeyframes({
                powerOn: (event.currentTarget as HTMLInputElement).checked
              })}
          />
          Power on
        </label>
        <p class="hint">{formatTimecode(kf.timestampMs, editor.fps)} · ramp starts {kf.transitionMs} ms earlier</p>
      </div>
    {:else if fx && keyframes.length === 0}
      <h2>{effects.length > 1 ? `${effects.length} effects` : 'Effect'}</h2>
      <div class="form">
        <label class="field">Type
          <select
            value={fx.effectType}
            onchange={(event) =>
              editor.patchSelectedEffects({
                effectType: (event.currentTarget as HTMLSelectElement).value as EffectType
              })}
          >
            {#each EFFECT_TYPES as type (type)}
              <option value={type}>{type.toLowerCase()}</option>
            {/each}
          </select>
        </label>
        <div class="row2">
          <label class="field">Start
            <input
              type="number"
              min="0"
              value={Math.round(fx.timestampMs)}
              onfocus={() => editor.begin('Effect time')}
              oninput={(event) => editor.patchSelectedEffects({ timestampMs: num(event) })}
              onblur={() => editor.end()}
            />
          </label>
          <label class="field">Duration
            <input
              type="number"
              min="50"
              value={Math.round(fx.durationMs)}
              onfocus={() => editor.begin('Effect duration')}
              oninput={(event) => editor.patchSelectedEffects({ durationMs: num(event) })}
              onblur={() => editor.end()}
            />
          </label>
        </div>
        <label class="field">Intensity {fx.intensity}
          <input
            type="range"
            min="0"
            max="100"
            value={fx.intensity}
            onpointerdown={() => editor.begin('Intensity')}
            oninput={(event) => editor.patchSelectedEffects({ intensity: num(event) })}
            onpointerup={() => editor.end()}
          />
        </label>
        <div class="row2">
          <label class="field">Primary
            <input
              type="color"
              value={rgbToHex(fx.primaryColor)}
              onfocus={() => editor.begin('Effect color')}
              oninput={(event) =>
                editor.patchSelectedEffects({
                  primaryColor: hexToRgb((event.currentTarget as HTMLInputElement).value)
                })}
              onblur={() => editor.end()}
            />
          </label>
          <label class="field">Secondary
            <input
              type="color"
              value={rgbToHex(fx.secondaryColor)}
              onfocus={() => editor.begin('Effect color')}
              oninput={(event) =>
                editor.patchSelectedEffects({
                  secondaryColor: hexToRgb((event.currentTarget as HTMLInputElement).value)
                })}
              onblur={() => editor.end()}
            />
          </label>
        </div>
        {#if effects.length === 1}
          {#each paramKeys[fx.effectType] ?? [] as key (key)}
            <label class="field">{key}
              <input
                type="number"
                step="0.1"
                value={effectParam(fx, key)}
                onfocus={() => editor.begin(key)}
                oninput={(event) =>
                  editor.patchSelectedEffects({
                    effectParams: { ...fx.effectParams, [key]: num(event) }
                  })}
                onblur={() => editor.end()}
              />
            </label>
          {/each}
          <label class="field">Required capability
            <select
              value={fx.requiredCapability}
              onchange={(event) =>
                editor.patchSelectedEffects({
                  requiredCapability: (event.currentTarget as HTMLSelectElement).value
                })}
            >
              <option value="">CAPABILITY_ANY</option>
              <option value="CAPABILITY_RGB">CAPABILITY_RGB</option>
              <option value="CAPABILITY_FAST_TRANSITION">CAPABILITY_FAST_TRANSITION</option>
              <option value="CAPABILITY_FAST_RGB">CAPABILITY_FAST_RGB</option>
            </select>
          </label>
        {/if}
      </div>
    {:else if markers.length === 1 && keyframes.length === 0 && effects.length === 0}
      <h2>Marker</h2>
      <div class="form">
        <p class="hint">Markers are editor-only. They are not stored in the .lightfx file.</p>
        <label class="field">Label
          <input
            type="text"
            value={markers[0].label}
            onfocus={() => editor.begin('Marker')}
            oninput={(event) =>
              editor.patchMarker(markers[0].id, {
                label: (event.currentTarget as HTMLInputElement).value
              })}
            onblur={() => editor.end()}
          />
        </label>
        <label class="field">Time
          <input
            type="number"
            min="0"
            value={Math.round(markers[0].timestampMs)}
            onfocus={() => editor.begin('Marker')}
            oninput={(event) => editor.patchMarker(markers[0].id, { timestampMs: num(event) })}
            onblur={() => editor.end()}
          />
        </label>
      </div>
    {:else if keyframes.length + effects.length + markers.length > 1}
      <h2>Selection</h2>
      <p class="hint">
        {keyframes.length} keyframes, {effects.length} effects, {markers.length} markers. Drag to move them together.
      </p>
    {:else if channel}
      <h2>Channel</h2>
      <div class="form">
        <label class="field">Name
          <input
            type="text"
            value={channel.displayName}
            onfocus={() => editor.begin('Channel')}
            oninput={(event) =>
              editor.updateChannel(channel.id, {
                displayName: (event.currentTarget as HTMLInputElement).value
              })}
            onblur={() => editor.end()}
          />
        </label>
        <label class="field">Id
          <input
            type="text"
            value={channel.id}
            onchange={(event) =>
              editor.updateChannel(channel.id, { id: (event.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="field">Spatial hint
          <select
            value={channel.spatialHint}
            onchange={(event) =>
              editor.updateChannel(channel.id, {
                spatialHint: (event.currentTarget as HTMLSelectElement).value
              })}
          >
            {#each SPATIAL_HINTS as hint (hint)}
              <option value={hint}>{hint.replace('SPATIAL_', '').toLowerCase()}</option>
            {/each}
          </select>
        </label>
        <label class="field">Default color
          <input
            type="color"
            value={rgbToHex(channel.defaultColor)}
            onfocus={() => editor.begin('Channel color')}
            oninput={(event) =>
              editor.updateChannel(channel.id, {
                defaultColor: hexToRgb((event.currentTarget as HTMLInputElement).value)
              })}
            onblur={() => editor.end()}
          />
        </label>
        <label class="field">Default brightness {channel.defaultBrightness}
          <input
            type="range"
            min="0"
            max="100"
            value={channel.defaultBrightness}
            onpointerdown={() => editor.begin('Channel brightness')}
            oninput={(event) => editor.updateChannel(channel.id, { defaultBrightness: num(event) })}
            onpointerup={() => editor.end()}
          />
        </label>
        <label class="inline">
          <input
            type="checkbox"
            checked={channel.optional}
            onchange={(event) =>
              editor.updateChannel(channel.id, {
                optional: (event.currentTarget as HTMLInputElement).checked
              })}
          />
          Optional
        </label>
        <button class="ghost" onclick={() => editor.deleteChannel(channel.id)}>Delete channel</button>
      </div>
    {:else}
      <h2>Track</h2>
      <p class="hint">{editor.track.metadata.description || 'No description yet.'}</p>
    {/if}

    <div class="cluster">
      <button class="text-btn" onclick={() => editor.activeChannelId() && editor.addKeyframeAt(editor.activeChannelId()!, editor.playheadMs)}>
        + keyframe
      </button>
      <button class="text-btn" onclick={() => editor.activeChannelId() && editor.addEffectAt(editor.activeChannelId()!, editor.playheadMs)}>
        + effect
      </button>
      <button class="text-btn" onclick={() => editor.addMarkerAt(editor.playheadMs)}>+ marker</button>
    </div>
  </div>
</aside>

<style>
  .hint { margin: 0; color: var(--faint); font-size: 11px; line-height: 1.4; }
  .cluster { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
