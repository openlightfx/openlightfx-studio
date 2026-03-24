import {
	createDefaultTrack,
	type Channel,
	type ChannelGroup,
	type EffectKeyframe,
	type Keyframe,
	type LightFXTrack,
	type SceneMarker
} from '$lib/types';

class ProjectStore {
	track: LightFXTrack = $state(createDefaultTrack());
	channelGroups: ChannelGroup[] = $state([]);
	sceneMarkers: SceneMarker[] = $state([]);
	channelOrder: string[] = $state([]);
	mutedChannels: Set<string> = $state(new Set());
	soloedChannels: Set<string> = $state(new Set());
	isDirty: boolean = $state(false);
	projectName: string = $state('Untitled Project');
	videoFilePath: string = $state('');

	sortedKeyframes: Keyframe[] = $derived(
		[...this.track.keyframes].sort((a, b) => a.timestampMs - b.timestampMs)
	);

	activeChannels: Channel[] = $derived.by(() => {
		const hasSolo = this.soloedChannels.size > 0;
		return this.track.channels.filter((ch) => {
			if (hasSolo) return this.soloedChannels.has(ch.id);
			return !this.mutedChannels.has(ch.id);
		});
	});

	newProject() {
		this.track = createDefaultTrack();
		this.channelGroups = [];
		this.sceneMarkers = [];
		this.channelOrder = [];
		this.mutedChannels = new Set();
		this.soloedChannels = new Set();
		this.isDirty = false;
		this.projectName = 'Untitled Project';
		this.videoFilePath = '';
	}

	markDirty() {
		this.isDirty = true;
	}

	markClean() {
		this.isDirty = false;
	}

	// ---- Channel operations ----

	addChannel(channel: Channel) {
		this.track.channels = [...this.track.channels, channel];
		this.channelOrder = [...this.channelOrder, channel.id];
		this.markDirty();
	}

	removeChannel(id: string) {
		this.track.channels = this.track.channels.filter((ch) => ch.id !== id);
		this.track.keyframes = this.track.keyframes.filter((kf) => kf.channelId !== id);
		this.track.effectKeyframes = this.track.effectKeyframes.filter(
			(ek) => ek.channelId !== id
		);
		this.channelOrder = this.channelOrder.filter((cid) => cid !== id);
		this.mutedChannels = new Set([...this.mutedChannels].filter((cid) => cid !== id));
		this.soloedChannels = new Set([...this.soloedChannels].filter((cid) => cid !== id));
		this.channelGroups = this.channelGroups
			.map((g) => ({
				...g,
				channelIds: g.channelIds.filter((cid) => cid !== id),
				offsets: g.offsets.filter((o) => o.channelId !== id)
			}))
			.filter((g) => g.channelIds.length > 0);
		this.markDirty();
	}

	updateChannel(id: string, changes: Partial<Channel>) {
		this.track.channels = this.track.channels.map((ch) =>
			ch.id === id ? { ...ch, ...changes } : ch
		);
		this.markDirty();
	}

	toggleMute(channelId: string) {
		const next = new Set(this.mutedChannels);
		if (next.has(channelId)) next.delete(channelId);
		else next.add(channelId);
		this.mutedChannels = next;
	}

	toggleSolo(channelId: string) {
		const next = new Set(this.soloedChannels);
		if (next.has(channelId)) next.delete(channelId);
		else next.add(channelId);
		this.soloedChannels = next;
	}

	reorderChannels(order: string[]) {
		this.channelOrder = order;
		this.markDirty();
	}

	// ---- Keyframe operations ----

	addKeyframe(kf: Keyframe) {
		this.track.keyframes = [...this.track.keyframes, kf];
		this.markDirty();
	}

	removeKeyframe(id: string) {
		this.track.keyframes = this.track.keyframes.filter((kf) => kf.id !== id);
		this.markDirty();
	}

	updateKeyframe(id: string, changes: Partial<Keyframe>) {
		this.track.keyframes = this.track.keyframes.map((kf) =>
			kf.id === id ? { ...kf, ...changes } : kf
		);
		this.markDirty();
	}

	getKeyframesForChannel(channelId: string): Keyframe[] {
		return this.track.keyframes
			.filter((kf) => kf.channelId === channelId)
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	getKeyframeAt(channelId: string, timestampMs: number): Keyframe | undefined {
		return this.track.keyframes.find(
			(kf) => kf.channelId === channelId && kf.timestampMs === timestampMs
		);
	}

	// ---- Effect keyframe operations ----

	addEffectKeyframe(ek: EffectKeyframe) {
		this.track.effectKeyframes = [...this.track.effectKeyframes, ek];
		this.markDirty();
	}

	removeEffectKeyframe(id: string) {
		this.track.effectKeyframes = this.track.effectKeyframes.filter((ek) => ek.id !== id);
		this.markDirty();
	}

	updateEffectKeyframe(id: string, changes: Partial<EffectKeyframe>) {
		this.track.effectKeyframes = this.track.effectKeyframes.map((ek) =>
			ek.id === id ? { ...ek, ...changes } : ek
		);
		this.markDirty();
	}

	// ---- Scene marker operations ----

	addSceneMarker(marker: SceneMarker) {
		this.sceneMarkers = [...this.sceneMarkers, marker].sort(
			(a, b) => a.timestampMs - b.timestampMs
		);
		this.markDirty();
	}

	removeSceneMarker(id: string) {
		this.sceneMarkers = this.sceneMarkers.filter((m) => m.id !== id);
		this.markDirty();
	}

	updateSceneMarker(id: string, changes: Partial<SceneMarker>) {
		this.sceneMarkers = this.sceneMarkers
			.map((m) => (m.id === id ? { ...m, ...changes } : m))
			.sort((a, b) => a.timestampMs - b.timestampMs);
		this.markDirty();
	}

	// ---- Channel group operations ----

	addChannelGroup(group: ChannelGroup) {
		this.channelGroups = [...this.channelGroups, group];
		this.markDirty();
	}

	removeChannelGroup(id: string) {
		this.channelGroups = this.channelGroups.filter((g) => g.id !== id);
		this.markDirty();
	}

	updateChannelGroup(id: string, changes: Partial<ChannelGroup>) {
		this.channelGroups = this.channelGroups.map((g) =>
			g.id === id ? { ...g, ...changes } : g
		);
		this.markDirty();
	}
}

export const projectStore = new ProjectStore();
