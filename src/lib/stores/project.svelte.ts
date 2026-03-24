// ============================================================
// Project Store — central track data management with undo integration
// ============================================================

import type {
	Channel,
	Keyframe,
	EffectKeyframe,
	TrackMetadata,
	RGBColor,
	LightFXTrack,
	Command,
	SerializedCommandData,
} from '$lib/types/index.js';
import type { ChannelGroup } from '$lib/types/index.js';
import type { SceneMarker } from '$lib/types/index.js';
import type { ProjectFile, ProjectState } from '$lib/types/index.js';
import {
	DEFAULT_RGB_COLOR,
	DEFAULT_INTERPOLATION,
	DEFAULT_COLOR_MODE,
	DEFAULT_BRIGHTNESS,
	TRACK_FORMAT_VERSION,
	PROJECT_FORMAT_VERSION,
	DEFAULT_UI_STATE,
} from '$lib/types/index.js';
import { undoStore } from './undo.svelte.js';

// ============================================================
// Default factories
// ============================================================

function createDefaultMetadata(): TrackMetadata {
	return {
		title: 'Untitled Track',
		description: '',
		movieReference: { imdbId: '', title: '', year: 0, runtimeMinutes: 0 },
		author: '',
		tags: [],
		durationMs: 0,
		startBehavior: 'BOUNDARY_UNSPECIFIED',
		endBehavior: 'BOUNDARY_UNSPECIFIED',
		preshowDurationMs: 0,
		preshowState: 'PRESHOW_UNSPECIFIED',
		creditsStartMs: 0,
		creditsBehavior: 'CREDITS_UNSPECIFIED',
		trackVersion: '1.0.0',
	};
}

function createDefaultTrack(): LightFXTrack {
	return {
		version: TRACK_FORMAT_VERSION,
		metadata: createDefaultMetadata(),
		channels: [],
		keyframes: [],
		effectKeyframes: [],
		safetyInfo: {
			containsFlashing: false,
			containsStrobing: false,
			maxFlashFrequencyHz: 0,
			maxBrightnessDelta: 0,
			warningText: '',
			intensityRating: 'INTENSITY_UNSPECIFIED',
		},
	};
}

function createDefaultProjectFile(): ProjectFile {
	return {
		formatVersion: PROJECT_FORMAT_VERSION,
		projectId: crypto.randomUUID(),
		track: createDefaultTrack(),
		channelGroups: [],
		sceneMarkers: [],
		undoHistory: [],
		undoPointer: 0,
		uiState: { ...DEFAULT_UI_STATE },
		videoFilePath: '',
		candidateMetadata: {},
		lastModified: new Date().toISOString(),
	};
}

function createDefaultProjectState(): ProjectState {
	return {
		file: createDefaultProjectFile(),
		isDirty: false,
		displayName: 'Untitled Track',
		videoFile: null,
		videoObjectUrl: null,
	};
}

/** Create a black keyframe at timestamp 0 for a channel (STU-050a) */
function createBlackKeyframe(channelId: string): Keyframe {
	return {
		id: crypto.randomUUID(),
		channelId,
		timestampMs: 0,
		colorMode: DEFAULT_COLOR_MODE,
		color: { ...DEFAULT_RGB_COLOR },
		colorTemperature: 2700,
		brightness: 0,
		transitionMs: 0,
		interpolation: DEFAULT_INTERPOLATION,
		powerOn: false,
	};
}

/**
 * Find the previous keyframe on a channel before a given timestamp (STU-039).
 * Returns default black values if no previous keyframe exists.
 */
function getPreviousKeyframeState(
	keyframes: Keyframe[],
	channelId: string,
	timestampMs: number
): Pick<Keyframe, 'color' | 'colorMode' | 'colorTemperature' | 'brightness' | 'powerOn'> {
	const channelKfs = keyframes
		.filter((kf) => kf.channelId === channelId && kf.timestampMs < timestampMs)
		.sort((a, b) => b.timestampMs - a.timestampMs);

	const prev = channelKfs[0];
	if (prev) {
		return {
			color: { ...prev.color },
			colorMode: prev.colorMode,
			colorTemperature: prev.colorTemperature,
			brightness: prev.brightness,
			powerOn: prev.powerOn,
		};
	}

	return {
		color: { ...DEFAULT_RGB_COLOR },
		colorMode: DEFAULT_COLOR_MODE,
		colorTemperature: 2700,
		brightness: 0,
		powerOn: false,
	};
}

