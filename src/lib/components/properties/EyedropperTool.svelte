<script lang="ts">
	import type { RGBColor } from '$lib/types';
	import { rgbToHex } from '$lib/utils/color';

	let {
		active,
		videoElement,
		onactivate,
		ondeactivate,
		onsample
	}: {
		active: boolean;
		videoElement: HTMLVideoElement | null;
		onactivate: () => void;
		ondeactivate: () => void;
		onsample: (color: RGBColor) => void;
	} = $props();

	let magnifierCanvas: HTMLCanvasElement | undefined = $state();
	let previewColor = $state<RGBColor>({ r: 0, g: 0, b: 0 });
	let magnifierPos = $state({ x: 0, y: 0 });
	let showMagnifier = $state(false);

	const ZOOM = 8;
	const GRID_SIZE = 9;
	const MAG_PX = GRID_SIZE * ZOOM;

	function getPixelColor(video: HTMLVideoElement, clientX: number, clientY: number): RGBColor | null {
		const rect = video.getBoundingClientRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;

		if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

		const scaleX = video.videoWidth / rect.width;
		const scaleY = video.videoHeight / rect.height;
		const vx = Math.floor(x * scaleX);
		const vy = Math.floor(y * scaleY);

		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.drawImage(video, 0, 0);
		const pixel = ctx.getImageData(vx, vy, 1, 1).data;
		return { r: pixel[0], g: pixel[1], b: pixel[2] };
	}

	function drawMagnifier(video: HTMLVideoElement, clientX: number, clientY: number) {
		if (!magnifierCanvas) return;
		const ctx = magnifierCanvas.getContext('2d');
		if (!ctx) return;

		const rect = video.getBoundingClientRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;
		const scaleX = video.videoWidth / rect.width;
		const scaleY = video.videoHeight / rect.height;
		const vx = Math.floor(x * scaleX);
		const vy = Math.floor(y * scaleY);

		const half = Math.floor(GRID_SIZE / 2);

		// Draw video frame to offscreen canvas
		const offscreen = document.createElement('canvas');
		offscreen.width = video.videoWidth;
		offscreen.height = video.videoHeight;
		const offCtx = offscreen.getContext('2d');
		if (!offCtx) return;
		offCtx.drawImage(video, 0, 0);

		ctx.clearRect(0, 0, MAG_PX, MAG_PX);

		for (let gy = 0; gy < GRID_SIZE; gy++) {
			for (let gx = 0; gx < GRID_SIZE; gx++) {
				const sx = vx - half + gx;
				const sy = vy - half + gy;

				if (sx >= 0 && sx < video.videoWidth && sy >= 0 && sy < video.videoHeight) {
					const pixel = offCtx.getImageData(sx, sy, 1, 1).data;
					ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
				} else {
					ctx.fillStyle = '#000';
				}
				ctx.fillRect(gx * ZOOM, gy * ZOOM, ZOOM, ZOOM);
			}
		}

		// Draw grid lines
		ctx.strokeStyle = 'rgba(255,255,255,0.15)';
		ctx.lineWidth = 0.5;
		for (let i = 0; i <= GRID_SIZE; i++) {
			ctx.beginPath();
			ctx.moveTo(i * ZOOM, 0);
			ctx.lineTo(i * ZOOM, MAG_PX);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, i * ZOOM);
			ctx.lineTo(MAG_PX, i * ZOOM);
			ctx.stroke();
		}

		// Center crosshair
		const cx = half * ZOOM;
		const cy = half * ZOOM;
		ctx.strokeStyle = 'white';
		ctx.lineWidth = 1.5;
		ctx.strokeRect(cx, cy, ZOOM, ZOOM);
	}

	function handleVideoMouseMove(e: MouseEvent) {
		if (!active || !videoElement) return;
		const c = getPixelColor(videoElement, e.clientX, e.clientY);
		if (c) previewColor = c;

		magnifierPos = { x: e.clientX + 20, y: e.clientY - MAG_PX - 20 };
		showMagnifier = true;
		drawMagnifier(videoElement, e.clientX, e.clientY);
	}

	function handleVideoClick(e: MouseEvent) {
		if (!active || !videoElement) return;
		e.preventDefault();
		e.stopPropagation();
		const c = getPixelColor(videoElement, e.clientX, e.clientY);
		if (c) {
			onsample(c);
		}
		ondeactivate();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (active && e.key === 'Escape') {
			ondeactivate();
		}
	}

	// Attach/detach video event listeners
	$effect(() => {
		if (!active || !videoElement) {
			showMagnifier = false;
			return;
		}

		videoElement.addEventListener('mousemove', handleVideoMouseMove);
		videoElement.addEventListener('click', handleVideoClick, true);
		videoElement.style.cursor = 'crosshair';

		return () => {
			if (videoElement) {
				videoElement.removeEventListener('mousemove', handleVideoMouseMove);
				videoElement.removeEventListener('click', handleVideoClick, true);
				videoElement.style.cursor = '';
			}
			showMagnifier = false;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex items-center gap-2">
	<button
		class="btn-icon flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors
			{active
			? 'bg-[var(--accent)] text-white'
			: 'bg-[var(--surface2)] text-[var(--text-muted)] hover:text-[var(--text)]'}"
		onclick={() => active ? ondeactivate() : onactivate()}
		title="Eyedropper Tool (sample color from video)"
	>
		<!-- Eyedropper icon -->
		<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M2 22l1-1h3l9-9" />
			<path d="M3 21v-3l9-9" />
			<path d="M14.5 5.5l4 4" />
			<path d="M18.5 1.5a2.121 2.121 0 0 1 3 3L16 10l-4-4 5.5-5.5z" />
		</svg>
		<span>Eyedropper</span>
	</button>

	{#if active}
		<div class="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
			<div
				class="w-4 h-4 rounded border border-[var(--surface2)]"
				style="background: {rgbToHex(previewColor)};"
			></div>
			<span class="font-mono">{rgbToHex(previewColor)}</span>
		</div>
	{/if}
</div>

<!-- Magnifier overlay -->
{#if active && showMagnifier}
	<div
		class="fixed z-50 pointer-events-none rounded-lg border-2 border-white/50 shadow-xl overflow-hidden"
		style="left: {magnifierPos.x}px; top: {magnifierPos.y}px;"
	>
		<canvas
			bind:this={magnifierCanvas}
			width={MAG_PX}
			height={MAG_PX}
			class="block"
			style="width: {MAG_PX}px; height: {MAG_PX}px;"
		></canvas>
		<div
			class="absolute bottom-0 left-0 right-0 text-center text-[10px] font-mono py-0.5"
			style="background: rgba(0,0,0,0.7); color: white;"
		>
			{rgbToHex(previewColor)}
		</div>
	</div>
{/if}
