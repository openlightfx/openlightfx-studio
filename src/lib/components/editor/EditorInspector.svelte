<script lang="ts">
  import { parseElapsedTime, type Channel, type EffectKeyframe, type Keyframe } from '$lib/domain';
  import type { StudioSession } from '$lib/studio/session.svelte';
  import { inspectorSelection, type SelectionValue } from '$lib/domain/inspector-selection';
  import { onMount } from 'svelte';

  function display<T>(field: SelectionValue<T>): T | '' {
    return field.kind === 'uniform' ? field.value : '';
  }

  let {
    session,
    selected,
    selectedEffect,
    channel,
    routedDescription,
    format,
    positionLabel,
    onPickSource,
  } = $props<{
    session: StudioSession;
    selected: Keyframe | undefined;
    selectedEffect: EffectKeyframe | undefined;
    channel: Channel | undefined;
    routedDescription: string;
    format: (ms: number) => string;
    positionLabel: (value: string | null | undefined) => string;
    onPickSource: () => void;
  }>();

  let collapsed = $state(false);
  onMount(() => {
    collapsed = window.matchMedia('(max-width: 750px)').matches;
  });

  const fields = $derived(
    inspectorSelection((session.draftTrack ?? session.track)?.keyframes ?? [], session.selection)
  );

  /** A focused field/continuous gesture is one authored action, with Escape rollback. */
  function transactionalField(node: HTMLInputElement) {
    let active = false;
    let originalValue = node.value;
    function begin() {
      if (active) return;
      originalValue = node.value;
      active = true;
      session.beginEdit(`Edit ${node.getAttribute('aria-label') ?? 'property'}`);
    }
    function validate() {
      const label = node.getAttribute('aria-label');
      const raw = node.value.trim();
      let error = '';
      if (label === 'Hex' && !/^#?[0-9a-f]{6}$/i.test(raw))
        error = 'Enter a complete six-digit Hex color.';
      if (
        (label === 'Brightness' || label === 'Brightness value') &&
        (!raw || !Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > 100)
      )
        error = 'Brightness must be a whole number from 0 to 100.';
      if (
        ['R', 'G', 'B'].includes(label ?? '') &&
        (!raw || !Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > 255)
      )
        error = 'RGB components must be whole numbers from 0 to 255.';
      if (
        label === 'Kelvin' &&
        (!raw || !Number.isInteger(Number(raw)) || Number(raw) < 1000 || Number(raw) > 10000)
      )
        error = 'Kelvin must be a whole number from 1000 to 10000.';
      if (
        label === 'Fade length' &&
        (!raw ||
          !Number.isInteger(Number(raw)) ||
          Number(raw) < 0 ||
          (session.track?.keyframes ?? []).some(
            (key: Keyframe) => session.selection.includes(key.id) && Number(raw) > key.timestampMs
          ))
      )
        error = 'Incoming fade duration must be from zero through its arrival time.';
      if (label === 'Keyframe time') {
        const parsed = parseElapsedTime(raw.split(':').length === 2 ? `00:${raw}` : raw);
        if (parsed == null || parsed > session.durationMs())
          error = 'Enter a keyframe time inside the movie.';
      }
      session.propertyDraftError = error;
      node.setAttribute('aria-invalid', String(Boolean(error)));
      node.setAttribute('aria-describedby', 'property-draft-error');
      return !error;
    }
    function input(event: Event) {
      begin();
      if (!validate()) event.stopImmediatePropagation();
    }
    function commit() {
      if (!active || !validate()) return;
      active = false;
      session.commitEdit();
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        active = false;
        session.propertyDraftError = '';
        node.setAttribute('aria-invalid', 'false');
        session.cancelEdit();
        node.value = originalValue;
        node.blur();
      } else if (event.key === 'Enter') {
        commit();
        node.blur();
      } else begin();
    }
    node.addEventListener('input', input);
    node.addEventListener('focus', begin);
    node.addEventListener('pointerdown', begin);
    node.addEventListener('blur', commit);
    node.addEventListener('change', commit);
    node.addEventListener('keydown', key);
    return {
      destroy() {
        if (active) session.cancelEdit();
        session.propertyDraftError = '';
        node.removeEventListener('input', input);
        node.removeEventListener('focus', begin);
        node.removeEventListener('pointerdown', begin);
        node.removeEventListener('blur', commit);
        node.removeEventListener('change', commit);
        node.removeEventListener('keydown', key);
      },
    };
  }

  function setColorComponent(component: 'r' | 'g' | 'b', raw: string) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 255) return;
    if (selected) {
      session.setColorComponent(component, value);
    } else if (channel) {
      const color = { ...channel.defaultColor, [component]: value };
      session.setDefaultColor(
        channel.id,
        [color.r, color.g, color.b].map((part) => part.toString(16).padStart(2, '0')).join('')
      );
    }
  }