// ============================================================
// Command implementations
// ============================================================

class AddKeyframeCommand implements Command {
	readonly type = 'ADD_KEYFRAME';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private keyframe: Keyframe
	) {
		this.description = `Add keyframe at ${keyframe.timestampMs}ms`;
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, keyframes: [...track.keyframes, this.keyframe] });
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			keyframes: track.keyframes.filter((kf) => kf.id !== this.keyframe.id),
		});
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.keyframe };
	}
}

class RemoveKeyframeCommand implements Command {
	readonly type = 'DELETE_KEYFRAME';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private keyframe: Keyframe
	) {
		this.description = `Delete keyframe at ${keyframe.timestampMs}ms`;
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			keyframes: track.keyframes.filter((kf) => kf.id !== this.keyframe.id),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, keyframes: [...track.keyframes, this.keyframe] });
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.keyframe };
	}
}

class UpdateKeyframeCommand implements Command {
	readonly type = 'EDIT_KEYFRAME';
	readonly description = 'Edit keyframe';
	constructor(
		private store: ProjectStoreClass,
		private oldKeyframe: Keyframe,
		private newKeyframe: Keyframe
	) {}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			keyframes: track.keyframes.map((kf) => (kf.id === this.newKeyframe.id ? this.newKeyframe : kf)),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			keyframes: track.keyframes.map((kf) => (kf.id === this.oldKeyframe.id ? this.oldKeyframe : kf)),
		});
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { old: this.oldKeyframe, new: this.newKeyframe },
		};
	}
}

class MoveKeyframeCommand implements Command {
	readonly type = 'MOVE_KEYFRAME';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private keyframeId: string,
		private oldTimestampMs: number,
		private newTimestampMs: number
	) {
		this.description = `Move keyframe to ${newTimestampMs}ms`;
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			keyframes: track.keyframes.map((kf) =>
				kf.id === this.keyframeId ? { ...kf, timestampMs: this.newTimestampMs } : kf
			),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			keyframes: track.keyframes.map((kf) =>
				kf.id === this.keyframeId ? { ...kf, timestampMs: this.oldTimestampMs } : kf
			),
		});
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { id: this.keyframeId, from: this.oldTimestampMs, to: this.newTimestampMs },
		};
	}
}

class AddChannelCommand implements Command {
	readonly type = 'ADD_CHANNEL';
	readonly description: string;
	private blackKeyframe: Keyframe;
	constructor(
		private store: ProjectStoreClass,
		private channel: Channel
	) {
		this.description = `Add channel "${channel.displayName}"`;
		this.blackKeyframe = createBlackKeyframe(channel.id);
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			channels: [...track.channels, this.channel],
			keyframes: [...track.keyframes, this.blackKeyframe],
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			channels: track.channels.filter((ch) => ch.id !== this.channel.id),
			keyframes: track.keyframes.filter(
				(kf) => kf.id !== this.blackKeyframe.id && kf.channelId !== this.channel.id
			),
		});
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { channel: this.channel, blackKeyframe: this.blackKeyframe },
		};
	}
}

class RemoveChannelCommand implements Command {
	readonly type = 'DELETE_CHANNEL';
	readonly description: string;
	private removedKeyframes: Keyframe[] = [];
	private removedEffectKeyframes: EffectKeyframe[] = [];
	constructor(
		private store: ProjectStoreClass,
		private channel: Channel
	) {
		this.description = `Delete channel "${channel.displayName}"`;
		const track = store.project.file.track;
		this.removedKeyframes = track.keyframes.filter((kf) => kf.channelId === channel.id);
		this.removedEffectKeyframes = track.effectKeyframes.filter((ef) => ef.channelId === channel.id);
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			channels: track.channels.filter((ch) => ch.id !== this.channel.id),
			keyframes: track.keyframes.filter((kf) => kf.channelId !== this.channel.id),
			effectKeyframes: track.effectKeyframes.filter((ef) => ef.channelId !== this.channel.id),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			channels: [...track.channels, this.channel],
			keyframes: [...track.keyframes, ...this.removedKeyframes],
			effectKeyframes: [...track.effectKeyframes, ...this.removedEffectKeyframes],
		});
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: {
				channel: this.channel,
				keyframes: this.removedKeyframes,
				effectKeyframes: this.removedEffectKeyframes,
			},
		};
	}
}

