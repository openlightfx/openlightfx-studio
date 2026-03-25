// ============================================================
// Timeline Store — viewport and selection state
// ============================================================

import type { TimelineViewport, TimelineSelection } from '$lib/types/index.js';
import {
	MIN_PX_PER_MS,
	MAX_PX_PER_MS,
	DEFAULT_PX_PER_MS,
} from '$lib/types/index.js';

const ZOOM_FACTOR = 1.25;

function clampZoom(value: number): number {
	return Math.min(MAX_PX_PER_MS, Math.max(MIN_PX_PER_MS, value));
}

class TimelineStoreClass {
	viewport = $state<TimelineViewport>({
		pxPerMs: DEFAULT_PX_PER_MS,
		scrollX: 0,
		scrollY: 0,
		viewportWidth: 0,
		viewportHeight: 0,
	});

	selection = $state<TimelineSelection>({
		keyframeIds: [],
		effectKeyframeIds: [],
		sceneMarkerIds: [],
		activeChannelId: null,
		selectionRect: null,
	});

	// Derived viewport calculations
	get visibleStartMs(): number {
		return this.viewport.scrollX;
	}

	get visibleDurationMs(): number {
		if (this.viewport.pxPerMs === 0) return 0;
		return this.viewport.viewportWidth / this.viewport.pxPerMs;
	}

	get visibleEndMs(): number {
		return this.visibleStartMs + this.visibleDurationMs;
	}

	// Coordinate conversion
	msToPixel(ms: number): number {
		return (ms - this.viewport.scrollX) * this.viewport.pxPerMs;
	}

	pixelToMs(px: number): number {
		if (this.viewport.pxPerMs === 0) return 0;
		return px / this.viewport.pxPerMs + this.viewport.scrollX;
	}

	// Zoom methods
	zoomIn(): void {
		this.viewport = {
			...this.viewport,
			pxPerMs: clampZoom(this.viewport.pxPerMs * ZOOM_FACTOR),
		};
	}

	zoomOut(): void {
		this.viewport = {
			...this.viewport,
			pxPerMs: clampZoom(this.viewport.pxPerMs / ZOOM_FACTOR),
		};
	}

	zoomToFit(durationMs: number): void {
		if (durationMs <= 0 || this.viewport.viewportWidth <= 0) return;
		this.viewport = {
			...this.viewport,
			pxPerMs: clampZoom(this.viewport.viewportWidth / durationMs),
			scrollX: 0,
		};
	}

	setZoom(pxPerMs: number): void {
		this.viewport = {
			...this.viewport,
			pxPerMs: clampZoom(pxPerMs),
		};
	}

	// Scroll methods
	scrollTo(ms: number): void {
		this.viewport = {
			...this.viewport,
			scrollX: Math.max(0, ms),
		};
	}

	scrollBy(deltaMs: number): void {
		this.viewport = {
			...this.viewport,
			scrollX: Math.max(0, this.viewport.scrollX + deltaMs),
		};
	}

	/**
	 * Scroll the viewport so that `ms` is visible.
	 * If already in view, does nothing. If out of view, scrolls so the
	 * timestamp lands at ~20% from the left edge (giving runway ahead).
	 */
	ensureVisible(ms: number): void {
		const start = this.visibleStartMs;
		const end = this.visibleEndMs;
		const duration = this.visibleDurationMs;
		if (duration <= 0) return;
		if (ms >= start && ms <= end) return;
		// Place ms at 20% from the left
		const newScrollX = Math.max(0, ms - duration * 0.2);
		this.viewport = { ...this.viewport, scrollX: newScrollX };
	}

	setViewportSize(width: number, height: number): void {
		this.viewport = {
			...this.viewport,
			viewportWidth: width,
			viewportHeight: height,
		};
	}

	// Selection methods
	selectKeyframe(id: string, mode: 'replace' | 'toggle' | 'range' = 'replace'): void {
		if (mode === 'replace') {
			this.selection = {
				...this.selection,
				keyframeIds: [id],
				effectKeyframeIds: [],
				sceneMarkerIds: [],
				selectionRect: null,
			};
		} else if (mode === 'toggle') {
			const existing = this.selection.keyframeIds;
			const ids = existing.includes(id)
				? existing.filter((k) => k !== id)
				: [...existing, id];
			this.selection = {
				...this.selection,
				keyframeIds: ids,
				selectionRect: null,
			};
		} else {
			// range: add to existing selection
			const ids = this.selection.keyframeIds.includes(id)
				? this.selection.keyframeIds
				: [...this.selection.keyframeIds, id];
			this.selection = {
				...this.selection,
				keyframeIds: ids,
				selectionRect: null,
			};
		}
	}

	selectEffect(id: string): void {
		this.selection = {
			...this.selection,
			keyframeIds: [],
			effectKeyframeIds: [id],
			sceneMarkerIds: [],
			selectionRect: null,
		};
	}

	selectSceneMarker(id: string): void {
		this.selection = {
			...this.selection,
			keyframeIds: [],
			effectKeyframeIds: [],
			sceneMarkerIds: [id],
			selectionRect: null,
		};
	}

	clearSelection(): void {
		this.selection = {
			...this.selection,
			keyframeIds: [],
			effectKeyframeIds: [],
			sceneMarkerIds: [],
			selectionRect: null,
		};
	}

	selectAllInChannel(channelId: string, keyframeIds: string[]): void {
		this.selection = {
			...this.selection,
			keyframeIds,
			activeChannelId: channelId,
			selectionRect: null,
		};
	}

	setActiveChannel(channelId: string | null): void {
		this.selection = {
			...this.selection,
			activeChannelId: channelId,
		};
	}
}

export const timelineStore = new TimelineStoreClass();