</script>

<aside class="inspector" class:collapsed aria-label="Inspector">
  <button
    class="inspector-toggle"
    aria-expanded={!collapsed}
    onclick={() => (collapsed = !collapsed)}
  >
    {collapsed ? 'Show inspector' : 'Hide inspector'}
  </button>
  {#if selectedEffect}
    <h2>{selectedEffect.effectType}</h2>
    <p>Drag the block to move it. Drag its right edge to change length.</p>
    <label
      >Duration (ms)
      <input
        aria-label="Effect duration"
        type="number"
        min="1"
        value={selectedEffect.durationMs}
        onchange={(event) =>
          session.updateEffect(selectedEffect.id, {
            durationMs: Number((event.currentTarget as HTMLInputElement).value),
          })}
      /></label
    >
    <label
      >Intensity
      <input
        aria-label="Effect intensity"
        type="number"
        min="0"
        max="100"
        value={selectedEffect.intensity}
        onchange={(event) =>
          session.updateEffect(selectedEffect.id, {
            intensity: Number((event.currentTarget as HTMLInputElement).value),
          })}
      /></label
    >
    <label
      >Color
      <input
        aria-label="Effect colour"
        type="color"
        value={'#' +
          [
            selectedEffect.primaryColor?.r ?? 255,
            selectedEffect.primaryColor?.g ?? 255,
            selectedEffect.primaryColor?.b ?? 255,
          ]
            .map((channel) => channel.toString(16).padStart(2, '0'))
            .join('')}
        onchange={(event) => {
          const hex = (event.currentTarget as HTMLInputElement).value.slice(1);
          session.updateEffect(selectedEffect.id, {
            primaryColor: {
              r: Number.parseInt(hex.slice(0, 2), 16),
              g: Number.parseInt(hex.slice(2, 4), 16),
              b: Number.parseInt(hex.slice(4, 6), 16),
            },
          });
        }}
      /></label
    >
    <button type="button" onclick={() => session.deleteEffect(selectedEffect.id)}
      >Delete effect</button
    >
  {:else if selected}
    <h2>
      {session.selection.length > 1 ? `${session.selection.length} selected keyframes` : 'Keyframe'}
    </h2>
    {#if fields.count > 1}
      <p aria-label="Selected time span">{format(fields.startMs!)} – {format(fields.endMs!)}</p>
      <p>Blank fields indicate mixed values. Editing a field changes only that property.</p>
    {/if}
    <div id="property-draft-error">
      {#if session.propertyDraftError}<p class="error" role="alert">
          {session.propertyDraftError}
        </p>{/if}
    </div>
    {#if session.hexError}<p class="error" role="alert">{session.hexError}</p>{/if}
    {#if session.kelvinError}<p class="error" role="alert">{session.kelvinError}</p>{/if}
    <label
      >Time <input
        aria-label="Keyframe time"
        use:transactionalField
        value={fields.count === 1 ? format(selected.timestampMs) : ''}
        disabled={fields.count !== 1}
        placeholder="Multiple times"
        title={fields.count !== 1 ? 'Exact time is editable for one keyframe at a time' : ''}
        onchange={(event) =>
          session.setKeyframeTime((event.currentTarget as HTMLInputElement).value)}
      /></label
    >
    {#if fields.hex.kind === 'mixed'}
      <p>Mixed colors — choose a color to replace all selected colors.</p>
    {/if}
    <label
      >{fields.hex.kind === 'mixed' ? 'Replace color' : 'Color'}
      <input
        type="color"
        aria-label="Color"
        use:transactionalField
        value={'#' +
          [selected.color.r, selected.color.g, selected.color.b]
            .map((x) => x.toString(16).padStart(2, '0'))
            .join('')}
        oninput={(event) =>
          session.setHex((event.currentTarget as HTMLInputElement).value.slice(1))}
      /></label
    >
    <label
      >Hex <input
        aria-label="Hex"
        use:transactionalField
        value={display(fields.hex)}
        placeholder="Mixed"
        oninput={(event) => session.setHex((event.currentTarget as HTMLInputElement).value)}
      /></label
    >
    <div class="rgb-fields" aria-label="RGB color">
      {#each ['r', 'g', 'b'] as const as component}
        <label
          >{component.toUpperCase()}
          <input
            type="number"
            min="0"
            max="255"
            aria-label={component.toUpperCase()}
            use:transactionalField
            value={display(
              component === 'r' ? fields.red : component === 'g' ? fields.green : fields.blue
            )}
            placeholder="Mixed"
            oninput={(event) =>
              setColorComponent(component, (event.currentTarget as HTMLInputElement).value)}
          /></label
        >
      {/each}
    </div>
    <label
      ><input
        type="radio"
        name="color-mode"
        checked={fields.mode.kind === 'uniform' && fields.mode.value === 'RGB'}
        onchange={() => {
          session.setKelvinMode(false);
          session.setHex(
            [selected.color.r, selected.color.g, selected.color.b]
              .map((part) => part.toString(16).padStart(2, '0'))
              .join('')
          );
        }}
      /> RGB</label
    >
    <label
      ><input
        type="radio"
        name="color-mode"
        checked={fields.mode.kind === 'uniform' && fields.mode.value === 'COLOR_TEMPERATURE'}
        onchange={() => {
          session.setKelvinMode(true);
          session.setKelvinValue(
            fields.kelvin.kind === 'uniform' ? String(fields.kelvin.value || 2700) : '2700'
          );
        }}
      /> Kelvin</label
    >
    {#if fields.mode.kind === 'mixed'}<p role="status">Mixed RGB and Kelvin modes</p>{/if}
    {#if session.kelvinOn || fields.mode.kind === 'mixed'}
      <label
        >Color temperature <input
          aria-label="Kelvin"
          use:transactionalField
          type="number"
          min="1000"
          max="10000"
          value={display(fields.kelvin)}
          placeholder="Mixed"
          oninput={(event) =>
            session.setKelvinValue((event.currentTarget as HTMLInputElement).value)}
        /> K</label
      >
    {/if}
    <button
      disabled={!session.item || session.frameLoading}
      title={!session.item
        ? 'Open a movie first'
        : session.frameLoading
          ? 'Loading source frame…'
          : ''}
      onclick={onPickSource}>Pick color from movie</button
    >
    {#if !session.historyColors.length}<p>No recent colors yet.</p>{/if}
    <div class="history-swatches" aria-label="Recent colors">
      {#each session.historyColors as color, index (index)}
        <button
          type="button"
          aria-label={`Recent color ${index + 1}`}
          title={color}
          style={`background:${color}`}
          onclick={() => session.setHex(color.slice(1))}
        ></button>
      {/each}
    </div>
    <label
      >Brightness <input
        type="range"
        aria-label="Brightness"
        use:transactionalField
        min="0"
        max="100"
        value={fields.brightness.kind === 'uniform' ? fields.brightness.value : 50}
        aria-valuetext={fields.brightness.kind === 'mixed' ? 'Mixed brightness' : undefined}
        oninput={(event) => session.setBrightness((event.currentTarget as HTMLInputElement).value)}
      /><input
        type="text"
        inputmode="decimal"
        aria-label="Brightness value"
        use:transactionalField
        value={display(fields.brightness)}
        placeholder="Mixed"
        oninput={(event) => session.setBrightness((event.currentTarget as HTMLInputElement).value)}
      /></label
    >
    <label
      >Incoming fade <select
        aria-label="Fade type"
        value={display(fields.interpolation)}
        onchange={(event) =>
          session.setInterpolation(
            (event.currentTarget as HTMLSelectElement).value as 'STEP' | 'LINEAR'
          )}
        ><option value="" disabled>Mixed</option><option value="STEP">Hold</option><option
          value="LINEAR">Linear</option
        ></select
      ></label
    >
    <label
      >Incoming duration <input
        aria-label="Fade length"
        use:transactionalField
        type="number"
        min="0"
        value={display(fields.transitionMs)}
        placeholder="Mixed"
        onchange={(event) => session.setTransition((event.currentTarget as HTMLInputElement).value)}
      /> ms</label
    >
    {#if fields.count === 1 && selected.interpolation === 'LINEAR'}
      <p>
        Incoming fade: {format(Math.max(0, selected.timestampMs - selected.transitionMs))} → {format(
          selected.timestampMs
        )} (arrival)
      </p>
    {/if}
    <p>Linear fades arrive at the keyframe time. Hold keeps the previous state until arrival.</p>
    <p>
      Power: {fields.powerOn.kind === 'uniform' ? (fields.powerOn.value ? 'On' : 'Off') : 'Mixed'}
    </p>
    <button class="danger" onclick={() => session.deleteSelection()}>Delete</button>
  {:else if session.activeChannelId}
    <h2>{channel?.displayName}</h2>
    {#if channel}
      <dl aria-label="Channel identity">
        <dt>Channel</dt>
        <dd>{channel.id}</dd>
        <dt>Position</dt>
        <dd>{positionLabel(channel.spatialHint)}</dd>
      </dl>
      <label
        >Default color <input
          type="color"
          aria-label="Channel default color"
          value={'#' +
            [channel.defaultColor.r, channel.defaultColor.g, channel.defaultColor.b]
              .map((x) => x.toString(16).padStart(2, '0'))
              .join('')}
          oninput={(event) =>
            session.setDefaultColor(
              channel.id,
              (event.currentTarget as HTMLInputElement).value.slice(1)
            )}
        /></label
      >
      <label
        >Default brightness <input
          type="range"
          aria-label="Channel default brightness"
          min="0"
          max="100"
          value={channel.defaultBrightness}
          oninput={(event) =>
            session.setDefaultBrightness(
              channel.id,
              (event.currentTarget as HTMLInputElement).value
            )}
        /></label
      >
      {#if routedDescription}<p>{routedDescription}</p>{/if}
    {/if}
    <p>Click a lane to add a keyframe at that time.</p>
  {:else}
    <p>Click a lane to add a keyframe at that time.</p>
  {/if}
</aside>

<style>
  .inspector-toggle {
    display: none;
  }
  @media (max-width: 750px) {
    .inspector-toggle {
      display: block;
      margin-bottom: 8px;
    }
    .inspector.collapsed > :not(.inspector-toggle) {
      display: none;
    }
    .inspector.collapsed .inspector-toggle {
      margin-bottom: 0;
    }
  }
  .inspector {
    padding: var(--space-5);
    border-left: 1px solid var(--border);
    overflow: auto;
    background: var(--surface);
  }
  @media (max-width: 750px) {
    .inspector {
      border: 0;
      border-top: 1px solid var(--border);
    }
  }
  .inspector h2 {
    font-size: 16px;
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-5);
  }
  .inspector p {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
    margin-top: var(--space-5);
    overflow-wrap: anywhere;
  }
  .inspector button,
  .inspector input,
  .inspector select {
    min-height: 32px;
    padding: 6px 10px;
  }
  .inspector input:not([type='range']):not([type='checkbox']):not([type='radio']),
  .inspector select {
    min-height: 34px;
    padding: 6px 10px;
  }
  .inspector label {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-4) 0;
    color: var(--text-muted);
    font-size: 12px;
  }
  .inspector label input,
  .inspector label select {
    min-width: 0;
    max-width: 100%;
    color: var(--text);
  }
  .inspector label input[type='range'] + input {
    grid-column: 2;
  }
  .inspector label:has(input[type='radio']) {
    display: inline-flex;
    margin: var(--space-2) var(--space-4) var(--space-2) 0;
  }
  .inspector dl {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: var(--space-2);
    font-size: 12px;
  }
  .inspector dt {
    color: var(--text-muted);
  }
  .inspector dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .inspector input[type='radio'] {
    min-height: 0;
    accent-color: var(--accent);
  }
  .inspector input[type='color'] {
    width: 100%;
    height: 36px;
    padding: 3px;
  }
  .history-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .history-swatches button {
    width: 22px;
    height: 22px;
    min-height: 22px;
    padding: 0;
  }
  .rgb-fields {
    display: flex;
    gap: 6px;
  }
  .rgb-fields label {
    min-width: 0;
    flex: 1;
    grid-template-columns: 1fr;
    margin-top: 0;
  }
  .rgb-fields input {
    width: 100%;
  }
</style>
