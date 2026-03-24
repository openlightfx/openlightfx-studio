<script lang="ts">
  // Properties panel: contextually shows track metadata, channel properties, or keyframe properties
  // depending on what is currently selected.

  let {
    mode = 'track' as 'track' | 'channel' | 'keyframe' | 'effect',
    trackMetadata,
    channelData,
    keyframeData,
    effectData,
    safetyInfo,
    onmetadatachange,
    onchannelchange,
    onkeyframechange,
    oneffectchange,
  }: {
    mode?: 'track' | 'channel' | 'keyframe' | 'effect';
    trackMetadata?: {
      title: string;
      description: string;
      author: string;
      tags: string[];
      durationMs: number;
      startBehavior: string;
      endBehavior: string;
      trackVersion: string;
    };
    channelData?: {
      id: string;
      displayName: string;
      description: string;
      spatialHint: string;
      defaultBrightness: number;
      optional: boolean;
    };
    keyframeData?: {
      id: string;
      colorMode: string;
      color: { r: number; g: number; b: number };
      colorTemperature: number;
      brightness: number;
      transitionMs: number;
      interpolation: string;
      powerOn: boolean;
      timestampMs: number;
    };
    effectData?: {
      id: string;
      effectType: string;
      intensity: number;
      durationMs: number;
      primaryColor: { r: number; g: number; b: number };
      secondaryColor: { r: number; g: number; b: number };
    };
    safetyInfo?: {
      containsFlashing: boolean;
      containsStrobing: boolean;
      intensityRating: string;
      maxFlashFrequencyHz: number;
      maxBrightnessDelta: number;
    };
    onmetadatachange?: (field: string, value: unknown) => void;
    onchannelchange?: (field: string, value: unknown) => void;
    onkeyframechange?: (field: string, value: unknown) => void;
    oneffectchange?: (field: string, value: unknown) => void;
  } = $props();

  const spatialHints = [
    'SPATIAL_UNSPECIFIED',
    'SPATIAL_LEFT',
    'SPATIAL_RIGHT',
    'SPATIAL_CENTER',
    'SPATIAL_SURROUND_LEFT',
    'SPATIAL_SURROUND_RIGHT',
    'SPATIAL_CEILING',
    'SPATIAL_FLOOR',
    'SPATIAL_BEHIND_SCREEN',
    'SPATIAL_AMBIENT',
  ];

  const boundaryBehaviors = ['LEAVE', 'OFF', 'ON'];
  const interpolationModes = ['STEP', 'LINEAR'];
</script>

