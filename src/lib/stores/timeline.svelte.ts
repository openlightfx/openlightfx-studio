import {
  DEFAULT_PX_PER_MS, MIN_PX_PER_MS, MAX_PX_PER_MS,
  MINIMAP_DEFAULT_HEIGHT, MINIMAP_MIN_HEIGHT, MINIMAP_MAX_HEIGHT,
} from '$lib/types/timeline.js';

class TimelineStore {
  pxPerMs = $state(DEFAULT_PX_PER_MS);
  scrollX = $state(0);
  scrollY = $state(0);
  viewportWidth = $state(0);
  viewportHeight = $state(0);
  minimapHeight = $state(MINIMAP_DEFAULT_HEIGHT);

  selectedKeyframeIds = $state<string[]>([]);
  selectedEffectIds = $state<string[]>([]);
  selectedMarkerIds = $state<string[]>([]);
  activeChannelId = $state<string | null>(null);
  selectionRect = $state<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  soloChannelIds = $state<Set<string>>(new Set());
  mutedChannelIds = $state<Set<string>>(new Set());

  get visibleStartMs(): number { return this.scrollX; }
  get visibleEndMs(): number { return this.scrollX + this.viewportWidth / this.pxPerMs; }

  setViewportSize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  zoom(factor: number, centerMs?: number): void {
    const center = centerMs ?? (this.scrollX + this.viewportWidth / this.pxPerMs / 2);
    const newPxPerMs = Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, this.pxPerMs * factor));
    const newScrollX = center - this.viewportWidth / newPxPerMs / 2;
    this.pxPerMs = newPxPerMs;
    this.scrollX = Math.max(0, newScrollX);
  }

  zoomToFit(durationMs: number): void {
    if (durationMs <= 0 || this.viewportWidth <= 0) return;
    this.pxPerMs = Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, this.viewportWidth / durationMs));
    this.scrollX = 0;
  }

  scrollTo(ms: number): void { this.scrollX = Math.max(0, ms); }
  scrollBy(deltaMs: number): void { this.scrollX = Math.max(0, this.scrollX + deltaMs); }

  selectKeyframe(id: string, additive = false): void {
    if (additive) {
      if (this.selectedKeyframeIds.includes(id)) {
        this.selectedKeyframeIds = this.selectedKeyframeIds.filter((k) => k !== id);
      } else {
        this.selectedKeyframeIds = [...this.selectedKeyframeIds, id];
      }
    } else {
      this.selectedKeyframeIds = [id];
    }
  }

  clearSelection(): void {
    this.selectedKeyframeIds = [];
    this.selectedEffectIds = [];
    this.selectedMarkerIds = [];
    this.selectionRect = null;
  }

  toggleSolo(channelId: string): void {
    const next = new Set(this.soloChannelIds);
    if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
    this.soloChannelIds = next;
  }

  toggleMute(channelId: string): void {
    const next = new Set(this.mutedChannelIds);
    if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
    this.mutedChannelIds = next;
  }

  isChannelAudible(channelId: string): boolean {
    if (this.mutedChannelIds.has(channelId)) return false;
    if (this.soloChannelIds.size > 0 && !this.soloChannelIds.has(channelId)) return false;
    return true;
  }

  resizeMinimap(height: number): void {
    this.minimapHeight = Math.max(MINIMAP_MIN_HEIGHT, Math.min(MINIMAP_MAX_HEIGHT, height));
  }
}

export const timelineStore = new TimelineStore();
