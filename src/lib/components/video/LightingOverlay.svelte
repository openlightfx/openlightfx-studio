<script lang="ts">
	import type { Channel, Keyframe, EffectKeyframe } from '$lib/types';
	import { interpolateAtTime } from '$lib/utils/interpolation';
	import { rgbToHex } from '$lib/utils/color';

	let {
		channels,
		keyframes,
		effectKeyframes,
		currentTimeMs,
		visible,
		mutedChannels,
		soloedChannels,
		width,
		height
	}: {
		channels: Channel[];
		keyframes: Keyframe[];
		effectKeyframes: EffectKeyframe[];
		currentTimeMs: number;
		visible: boolean;
		mutedChannels: Set<string>;
		soloedChannels: Set<string>;
		width: number;
		height: number;
	} = $props();

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let animFrameId: number | undefined = $state();

	const FRONT_HINTS = new Set(['SPATIAL_LEFT', 'SPATIAL_CENTER', 'SPATIAL_RIGHT']);
	const SURROUND_HINTS = new Set(['SPATIAL_SURROUND_LEFT', 'SPATIAL_SURROUND_RIGHT']);

	function isChannelActive(channelId: string): boolean {
		if (mutedChannels.has(channelId)) return false;
		if (soloedChannels.size > 0 && !soloedChannels.has(channelId)) return false;
		return true;
	}

	function getChannelKeyframes(channelId: string): Keyframe[] {
		return keyframes
			.filter((kf) => kf.channelId === channelId)
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	interface ChannelColorInfo {
		channel: Channel;
		hex: string;
		brightness: number;
	}

	function getActiveChannelColors(): ChannelColorInfo[] {
		const results: ChannelColorInfo[] = [];
		for (const ch of channels) {
			if (!isChannelActive(ch.id)) continue;
			const chKeyframes = getChannelKeyframes(ch.id);
			const state = interpolateAtTime(chKeyframes, currentTimeMs, ch.defaultColor, ch.defaultBrightness);
			if (!state.powerOn) continue;
			results.push({
				channel: ch,
				hex: rgbToHex(state.color),
				brightness: state.brightness
			});
		}
		return results;
	}

	function drawOverlay() {
		if (!canvasEl || !visible) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, width, height);

		const colors = getActiveChannelColors();

		const frontChannels = colors.filter((c) => FRONT_HINTS.has(c.channel.spatialHint));
		const surroundChannels = colors.filter((c) => SURROUND_HINTS.has(c.channel.spatialHint));
		const ambientChannels = colors.filter((c) => c.channel.spatialHint === 'SPATIAL_AMBIENT');

		// Front channels: glow bands along TOP edge
		drawFrontGlow(ctx, frontChannels);

		// Surround channels: glow bands along BOTTOM edge
		drawSurroundGlow(ctx, surroundChannels);

		// Ambient channels: soft border glow
		drawAmbientGlow(ctx, ambientChannels);
	}

	function drawFrontGlow(ctx: CanvasRenderingContext2D, channels: ChannelColorInfo[]) {
		if (channels.length === 0) return;
		const bandHeight = height * 0.15;
		const bandWidth = width / channels.length;

		// Sort by spatial position: left → center → right
		const order = ['SPATIAL_LEFT', 'SPATIAL_CENTER', 'SPATIAL_RIGHT'];
		const sorted = [...channels].sort(
			(a, b) => order.indexOf(a.channel.spatialHint) - order.indexOf(b.channel.spatialHint)
		);

		sorted.forEach((ch, i) => {
			const x = i * bandWidth;
			const alpha = ch.brightness / 100;
			const grad = ctx.createLinearGradient(x, 0, x, bandHeight);
			grad.addColorStop(0, hexWithAlpha(ch.hex, alpha * 0.7));
			grad.addColorStop(1, hexWithAlpha(ch.hex, 0));
			ctx.fillStyle = grad;
			ctx.fillRect(x, 0, bandWidth, bandHeight);
		});
	}

	function drawSurroundGlow(ctx: CanvasRenderingContext2D, channels: ChannelColorInfo[]) {
		if (channels.length === 0) return;
		const bandHeight = height * 0.15;
		const bandWidth = width / channels.length;

		const order = ['SPATIAL_SURROUND_LEFT', 'SPATIAL_SURROUND_RIGHT'];
		const sorted = [...channels].sort(
			(a, b) => order.indexOf(a.channel.spatialHint) - order.indexOf(b.channel.spatialHint)
		);

		sorted.forEach((ch, i) => {
			const x = i * bandWidth;
			const alpha = ch.brightness / 100;
			const y0 = height - bandHeight;
			const grad = ctx.createLinearGradient(x, height, x, y0);
			grad.addColorStop(0, hexWithAlpha(ch.hex, alpha * 0.7));
			grad.addColorStop(1, hexWithAlpha(ch.hex, 0));
			ctx.fillStyle = grad;
			ctx.fillRect(x, y0, bandWidth, bandHeight);
		});
	}

	function drawAmbientGlow(ctx: CanvasRenderingContext2D, channels: ChannelColorInfo[]) {
		if (channels.length === 0) return;

		// Blend all ambient channels
		let rSum = 0, gSum = 0, bSum = 0, brightnessSum = 0;
		for (const ch of channels) {
			const rgb = hexToRgbInline(ch.hex);
			rSum += rgb.r;
			gSum += rgb.g;
			bSum += rgb.b;
			brightnessSum += ch.brightness;
		}
		const n = channels.length;
		const hex = rgbToHex({ r: Math.round(rSum / n), g: Math.round(gSum / n), b: Math.round(bSum / n) });
		const alpha = (brightnessSum / n) / 100;
		const inset = Math.min(width, height) * 0.2;

		// Top edge
		const topGrad = ctx.createLinearGradient(0, 0, 0, inset);
		topGrad.addColorStop(0, hexWithAlpha(hex, alpha * 0.4));
		topGrad.addColorStop(1, hexWithAlpha(hex, 0));
		ctx.fillStyle = topGrad;
		ctx.fillRect(0, 0, width, inset);

		// Bottom edge
		const botGrad = ctx.createLinearGradient(0, height, 0, height - inset);
		botGrad.addColorStop(0, hexWithAlpha(hex, alpha * 0.4));
		botGrad.addColorStop(1, hexWithAlpha(hex, 0));
		ctx.fillStyle = botGrad;
		ctx.fillRect(0, height - inset, width, inset);

		// Left edge
		const leftGrad = ctx.createLinearGradient(0, 0, inset, 0);
		leftGrad.addColorStop(0, hexWithAlpha(hex, alpha * 0.4));
		leftGrad.addColorStop(1, hexWithAlpha(hex, 0));
		ctx.fillStyle = leftGrad;
		ctx.fillRect(0, 0, inset, height);

		// Right edge
		const rightGrad = ctx.createLinearGradient(width, 0, width - inset, 0);
		rightGrad.addColorStop(0, hexWithAlpha(hex, alpha * 0.4));
		rightGrad.addColorStop(1, hexWithAlpha(hex, 0));
		ctx.fillStyle = rightGrad;
		ctx.fillRect(width - inset, 0, inset, height);
	}

	function hexWithAlpha(hex: string, alpha: number): string {
		const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
			.toString(16)
			.padStart(2, '0');
		return hex + a;
	}

	function hexToRgbInline(hex: string): { r: number; g: number; b: number } {
		const c = hex.replace('#', '');
		return {
			r: parseInt(c.slice(0, 2), 16),
			g: parseInt(c.slice(2, 4), 16),
			b: parseInt(c.slice(4, 6), 16)
		};
	}

	$effect(() => {
		// Touch reactive deps to trigger redraws
		void currentTimeMs;
		void width;
		void height;
		void channels;
		void keyframes;
		void mutedChannels;
		void soloedChannels;
		void visible;

		if (!visible || !canvasEl) return;
		drawOverlay();
	});
</script>

{#if visible}
	<div class="absolute inset-0 pointer-events-none" style="width: {width}px; height: {height}px;">
		<canvas
			bind:this={canvasEl}
			{width}
			{height}
			class="absolute inset-0"
		></canvas>

		{#if channels.filter((ch) => (!ch.spatialHint || ch.spatialHint === 'SPATIAL_UNSPECIFIED') && isChannelActive(ch.id)).length > 0}
			<div
				class="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-1 text-xs"
				style="color: var(--text-muted);"
			>
				<span>Unassigned Channels:</span>
				{#each channels.filter((ch) => (!ch.spatialHint || ch.spatialHint === 'SPATIAL_UNSPECIFIED') && isChannelActive(ch.id)) as ch (ch.id)}
					<span class="px-1.5 py-0.5 rounded" style="background: var(--surface2);">
						{ch.displayName}
					</span>
				{/each}
			</div>
		{/if}
	</div>
{/if}
