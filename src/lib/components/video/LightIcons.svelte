<script lang="ts">
	import type { Channel, Keyframe } from '$lib/types';
	import { interpolateAtTime } from '$lib/utils/interpolation';
	import { rgbToHex, contrastColor } from '$lib/utils/color';

	let {
		channels,
		keyframes,
		currentTimeMs,
		width,
		height,
		onaddKeyframe,
		oneditKeyframe
	}: {
		channels: Channel[];
		keyframes: Keyframe[];
		currentTimeMs: number;
		width: number;
		height: number;
		onaddKeyframe: (channelId: string) => void;
		oneditKeyframe: (keyframeId: string) => void;
	} = $props();

	let contextMenu = $state<{ x: number; y: number; channelId: string; nearbyKeyframeId: string | null } | null>(null);

	const SPATIAL_POSITIONS: Record<string, { x: string; y: string }> = {
		SPATIAL_LEFT: { x: '8%', y: '8%' },
		SPATIAL_CENTER: { x: '50%', y: '8%' },
		SPATIAL_RIGHT: { x: '92%', y: '8%' },
		SPATIAL_SURROUND_LEFT: { x: '8%', y: '92%' },
		SPATIAL_SURROUND_RIGHT: { x: '92%', y: '92%' },
		SPATIAL_AMBIENT: { x: '50%', y: '50%' }
	};

	// Threshold for "nearby" keyframe (within 500ms)
	const NEARBY_THRESHOLD_MS = 500;

	function getChannelKeyframes(channelId: string): Keyframe[] {
		return keyframes
			.filter((kf) => kf.channelId === channelId)
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	function getNearbyKeyframe(channelId: string): Keyframe | null {
		const chKeyframes = getChannelKeyframes(channelId);
		let closest: Keyframe | null = null;
		let closestDist = Infinity;
		for (const kf of chKeyframes) {
			const dist = Math.abs(kf.timestampMs - currentTimeMs);
			if (dist < closestDist && dist <= NEARBY_THRESHOLD_MS) {
				closestDist = dist;
				closest = kf;
			}
		}
		return closest;
	}

	function getChannelColor(channel: Channel): string {
		const chKeyframes = getChannelKeyframes(channel.id);
		const state = interpolateAtTime(chKeyframes, currentTimeMs, channel.defaultColor, channel.defaultBrightness);
		return rgbToHex(state.color);
	}

	function getChannelTextColor(channel: Channel): string {
		const chKeyframes = getChannelKeyframes(channel.id);
		const state = interpolateAtTime(chKeyframes, currentTimeMs, channel.defaultColor, channel.defaultBrightness);
		return contrastColor(state.color);
	}

	function spatialChannels(): Channel[] {
		return channels.filter(
			(ch) => ch.spatialHint && ch.spatialHint !== 'SPATIAL_UNSPECIFIED' && SPATIAL_POSITIONS[ch.spatialHint]
		);
	}

	function handleIconClick(e: MouseEvent, channel: Channel) {
		e.preventDefault();
		e.stopPropagation();
		const nearby = getNearbyKeyframe(channel.id);
		contextMenu = {
			x: e.clientX,
			y: e.clientY,
			channelId: channel.id,
			nearbyKeyframeId: nearby?.id ?? null
		};
	}

	function handleAddKeyframe() {
		if (contextMenu) {
			onaddKeyframe(contextMenu.channelId);
			contextMenu = null;
		}
	}

	function handleEditKeyframe() {
		if (contextMenu?.nearbyKeyframeId) {
			oneditKeyframe(contextMenu.nearbyKeyframeId);
			contextMenu = null;
		}
	}

	function closeMenu() {
		contextMenu = null;
	}

	// Close context menu on outside click
	function handleWindowClick() {
		if (contextMenu) contextMenu = null;
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="absolute inset-0 pointer-events-none" style="width: {width}px; height: {height}px;">
	{#each spatialChannels() as channel (channel.id)}
		{@const pos = SPATIAL_POSITIONS[channel.spatialHint]}
		{@const color = getChannelColor(channel)}
		{@const textColor = getChannelTextColor(channel)}
		<button
			class="absolute pointer-events-auto flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 group"
			style="left: {pos.x}; top: {pos.y};"
			onclick={(e) => handleIconClick(e, channel)}
			title={channel.displayName}
		>
			<!-- Bulb icon circle -->
			<div
				class="w-6 h-6 rounded-full border-2 border-white/40 shadow-lg transition-transform group-hover:scale-110 flex items-center justify-center"
				style="background: {color}; box-shadow: 0 0 8px {color}80;"
			>
				<!-- Bulb SVG -->
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke={textColor}
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M9 18h6" />
					<path d="M10 22h4" />
					<path
						d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
					/>
				</svg>
			</div>
			<span
				class="text-[9px] font-medium leading-none px-1 py-0.5 rounded whitespace-nowrap"
				style="background: var(--surface); color: var(--text); opacity: 0.85;"
			>
				{channel.displayName}
			</span>
		</button>
	{/each}
</div>

<!-- Context menu -->
{#if contextMenu}
	<div
		class="fixed z-50 min-w-[180px] rounded-lg shadow-xl border overflow-hidden"
		style="
			left: {contextMenu.x}px;
			top: {contextMenu.y}px;
			background: var(--surface);
			border-color: var(--surface2);
		"
		role="menu"
	>
		<button
			class="w-full text-left px-3 py-2 text-sm hover:brightness-125 transition-colors flex items-center gap-2"
			style="color: var(--text);"
			onclick={handleAddKeyframe}
			role="menuitem"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 5v14M5 12h14" />
			</svg>
			Add Keyframe at Current Time
		</button>
		{#if contextMenu.nearbyKeyframeId}
			<button
				class="w-full text-left px-3 py-2 text-sm hover:brightness-125 transition-colors flex items-center gap-2"
				style="color: var(--text);"
				onclick={handleEditKeyframe}
				role="menuitem"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
				</svg>
				Edit Keyframe
			</button>
		{/if}
	</div>
{/if}
