<script lang="ts">
	import type { RGBColor, ColorMode } from '$lib/types';
	import { rgbToHex, hexToRgb, kelvinToRgb, rgbToHsl, hslToRgb, contrastColor } from '$lib/utils/color';

	let {
		color,
		brightness,
		colorTemperature,
		colorMode,
		powerOn,
		onchange
	}: {
		color: RGBColor;
		brightness: number;
		colorTemperature: number;
		colorMode: ColorMode;
		powerOn: boolean;
		onchange: (field: string, value: any) => void;
	} = $props();

	const STORAGE_KEY = 'openlightfx-studio:color-history';
	const MAX_HISTORY = 16;

	let hexInput = $state(rgbToHex(color));
	let spectrumCanvas: HTMLCanvasElement | undefined = $state();
	let hueSliderCanvas: HTMLCanvasElement | undefined = $state();
	let currentHue = $state(rgbToHsl(color).h);

	let colorHistory = $state<RGBColor[]>(loadHistory());

	function loadHistory(): RGBColor[] {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) return JSON.parse(stored);
		} catch { /* ignore */ }
		return [];
	}

	function saveHistory(history: RGBColor[]) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
		} catch { /* ignore */ }
	}

	function pushToHistory(c: RGBColor) {
		const hex = rgbToHex(c);
		const filtered = colorHistory.filter((h) => rgbToHex(h) !== hex);
		const updated = [c, ...filtered].slice(0, MAX_HISTORY);
		colorHistory = updated;
		saveHistory(updated);
	}

	// Sync hex input when color prop changes
	$effect(() => {
		hexInput = rgbToHex(color);
		const hsl = rgbToHsl(color);
		if (hsl.s > 0.01) {
			currentHue = hsl.h;
		}
	});

	// Draw spectrum canvas
	$effect(() => {
		if (!spectrumCanvas) return;
		const ctx = spectrumCanvas.getContext('2d');
		if (!ctx) return;
		const w = spectrumCanvas.width;
		const h = spectrumCanvas.height;

		// Saturation gradient (left to right)
		for (let x = 0; x < w; x++) {
			for (let y = 0; y < h; y++) {
				const s = x / w;
				const l = 1 - y / h;
				const rgb = hslToRgb(currentHue, s, l);
				ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
				ctx.fillRect(x, y, 1, 1);
			}
		}

		// Draw position indicator
		const hsl = rgbToHsl(color);
		const px = hsl.s * w;
		const py = (1 - hsl.l) * h;
		ctx.beginPath();
		ctx.arc(px, py, 6, 0, Math.PI * 2);
		ctx.strokeStyle = 'white';
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(px, py, 5, 0, Math.PI * 2);
		ctx.strokeStyle = 'black';
		ctx.lineWidth = 1;
		ctx.stroke();
	});

	// Draw hue slider
	$effect(() => {
		if (!hueSliderCanvas) return;
		const ctx = hueSliderCanvas.getContext('2d');
		if (!ctx) return;
		const w = hueSliderCanvas.width;
		const h = hueSliderCanvas.height;

		for (let x = 0; x < w; x++) {
			const hue = x / w;
			const rgb = hslToRgb(hue, 1, 0.5);
			ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
			ctx.fillRect(x, 0, 1, h);
		}

		// Indicator
		const ix = currentHue * w;
		ctx.fillStyle = 'white';
		ctx.fillRect(ix - 1, 0, 3, h);
		ctx.strokeStyle = 'black';
		ctx.strokeRect(ix - 2, 0, 5, h);
	});

	function handleSpectrumClick(e: MouseEvent) {
		if (!spectrumCanvas) return;
		const rect = spectrumCanvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
		const newColor = hslToRgb(currentHue, x, 1 - y);
		pushToHistory(newColor);
		onchange('color', newColor);
	}

	let spectrumDragging = $state(false);

	function handleSpectrumPointerDown(e: MouseEvent) {
		spectrumDragging = true;
		handleSpectrumClick(e);
	}

	function handleSpectrumPointerMove(e: MouseEvent) {
		if (spectrumDragging) handleSpectrumClick(e);
	}

	function handleSpectrumPointerUp() {
		spectrumDragging = false;
	}

	function handleHueClick(e: MouseEvent) {
		if (!hueSliderCanvas) return;
		const rect = hueSliderCanvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		currentHue = x;
		const hsl = rgbToHsl(color);
		const newColor = hslToRgb(x, hsl.s, hsl.l);
		onchange('color', newColor);
	}

	let hueDragging = $state(false);

	function handleHuePointerDown(e: MouseEvent) {
		hueDragging = true;
		handleHueClick(e);
	}

	function handleHuePointerMove(e: MouseEvent) {
		if (hueDragging) handleHueClick(e);
	}

	function handleHuePointerUp() {
		hueDragging = false;
	}

	function handleRgbSlider(channel: 'r' | 'g' | 'b', value: number) {
		const newColor = { ...color, [channel]: value };
		pushToHistory(newColor);
		onchange('color', newColor);
	}

	function handleHexInput(value: string) {
		hexInput = value;
		if (/^#[0-9a-fA-F]{6}$/.test(value)) {
			try {
				const newColor = hexToRgb(value);
				pushToHistory(newColor);
				onchange('color', newColor);
			} catch { /* ignore invalid */ }
		}
	}

	function handleColorTempChange(value: number) {
		onchange('colorTemperature', value);
	}

	function handleBrightnessChange(value: number) {
		onchange('brightness', value);
	}

	function handlePowerToggle() {
		onchange('powerOn', !powerOn);
	}

	function handleModeToggle(mode: ColorMode) {
		onchange('colorMode', mode);
	}

	function handleHistoryClick(c: RGBColor) {
		onchange('color', c);
	}

	const tempPreviewColor = $derived(kelvinToRgb(colorTemperature));

	const previewColor = $derived(
		colorMode === 'COLOR_TEMPERATURE' ? kelvinToRgb(colorTemperature) : color
	);

	const previewHex = $derived(rgbToHex(previewColor));
