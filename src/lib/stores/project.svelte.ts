import type { ProjectFile, CandidateMovieMetadata } from '$lib/types/project.js';
import type { Channel, EffectKeyframe, Keyframe, TrackMetadata } from '$lib/types/track.js';
import type { KeyframeStore } from '$lib/commands/add-keyframe.js';
import type { EffectKeyframeStore } from '$lib/commands/add-effect.js';
import type { ChannelStore } from '$lib/commands/add-channel.js';
import type { ChannelEditStore } from '$lib/commands/edit-channel.js';
import type { ChannelOrderStore } from '$lib/commands/reorder-channels.js';
import type { MetadataStore } from '$lib/commands/edit-metadata.js';
import type { SceneMarkerStore } from '$lib/commands/add-scene-marker.js';
import type { ChannelGroupStore } from '$lib/commands/channel-group.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import type { ChannelGroup } from '$lib/types/channels.js';

class ProjectStore implements KeyframeStore, ChannelStore, ChannelEditStore, ChannelOrderStore, MetadataStore, EffectKeyframeStore, SceneMarkerStore, ChannelGroupStore {
  file = $state<ProjectFile>(null!);
  isDirty = $state(false);
  displayName = $state('Untitled Project');
  videoFile = $state<File | null>(null);
  videoObjectUrl = $state<string | null>(null);

  load(file: ProjectFile): void {
    this.file = file;
    this.isDirty = false;
    this.displayName = file.track.metadata.title || 'Untitled Project';
  }

  markDirty(): void { this.isDirty = true; }
  markClean(): void { this.isDirty = false; }

  getKeyframes(): Keyframe[] { return this.file.track.keyframes; }
  addKeyframe(kf: Keyframe): void {
    this.file.track.keyframes.push(kf);
    this.markDirty();
  }
  removeKeyframe(id: string): void {
    this.file.track.keyframes = this.file.track.keyframes.filter((k) => k.id !== id);
    this.markDirty();
  }
  updateKeyframe(id: string, patch: Partial<Keyframe>): void {
    const kf = this.file.track.keyframes.find((k) => k.id === id);
    if (kf) Object.assign(kf, patch);
    this.markDirty();
  }

  getEffectKeyframes(): EffectKeyframe[] { return this.file.track.effectKeyframes; }
  addEffectKeyframe(kf: EffectKeyframe): void { this.file.track.effectKeyframes.push(kf); this.markDirty(); }
  removeEffectKeyframe(id: string): void { this.file.track.effectKeyframes = this.file.track.effectKeyframes.filter((k) => k.id !== id); this.markDirty(); }
  updateEffectKeyframe(id: string, patch: Partial<EffectKeyframe>): void { const kf = this.file.track.effectKeyframes.find((k) => k.id === id); if (kf) Object.assign(kf, patch); this.markDirty(); }

  getChannels(): Channel[] { return this.file.track.channels; }
  addChannel(ch: Channel): void {
    this.file.track.channels.push(ch);
    this.markDirty();
  }
  removeChannel(id: string): void {
    this.file.track.channels = this.file.track.channels.filter((c) => c.id !== id);
    this.markDirty();
  }

  updateChannel(id: string, patch: Partial<Channel>): void {
    const ch = this.file.track.channels.find((c) => c.id === id);
    if (ch) Object.assign(ch, patch);
    this.markDirty();
  }

  getChannelOrder(): string[] { return this.file.track.channels.map((c) => c.id); }
  setChannelOrder(ids: string[]): void {
    const map = new Map(this.file.track.channels.map((c) => [c.id, c]));
    this.file.track.channels = ids.map((id) => map.get(id)!).filter(Boolean);
    this.markDirty();
  }

  getMetadata(): TrackMetadata { return this.file.track.metadata; }
  updateMetadata(patch: Partial<TrackMetadata>): void {
    Object.assign(this.file.track.metadata, patch);
    this.displayName = this.file.track.metadata.title || 'Untitled Project';
    this.markDirty();
  }

  setVideoFile(file: File): void {
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    this.videoFile = file;
    this.videoObjectUrl = URL.createObjectURL(file);
    this.file.videoFilePath = file.name;
    this.markDirty();
  }

  getSceneMarkers(): SceneMarker[] { return this.file.sceneMarkers; }
  addSceneMarker(marker: SceneMarker): void {
    this.file.sceneMarkers.push(marker);
    this.markDirty();
  }
  removeSceneMarker(id: string): void {
    this.file.sceneMarkers = this.file.sceneMarkers.filter((m) => m.id !== id);
    this.markDirty();
  }

  getChannelGroups(): ChannelGroup[] { return this.file.channelGroups; }
  addChannelGroup(group: ChannelGroup): void {
    this.file.channelGroups.push(group);
    this.markDirty();
  }
  removeChannelGroup(id: string): void {
    this.file.channelGroups = this.file.channelGroups.filter((g) => g.id !== id);
    this.markDirty();
  }
  updateChannelGroup(id: string, patch: Partial<ChannelGroup>): void {
    const g = this.file.channelGroups.find((g) => g.id === id);
    if (g) Object.assign(g, patch);
    this.markDirty();
  }
}

export const projectStore = new ProjectStore();