class UpdateChannelCommand implements Command {
	readonly type = 'EDIT_CHANNEL';
	readonly description = 'Edit channel';
	constructor(
		private store: ProjectStoreClass,
		private oldChannel: Channel,
		private newChannel: Channel
	) {}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			channels: track.channels.map((ch) => (ch.id === this.newChannel.id ? this.newChannel : ch)),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			channels: track.channels.map((ch) => (ch.id === this.oldChannel.id ? this.oldChannel : ch)),
		});
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { old: this.oldChannel, new: this.newChannel },
		};
	}
}

class ReorderChannelsCommand implements Command {
	readonly type = 'REORDER_CHANNELS';
	readonly description = 'Reorder channels';
	private oldOrder: Channel[];
	constructor(
		private store: ProjectStoreClass,
		private newOrder: Channel[]
	) {
		this.oldOrder = [...store.project.file.track.channels];
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, channels: [...this.newOrder] });
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, channels: [...this.oldOrder] });
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { oldOrder: this.oldOrder.map((c) => c.id), newOrder: this.newOrder.map((c) => c.id) },
		};
	}
}

class AddEffectKeyframeCommand implements Command {
	readonly type = 'ADD_EFFECT';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private effect: EffectKeyframe
	) {
		this.description = `Add ${effect.effectType} effect`;
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, effectKeyframes: [...track.effectKeyframes, this.effect] });
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			effectKeyframes: track.effectKeyframes.filter((ef) => ef.id !== this.effect.id),
		});
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.effect };
	}
}

class RemoveEffectKeyframeCommand implements Command {
	readonly type = 'DELETE_EFFECT';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private effect: EffectKeyframe
	) {
		this.description = `Delete ${effect.effectType} effect`;
	}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			effectKeyframes: track.effectKeyframes.filter((ef) => ef.id !== this.effect.id),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, effectKeyframes: [...track.effectKeyframes, this.effect] });
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.effect };
	}
}

class UpdateEffectKeyframeCommand implements Command {
	readonly type = 'EDIT_EFFECT';
	readonly description = 'Edit effect';
	constructor(
		private store: ProjectStoreClass,
		private oldEffect: EffectKeyframe,
		private newEffect: EffectKeyframe
	) {}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			effectKeyframes: track.effectKeyframes.map((ef) =>
				ef.id === this.newEffect.id ? this.newEffect : ef
			),
		});
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({
			...track,
			effectKeyframes: track.effectKeyframes.map((ef) =>
				ef.id === this.oldEffect.id ? this.oldEffect : ef
			),
		});
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { old: this.oldEffect, new: this.newEffect },
		};
	}
}

class UpdateMetadataCommand implements Command {
	readonly type = 'EDIT_METADATA';
	readonly description = 'Edit track metadata';
	constructor(
		private store: ProjectStoreClass,
		private oldMetadata: TrackMetadata,
		private newMetadata: TrackMetadata
	) {}
	execute(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, metadata: { ...this.newMetadata } });
	}
	undo(): void {
		const track = this.store.project.file.track;
		this.store.setTrack({ ...track, metadata: { ...this.oldMetadata } });
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { old: this.oldMetadata, new: this.newMetadata },
		};
	}
}

class AddSceneMarkerCommand implements Command {
	readonly type = 'ADD_SCENE_MARKER';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private marker: SceneMarker
	) {
		this.description = `Add scene marker "${marker.label}"`;
	}
	execute(): void {
		this.store.setSceneMarkers([...this.store.project.file.sceneMarkers, this.marker]);
	}
	undo(): void {
		this.store.setSceneMarkers(
			this.store.project.file.sceneMarkers.filter((m) => m.id !== this.marker.id)
		);
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.marker };
	}
}