</script>

<svelte:window
	onpointermove={spectrumDragging ? handleSpectrumPointerMove : hueDragging ? handleHuePointerMove : undefined}
	onpointerup={() => { spectrumDragging = false; hueDragging = false; }}
/>

<div class="flex flex-col gap-3 w-full">
	<!-- Power + Preview -->
	<div class="flex items-center gap-3">
		<button
			class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors
				{powerOn
				? 'border-[var(--success)] text-[var(--success)]'
				: 'border-[var(--text-muted)] text-[var(--text-muted)]'}"
			onclick={handlePowerToggle}
			title={powerOn ? 'Power Off' : 'Power On'}
		>
			⏻
		</button>
		<div
			class="w-10 h-10 rounded-lg border border-[var(--surface2)] flex-shrink-0"
			style="background: {previewHex}; opacity: {powerOn ? brightness / 100 : 0.2};"
		></div>
		<div class="flex-1 text-xs font-mono text-[var(--text-muted)]">
			{previewHex}
		</div>
	</div>

	<!-- Mode toggle -->
	<div class="flex rounded-lg overflow-hidden border border-[var(--surface2)]">
		<button
			class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors
				{colorMode === 'RGB'
				? 'bg-[var(--accent)] text-white'
				: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
			onclick={() => handleModeToggle('RGB')}
		>
			RGB
		</button>
		<button
			class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors
				{colorMode === 'COLOR_TEMPERATURE'
				? 'bg-[var(--accent)] text-white'
				: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
			onclick={() => handleModeToggle('COLOR_TEMPERATURE')}
		>
			Color Temp
		</button>
	</div>

	{#if colorMode === 'RGB'}
		<!-- Spectrum picker -->
		<div class="flex flex-col gap-2">
			<canvas
				bind:this={spectrumCanvas}
				width={256}
				height={160}
				class="w-full h-40 rounded-lg cursor-crosshair border border-[var(--surface2)]"
				onpointerdown={handleSpectrumPointerDown}
			></canvas>

			<!-- Hue slider -->
			<canvas
				bind:this={hueSliderCanvas}
				width={256}
				height={16}
				class="w-full h-4 rounded cursor-pointer border border-[var(--surface2)]"
				onpointerdown={handleHuePointerDown}
			></canvas>
		</div>

		<!-- RGB sliders -->
		<div class="flex flex-col gap-2">
			{#each [
				{ channel: 'r' as const, label: 'R', accent: '#ef4444' },
				{ channel: 'g' as const, label: 'G', accent: '#22c55e' },
				{ channel: 'b' as const, label: 'B', accent: '#3b82f6' }
			] as slider}
				<div class="flex items-center gap-2">
					<span class="text-xs font-mono w-3" style="color: {slider.accent};">{slider.label}</span>
					<input
						type="range"
						min="0"
						max="255"
						value={color[slider.channel]}
						class="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
						oninput={(e) => handleRgbSlider(slider.channel, parseInt(e.currentTarget.value))}
					/>
					<input
						type="number"
						min="0"
						max="255"
						value={color[slider.channel]}
						class="input w-14 text-xs text-center px-1 py-0.5"
						onchange={(e) => handleRgbSlider(slider.channel, Math.max(0, Math.min(255, parseInt(e.currentTarget.value) || 0)))}
					/>
				</div>
			{/each}
		</div>

		<!-- Hex input -->
		<div class="flex items-center gap-2">
			<span class="text-xs text-[var(--text-muted)]">Hex</span>
			<input
				type="text"
				value={hexInput}
				class="input flex-1 text-xs font-mono px-2 py-1"
				maxlength={7}
				oninput={(e) => handleHexInput(e.currentTarget.value)}
			/>
		</div>
	{:else}
		<!-- Color Temperature mode -->
		<div class="flex flex-col gap-2">
			<div
				class="w-full h-6 rounded-lg border border-[var(--surface2)]"
				style="background: linear-gradient(to right,
					{rgbToHex(kelvinToRgb(1000))},
					{rgbToHex(kelvinToRgb(2500))},
					{rgbToHex(kelvinToRgb(4000))},
					{rgbToHex(kelvinToRgb(5500))},
					{rgbToHex(kelvinToRgb(7000))},
					{rgbToHex(kelvinToRgb(8500))},
					{rgbToHex(kelvinToRgb(10000))});"
			></div>
			<div class="flex items-center gap-2">
				<span class="text-xs text-[var(--text-muted)] w-6">🔥</span>
				<input
					type="range"
					min="1000"
					max="10000"
					step="100"
					value={colorTemperature}
					class="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
					oninput={(e) => handleColorTempChange(parseInt(e.currentTarget.value))}
				/>
				<span class="text-xs text-[var(--text-muted)] w-6">❄️</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-xs text-[var(--text-muted)]">{colorTemperature}K</span>
				<div
					class="w-6 h-6 rounded border border-[var(--surface2)]"
					style="background: {rgbToHex(tempPreviewColor)};"
				></div>
			</div>
		</div>
	{/if}

	<!-- Brightness slider -->
	<div class="flex flex-col gap-1">
		<div class="flex items-center justify-between">
			<span class="text-xs text-[var(--text-muted)]">Brightness</span>
			<span class="text-xs font-mono text-[var(--text)]">{brightness}%</span>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-xs text-[var(--text-muted)]">☀</span>
			<input
				type="range"
				min="0"
				max="100"
				step="1"
				value={brightness}
				class="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
				oninput={(e) => handleBrightnessChange(parseInt(e.currentTarget.value))}
			/>
		</div>
	</div>

	<!-- Color history -->
	{#if colorHistory.length > 0}
		<div class="flex flex-col gap-1">
			<span class="text-xs text-[var(--text-muted)]">Recent Colors</span>
			<div class="flex flex-wrap gap-1">
				{#each colorHistory as histColor}
					<button
						class="w-5 h-5 rounded border border-[var(--surface2)] cursor-pointer hover:scale-110 transition-transform"
						style="background: {rgbToHex(histColor)};"
						title={rgbToHex(histColor)}
						onclick={() => handleHistoryClick(histColor)}
					></button>
				{/each}
			</div>
		</div>
	{/if}
</div>