<div class="flex flex-col h-full bg-[var(--surface)] overflow-y-auto">
  <div class="panel-header flex items-center justify-between">
    <span>
      {#if mode === 'track'}Track Properties
      {:else if mode === 'channel'}Channel Properties
      {:else if mode === 'keyframe'}Keyframe Properties
      {:else if mode === 'effect'}Effect Properties
      {/if}
    </span>
  </div>

  <div class="flex-1 p-3 space-y-3 text-sm">
    {#if mode === 'track' && trackMetadata}
      <!-- Track metadata fields -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Title</label>
        <input
          class="input"
          value={trackMetadata.title}
          oninput={(e) =>
            onmetadatachange?.('title', (e.target as HTMLInputElement).value)}
          placeholder="Track title"
        />
      </div>
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Author</label>
        <input
          class="input"
          value={trackMetadata.author}
          oninput={(e) =>
            onmetadatachange?.('author', (e.target as HTMLInputElement).value)}
          placeholder="Author name"
        />
      </div>
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Description</label>
        <textarea
          class="input min-h-[60px] resize-y"
          value={trackMetadata.description}
          oninput={(e) =>
            onmetadatachange?.('description', (e.target as HTMLTextAreaElement).value)}
          placeholder="Track description"
        ></textarea>
      </div>
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Version</label>
        <input
          class="input"
          value={trackMetadata.trackVersion}
          oninput={(e) =>
            onmetadatachange?.('trackVersion', (e.target as HTMLInputElement).value)}
          placeholder="1.0"
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-[var(--text-muted)] mb-1">Start Behavior</label>
          <select
            class="input"
            value={trackMetadata.startBehavior}
            onchange={(e) =>
              onmetadatachange?.('startBehavior', (e.target as HTMLSelectElement).value)}
          >
            {#each boundaryBehaviors as b}
              <option value={b}>{b}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-xs text-[var(--text-muted)] mb-1">End Behavior</label>
          <select
            class="input"
            value={trackMetadata.endBehavior}
            onchange={(e) =>
              onmetadatachange?.('endBehavior', (e.target as HTMLSelectElement).value)}
          >
            {#each boundaryBehaviors as b}
              <option value={b}>{b}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Safety Info (read-only) -->
      {#if safetyInfo}
        <div class="mt-4 pt-3 border-t border-[var(--surface2)]">
          <h4 class="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Safety Info
          </h4>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-[var(--text-muted)]">Flashing</span>
              <span class={safetyInfo.containsFlashing ? 'text-danger' : 'text-success'}>
                {safetyInfo.containsFlashing ? 'Yes' : 'No'}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--text-muted)]">Strobing</span>
              <span class={safetyInfo.containsStrobing ? 'text-danger' : 'text-success'}>
                {safetyInfo.containsStrobing ? 'Yes' : 'No'}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--text-muted)]">Intensity</span>
              <span>{safetyInfo.intensityRating}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--text-muted)]">Max Flash Hz</span>
              <span>{safetyInfo.maxFlashFrequencyHz.toFixed(1)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--text-muted)]">Max Brightness Δ</span>
              <span>{safetyInfo.maxBrightnessDelta}%</span>
            </div>
          </div>
        </div>
      {/if}
    {:else if mode === 'channel' && channelData}
      <!-- Channel properties -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Channel ID</label>
        <input class="input" value={channelData.id} disabled />
      </div>
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Display Name</label>
        <input
          class="input"
          value={channelData.displayName}
          oninput={(e) =>
            onchannelchange?.('displayName', (e.target as HTMLInputElement).value)}
        />
      </div>
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Spatial Hint</label>
        <select
          class="input"
          value={channelData.spatialHint}
          onchange={(e) =>
            onchannelchange?.('spatialHint', (e.target as HTMLSelectElement).value)}
        >
          {#each spatialHints as hint}
            <option value={hint}>{hint.replace('SPATIAL_', '')}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">
          Default Brightness: {channelData.defaultBrightness}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          class="w-full accent-accent"
          value={channelData.defaultBrightness}
          oninput={(e) =>
            onchannelchange?.(
              'defaultBrightness',
              parseInt((e.target as HTMLInputElement).value)
            )}
        />
      </div>
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-accent"
          checked={channelData.optional}
          onchange={(e) =>
            onchannelchange?.('optional', (e.target as HTMLInputElement).checked)}
        />
        <label class="text-xs text-[var(--text-muted)]">Optional channel</label>
      </div>
    {:else if mode === 'keyframe' && keyframeData}
      <!-- Keyframe properties -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Timestamp</label>
        <input class="input font-mono" value={keyframeData.timestampMs} disabled />
      </div>

      <!-- Color mode toggle -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Color Mode</label>
        <div class="flex gap-1">
          <button
            class="btn-ghost text-xs flex-1"
            class:bg-accent={keyframeData.colorMode === 'RGB'}
            class:text-white={keyframeData.colorMode === 'RGB'}
            onclick={() => onkeyframechange?.('colorMode', 'RGB')}
          >
            RGB
          </button>
          <button
            class="btn-ghost text-xs flex-1"
            class:bg-accent={keyframeData.colorMode === 'COLOR_TEMPERATURE'}
            class:text-white={keyframeData.colorMode === 'COLOR_TEMPERATURE'}
            onclick={() => onkeyframechange?.('colorMode', 'COLOR_TEMPERATURE')}
          >
            Kelvin
          </button>
        </div>
      </div>

      {#if keyframeData.colorMode === 'RGB'}
        <!-- RGB color display -->
        <div>
          <label class="block text-xs text-[var(--text-muted)] mb-1">Color</label>
          <div class="flex items-center gap-2">
            <div
              class="w-8 h-8 rounded border border-[var(--surface2)]"
              style="background: rgb({keyframeData.color.r}, {keyframeData.color.g}, {keyframeData.color.b})"
            ></div>
            <input
              type="color"
              class="w-8 h-8 cursor-pointer"
              value="#{keyframeData.color.r.toString(16).padStart(2, '0')}{keyframeData.color.g.toString(16).padStart(2, '0')}{keyframeData.color.b.toString(16).padStart(2, '0')}"
              oninput={(e) => {
                const hex = (e.target as HTMLInputElement).value;
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                onkeyframechange?.('color', { r, g, b });
              }}
            />
          </div>
          <div class="grid grid-cols-3 gap-1 mt-2">
            <div>
              <label class="text-[10px] text-[var(--text-muted)]">R</label>
              <input
                type="number"
                min="0"
                max="255"
                class="input text-xs"
                value={keyframeData.color.r}
                oninput={(e) =>
                  onkeyframechange?.('color', {
                    ...keyframeData.color,
                    r: parseInt((e.target as HTMLInputElement).value) || 0,
                  })}
              />
            </div>
            <div>
              <label class="text-[10px] text-[var(--text-muted)]">G</label>
              <input
                type="number"
                min="0"
                max="255"
                class="input text-xs"
                value={keyframeData.color.g}
                oninput={(e) =>
                  onkeyframechange?.('color', {
                    ...keyframeData.color,
                    g: parseInt((e.target as HTMLInputElement).value) || 0,
                  })}
              />
            </div>
            <div>
              <label class="text-[10px] text-[var(--text-muted)]">B</label>
              <input
                type="number"
                min="0"
                max="255"
                class="input text-xs"
                value={keyframeData.color.b}
                oninput={(e) =>
                  onkeyframechange?.('color', {
                    ...keyframeData.color,
                    b: parseInt((e.target as HTMLInputElement).value) || 0,
                  })}
              />
            </div>
          </div>
        </div>
      {:else}
        <!-- Color Temperature -->
        <div>
          <label class="block text-xs text-[var(--text-muted)] mb-1">
            Temperature: {keyframeData.colorTemperature}K
          </label>
          <input
            type="range"
            min="1000"
            max="10000"
            step="100"
            class="w-full accent-accent"
            value={keyframeData.colorTemperature}
            oninput={(e) =>
              onkeyframechange?.(
                'colorTemperature',
                parseInt((e.target as HTMLInputElement).value)
              )}
          />
          <div class="flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>1000K (warm)</span>
            <span>10000K (cool)</span>
          </div>
        </div>
      {/if}

      <!-- Brightness -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">
          Brightness: {keyframeData.brightness}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          class="w-full accent-accent"
          value={keyframeData.brightness}
          oninput={(e) =>
            onkeyframechange?.('brightness', parseInt((e.target as HTMLInputElement).value))}
        />
      </div>

      <!-- Transition -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Transition (ms)</label>
        <input
          type="number"
          min="0"
          class="input"
          value={keyframeData.transitionMs}
          oninput={(e) =>
            onkeyframechange?.(
              'transitionMs',
              parseInt((e.target as HTMLInputElement).value) || 0
            )}
        />
      </div>

      <!-- Interpolation -->
      <div>
        <label class="block text-xs text-[var(--text-muted)] mb-1">Interpolation</label>
        <div class="flex gap-1">
          {#each interpolationModes as im}
            <button
              class="btn-ghost text-xs flex-1"
              class:bg-accent={keyframeData.interpolation === im}
              class:text-white={keyframeData.interpolation === im}
              onclick={() => onkeyframechange?.('interpolation', im)}
            >
              {im}
            </button>
          {/each}
        </div>
      </div>

      <!-- Power -->
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-accent"
          checked={keyframeData.powerOn}
          onchange={(e) =>
            onkeyframechange?.('powerOn', (e.target as HTMLInputElement).checked)}
        />
        <label class="text-xs text-[var(--text-muted)]">Power On</label>
      </div>
    {:else}
      <div class="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
        Select a keyframe, channel, or nothing to view track properties
      </div>
    {/if}
  </div>
</div>