class RemoveSceneMarkerCommand implements Command {
	readonly type = 'DELETE_SCENE_MARKER';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private marker: SceneMarker
	) {
		this.description = `Delete scene marker "${marker.label}"`;
	}
	execute(): void {
		this.store.setSceneMarkers(
			this.store.project.file.sceneMarkers.filter((m) => m.id !== this.marker.id)
		);
	}
	undo(): void {
		this.store.setSceneMarkers([...this.store.project.file.sceneMarkers, this.marker]);
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.marker };
	}
}

class UpdateSceneMarkerCommand implements Command {
	readonly type = 'EDIT_SCENE_MARKER';
	readonly description = 'Edit scene marker';
	constructor(
		private store: ProjectStoreClass,
		private oldMarker: SceneMarker,
		private newMarker: SceneMarker
	) {}
	execute(): void {
		this.store.setSceneMarkers(
			this.store.project.file.sceneMarkers.map((m) =>
				m.id === this.newMarker.id ? this.newMarker : m
			)
		);
	}
	undo(): void {
		this.store.setSceneMarkers(
			this.store.project.file.sceneMarkers.map((m) =>
				m.id === this.oldMarker.id ? this.oldMarker : m
			)
		);
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { old: this.oldMarker, new: this.newMarker },
		};
	}
}

class AddChannelGroupCommand implements Command {
	readonly type = 'ADD_CHANNEL_GROUP';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private group: ChannelGroup
	) {
		this.description = `Add channel group "${group.name}"`;
	}
	execute(): void {
		this.store.setChannelGroups([...this.store.project.file.channelGroups, this.group]);
	}
	undo(): void {
		this.store.setChannelGroups(
			this.store.project.file.channelGroups.filter((g) => g.id !== this.group.id)
		);
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.group };
	}
}

class RemoveChannelGroupCommand implements Command {
	readonly type = 'DELETE_CHANNEL_GROUP';
	readonly description: string;
	constructor(
		private store: ProjectStoreClass,
		private group: ChannelGroup
	) {
		this.description = `Delete channel group "${group.name}"`;
	}
	execute(): void {
		this.store.setChannelGroups(
			this.store.project.file.channelGroups.filter((g) => g.id !== this.group.id)
		);
	}
	undo(): void {
		this.store.setChannelGroups([...this.store.project.file.channelGroups, this.group]);
	}
	serialize(): SerializedCommandData {
		return { type: this.type, description: this.description, payload: this.group };
	}
}

class UpdateChannelGroupCommand implements Command {
	readonly type = 'EDIT_CHANNEL_GROUP';
	readonly description = 'Edit channel group';
	constructor(
		private store: ProjectStoreClass,
		private oldGroup: ChannelGroup,
		private newGroup: ChannelGroup
	) {}
	execute(): void {
		this.store.setChannelGroups(
			this.store.project.file.channelGroups.map((g) =>
				g.id === this.newGroup.id ? this.newGroup : g
			)
		);
	}
	undo(): void {
		this.store.setChannelGroups(
			this.store.project.file.channelGroups.map((g) =>
				g.id === this.oldGroup.id ? this.oldGroup : g
			)
		);
	}
	serialize(): SerializedCommandData {
		return {
			type: this.type,
			description: this.description,
			payload: { old: this.oldGroup, new: this.newGroup },
		};
	}
}

// ============================================================
// Project Store Class
// ============================================================

class ProjectStoreClass {
	project = $state<ProjectState>(createDefaultProjectState());

	// Getters for convenient access
	get channels(): Channel[] {
		return this.project.file.track.channels;
	}

	get keyframes(): Keyframe[] {
		return this.project.file.track.keyframes;
	}

	get effectKeyframes(): EffectKeyframe[] {
		return this.project.file.track.effectKeyframes;
	}

	get metadata(): TrackMetadata {
		return this.project.file.track.metadata;
	}

	get sceneMarkers(): SceneMarker[] {
		return this.project.file.sceneMarkers;
	}

	get channelGroups(): ChannelGroup[] {
		return this.project.file.channelGroups;
	}

