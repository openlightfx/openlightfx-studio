import type { ClipboardData, Keyframe, SelectionState, TimelineViewport } from '$lib/types';
import { projectStore } from './project.svelte';

const MIN_PIXELS_PER_MS = 0.001;
const MAX_PIXELS_PER_MS = 10;
const ZOOM_FACTOR = 1.25;

class TimelineStore {
	viewport: TimelineViewport = $state({ startMs: 0, endMs: 300_000, pixelsPerMs: 0.05 });
	zoom: number = $state(1.0);
	scrollX: number = $state(0);
	scrollY: number = $state(0);
	playheadMs: number = $state(0);
	isPlaying: boolean = $state(false);
	playbackSpeed: number = $state(1);
	selection: SelectionState = $state({
		selectedKeyframeIds: new Set(),
		selectedEffectIds: new Set(),
		selectedChannelId: null,
		selectedSceneMarkerId: null
	});
	clipboard: ClipboardData | null = $state(null);
	snappingEnabled: boolean = $state(true);
	overlayVisible: boolean = $state(true);

	// ---- Playhead ----

	setPlayhead(ms: number) {
		this.playheadMs = Math.max(0, ms);
	}

	play() {
		this.isPlaying = true;
	}

	pause() {
		this.isPlaying = false;
	}

	togglePlayback() {
		this.isPlaying = !this.isPlaying;
	}

	setPlaybackSpeed(speed: number) {
		this.playbackSpeed = speed;
	}

	// ---- Zoom ----

	zoomIn() {
		const next = this.viewport.pixelsPerMs * ZOOM_FACTOR;
		if (next <= MAX_PIXELS_PER_MS) {
			this.viewport = { ...this.viewport, pixelsPerMs: next };
			this.zoom *= ZOOM_FACTOR;
		}
	}

	zoomOut() {
		const next = this.viewport.pixelsPerMs / ZOOM_FACTOR;
		if (next >= MIN_PIXELS_PER_MS) {
			this.viewport = { ...this.viewport, pixelsPerMs: next };
			this.zoom /= ZOOM_FACTOR;
		}
	}

	zoomToFit() {
		const durationMs = projectStore.track.metadata.durationMs;
		if (durationMs <= 0) return;
		const viewportWidthMs = this.viewport.endMs - this.viewport.startMs;
		if (viewportWidthMs <= 0) return;
		const pixelsPerMs = viewportWidthMs / durationMs;
		this.viewport = {
			startMs: 0,
			endMs: durationMs,
			pixelsPerMs: Math.max(MIN_PIXELS_PER_MS, Math.min(MAX_PIXELS_PER_MS, pixelsPerMs))
		};
		this.scrollX = 0;
		this.zoom = 1.0;
	}

	setViewport(startMs: number, endMs: number) {
		const span = endMs - startMs;
		if (span <= 0) return;
		this.viewport = {
			startMs,
			endMs,
			pixelsPerMs: this.viewport.pixelsPerMs
		};
	}

	// ---- Coordinate conversion ----

	msToPixel(ms: number): number {
		return (ms - this.viewport.startMs) * this.viewport.pixelsPerMs;
	}

	pixelToMs(px: number): number {
		return px / this.viewport.pixelsPerMs + this.viewport.startMs;
	}

	// ---- Selection ----

	selectKeyframe(id: string) {
		this.selection = {
			...this.selection,
			selectedKeyframeIds: new Set([id]),
			selectedEffectIds: new Set(),
			selectedSceneMarkerId: null
		};
	}

	toggleKeyframeSelection(id: string) {
		const next = new Set(this.selection.selectedKeyframeIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.selection = { ...this.selection, selectedKeyframeIds: next };
	}

	selectEffectKeyframe(id: string) {
		this.selection = {
			...this.selection,
			selectedEffectIds: new Set([id]),
			selectedKeyframeIds: new Set(),
			selectedSceneMarkerId: null
		};
	}

	toggleEffectSelection(id: string) {
		const next = new Set(this.selection.selectedEffectIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.selection = { ...this.selection, selectedEffectIds: next };
	}

	selectChannel(id: string | null) {
		this.selection = { ...this.selection, selectedChannelId: id };
	}

	selectSceneMarker(id: string | null) {
		this.selection = {
			...this.selection,
			selectedSceneMarkerId: id,
			selectedKeyframeIds: new Set(),
			selectedEffectIds: new Set()
		};
	}

	selectRange(startId: string, endId: string) {
		const sorted = projectStore.sortedKeyframes;
		const startIdx = sorted.findIndex((kf) => kf.id === startId);
		const endIdx = sorted.findIndex((kf) => kf.id === endId);
		if (startIdx === -1 || endIdx === -1) return;
		const lo = Math.min(startIdx, endIdx);
		const hi = Math.max(startIdx, endIdx);
		const ids = new Set(sorted.slice(lo, hi + 1).map((kf) => kf.id));
		this.selection = {
			...this.selection,
			selectedKeyframeIds: ids,
			selectedEffectIds: new Set()
		};
	}

	clearSelection() {
		this.selection = {
			selectedKeyframeIds: new Set(),
			selectedEffectIds: new Set(),
			selectedChannelId: null,
			selectedSceneMarkerId: null
		};
	}

	// ---- Clipboard ----

	copySelection() {
		if (this.selection.selectedKeyframeIds.size === 0) return;
		const ids = this.selection.selectedKeyframeIds;
		const keyframes = projectStore.track.keyframes.filter((kf) => ids.has(kf.id));
		if (keyframes.length === 0) return;
		const sourceChannelId = keyframes[0].channelId;
		this.clipboard = {
			keyframes: keyframes.map((kf) => ({ ...kf })),
			sourceChannelId
		};
	}

	pasteAtPlayhead(targetChannelId?: string) {
		if (!this.clipboard || this.clipboard.keyframes.length === 0) return;
		const channelId = targetChannelId ?? this.clipboard.sourceChannelId;
		const minTimestamp = Math.min(...this.clipboard.keyframes.map((kf) => kf.timestampMs));
		const offset = this.playheadMs - minTimestamp;
		const pasted: Keyframe[] = this.clipboard.keyframes.map((kf) => ({
			...kf,
			id: crypto.randomUUID(),
			channelId,
			timestampMs: kf.timestampMs + offset
		}));
		for (const kf of pasted) {
			projectStore.addKeyframe(kf);
		}
	}

	deleteSelection() {
		for (const id of this.selection.selectedKeyframeIds) {
			projectStore.removeKeyframe(id);
		}
		for (const id of this.selection.selectedEffectIds) {
			projectStore.removeEffectKeyframe(id);
		}
		if (this.selection.selectedSceneMarkerId) {
			projectStore.removeSceneMarker(this.selection.selectedSceneMarkerId);
		}
		this.clearSelection();
	}
}

export const timelineStore = new TimelineStore();