	get projectId(): string {
		return this.project.file.projectId;
	}

	keyframesByChannel(channelId: string): Keyframe[] {
		return this.project.file.track.keyframes
			.filter((kf) => kf.channelId === channelId)
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	effectKeyframesByChannel(channelId: string): EffectKeyframe[] {
		return this.project.file.track.effectKeyframes
			.filter((ef) => ef.channelId === channelId)
			.sort((a, b) => a.timestampMs - b.timestampMs);
	}

	getKeyframe(id: string): Keyframe | undefined {
		return this.project.file.track.keyframes.find((kf) => kf.id === id);
	}

	getEffectKeyframe(id: string): EffectKeyframe | undefined {
		return this.project.file.track.effectKeyframes.find((ef) => ef.id === id);
	}

	getSceneMarker(id: string): SceneMarker | undefined {
		return this.project.file.sceneMarkers.find((m) => m.id === id);
	}

	getChannel(id: string): Channel | undefined {
		return this.project.file.track.channels.find((ch) => ch.id === id);
	}

	// Internal setters used by commands
	setTrack(track: LightFXTrack): void {
		this.project = {
			...this.project,
			isDirty: true,
			file: {
				...this.project.file,
				track,
				lastModified: new Date().toISOString(),
			},
		};
	}

	setSceneMarkers(markers: SceneMarker[]): void {
		this.project = {
			...this.project,
			isDirty: true,
			file: {
				...this.project.file,
				sceneMarkers: markers,
				lastModified: new Date().toISOString(),
			},
		};
	}

	setChannelGroups(groups: ChannelGroup[]): void {
		this.project = {
			...this.project,
			isDirty: true,
			file: {
				...this.project.file,
				channelGroups: groups,
				lastModified: new Date().toISOString(),
			},
		};
	}

	// ============================================================
	// Project lifecycle
	// ============================================================

	newProject(): void {
		undoStore.clear();
		this.project = createDefaultProjectState();
	}

	loadProject(file: ProjectFile): void {
		undoStore.clear();
		this.project = {
			file: { ...file },
			isDirty: false,
			displayName: file.track.metadata.title || 'Untitled Track',
			videoFile: null,
			videoObjectUrl: null,
		};
	}

	markDirty(): void {
		this.project = { ...this.project, isDirty: true };
	}

	markClean(): void {
		this.project = { ...this.project, isDirty: false };
	}

	// ============================================================
	// Mutation methods (all go through undo system)
	// ============================================================

	addKeyframe(channelId: string, timestampMs: number, overrides?: Partial<Keyframe>): Keyframe {
		const prevState = getPreviousKeyframeState(
			this.project.file.track.keyframes,
			channelId,
			timestampMs
		);
		const keyframe: Keyframe = {
			id: crypto.randomUUID(),
			channelId,
			timestampMs,
			colorMode: prevState.colorMode,
			color: { ...prevState.color },
			colorTemperature: prevState.colorTemperature,
			brightness: prevState.brightness,
			transitionMs: 0,
			interpolation: DEFAULT_INTERPOLATION,
			powerOn: prevState.powerOn,
			...overrides,
		};
		undoStore.execute(new AddKeyframeCommand(this, keyframe));
		return keyframe;
	}

	removeKeyframe(id: string): void {
		const keyframe = this.getKeyframe(id);
		if (!keyframe) return;
		undoStore.execute(new RemoveKeyframeCommand(this, { ...keyframe }));
	}

	updateKeyframe(id: string, updates: Partial<Keyframe>): void {
		const old = this.getKeyframe(id);
		if (!old) return;
		const updated = { ...old, ...updates, id: old.id, channelId: old.channelId };
		undoStore.execute(new UpdateKeyframeCommand(this, { ...old }, updated));
	}

	moveKeyframe(id: string, newTimestampMs: number): void {
		const kf = this.getKeyframe(id);
		if (!kf) return;
		undoStore.execute(new MoveKeyframeCommand(this, id, kf.timestampMs, Math.max(0, newTimestampMs)));
	}

	addChannel(overrides?: Partial<Channel>): Channel {
		const channel: Channel = {
			id: crypto.randomUUID(),
			displayName: `Channel ${this.channels.length + 1}`,
			description: '',
			defaultColor: { ...DEFAULT_RGB_COLOR },
			defaultBrightness: DEFAULT_BRIGHTNESS,
			spatialHint: 'SPATIAL_UNSPECIFIED',
			optional: true,
			...overrides,
		};
		undoStore.execute(new AddChannelCommand(this, channel));
		return channel;
	}

	removeChannel(id: string): void {
		const channel = this.getChannel(id);
		if (!channel) return;
		undoStore.execute(new RemoveChannelCommand(this, { ...channel }));
	}

	updateChannel(id: string, updates: Partial<Channel>): void {
		const old = this.getChannel(id);
		if (!old) return;
		const updated = { ...old, ...updates, id: old.id };
		undoStore.execute(new UpdateChannelCommand(this, { ...old }, updated));
	}

	reorderChannels(newOrder: Channel[]): void {
		undoStore.execute(new ReorderChannelsCommand(this, newOrder));
	}

	addEffectKeyframe(effect: Omit<EffectKeyframe, 'id'>): EffectKeyframe {
		const full: EffectKeyframe = { ...effect, id: crypto.randomUUID() };
		undoStore.execute(new AddEffectKeyframeCommand(this, full));
		return full;
	}

	removeEffectKeyframe(id: string): void {
		const effect = this.getEffectKeyframe(id);
		if (!effect) return;
		undoStore.execute(new RemoveEffectKeyframeCommand(this, { ...effect }));
	}

	updateEffectKeyframe(id: string, updates: Partial<EffectKeyframe>): void {
		const old = this.getEffectKeyframe(id);
		if (!old) return;
		const updated = { ...old, ...updates, id: old.id, channelId: old.channelId };
		undoStore.execute(new UpdateEffectKeyframeCommand(this, { ...old }, updated));
	}

	updateMetadata(updates: Partial<TrackMetadata>): void {
		const old = this.project.file.track.metadata;
		const updated = { ...old, ...updates };
		undoStore.execute(new UpdateMetadataCommand(this, { ...old }, updated));
		// Sync display name
		if (updates.title !== undefined) {
			this.project = {
				...this.project,
				displayName: updates.title || 'Untitled Track',
			};
		}
	}

	addSceneMarker(timestampMs: number, label: string, type: SceneMarker['type'] = 'MARKER_MANUAL'): SceneMarker {
		const marker: SceneMarker = {
			id: crypto.randomUUID(),
			timestampMs,
			label,
			type,
		};
		undoStore.execute(new AddSceneMarkerCommand(this, marker));
		return marker;
	}

	removeSceneMarker(id: string): void {
		const marker = this.getSceneMarker(id);
		if (!marker) return;
		undoStore.execute(new RemoveSceneMarkerCommand(this, { ...marker }));
	}

	updateSceneMarker(id: string, updates: Partial<SceneMarker>): void {
		const old = this.getSceneMarker(id);
		if (!old) return;
		const updated = { ...old, ...updates, id: old.id };
		undoStore.execute(new UpdateSceneMarkerCommand(this, { ...old }, updated));
	}

	addChannelGroup(overrides?: Partial<ChannelGroup>): ChannelGroup {
		const group: ChannelGroup = {
			id: crypto.randomUUID(),
			name: `Group ${this.channelGroups.length + 1}`,
			mode: 'GROUP_MIRROR',
			channelIds: [],
			offsets: [],
			defaultSpreadOffsetMs: 150,
			...overrides,
		};
		undoStore.execute(new AddChannelGroupCommand(this, group));
		return group;
	}

	removeChannelGroup(id: string): void {
		const group = this.channelGroups.find((g) => g.id === id);
		if (!group) return;
		undoStore.execute(new RemoveChannelGroupCommand(this, { ...group }));
	}

	updateChannelGroup(id: string, updates: Partial<ChannelGroup>): void {
		const old = this.channelGroups.find((g) => g.id === id);
		if (!old) return;
		const updated = { ...old, ...updates, id: old.id };
		undoStore.execute(new UpdateChannelGroupCommand(this, { ...old }, updated));
	}
}

export const projectStore = new ProjectStoreClass();
