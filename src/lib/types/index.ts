// ============================================================
// Core protobuf-matching types
// ============================================================

export interface RGBColor {
	r: number;
	g: number;
	b: number;
}

export type ColorMode = 'RGB' | 'COLOR_TEMPERATURE';
export type InterpolationMode = 'STEP' | 'LINEAR';
export type BoundaryBehavior = 'LEAVE' | 'OFF' | 'ON';
export type PreshowState = 'PRESHOW_DIM' | 'PRESHOW_OFF' | 'PRESHOW_WARM';
export type CreditsBehavior =
	| 'CREDITS_CONTINUE'
	| 'CREDITS_DIM_UP'
	| 'CREDITS_RAISE'
	| 'CREDITS_OFF';
export type IntensityRating = 'SUBTLE' | 'MODERATE' | 'INTENSE' | 'EXTREME';

export interface MovieReference {
	imdbId: string;
	title: string;
	year: number;
	runtimeMinutes: number;
}

export interface TrackMetadata {
	title: string;
	description: string;
	movieReference: MovieReference;
	author: string;
	tags: string[];
	durationMs: number;
	startBehavior: BoundaryBehavior;
	endBehavior: BoundaryBehavior;
	preshowDurationMs: number;
	preshowState: PreshowState;
	creditsStartMs: number;
	creditsBehavior: CreditsBehavior;
	trackVersion: string;
}

export interface Channel {
	id: string;
	displayName: string;
	description: string;
	defaultColor: RGBColor;
	defaultBrightness: number;
	spatialHint: string;
	optional: boolean;
}

export interface Keyframe {
	id: string;
	channelId: string;
	timestampMs: number;
	colorMode: ColorMode;
	color: RGBColor;
	colorTemperature: number;
	brightness: number;
	transitionMs: number;
	interpolation: InterpolationMode;
	powerOn: boolean;
}

export type EffectType =
	| 'LIGHTNING'
	| 'FLAME'
	| 'FLASHBANG'
	| 'EXPLOSION'
	| 'PULSE'
	| 'STROBE'
	| 'SIREN'
	| 'AURORA'
	| 'CANDLE'
	| 'GUNFIRE'
	| 'NEON'
	| 'BREATHING'
	| 'SPARK';

export interface EffectKeyframe {
	id: string;
	channelId: string;
	timestampMs: number;
	durationMs: number;
	effectType: EffectType;
	intensity: number;
	primaryColor: RGBColor;
	secondaryColor: RGBColor;
	effectParams: Record<string, number>;
	requiredCapability: string;
	fallbackColor: RGBColor;
	fallbackBrightness: number;
}

export interface SafetyInfo {
	containsFlashing: boolean;
	containsStrobing: boolean;
	maxFlashFrequencyHz: number;
	maxBrightnessDelta: number;
	warningText: string;
	intensityRating: IntensityRating;
}

export interface LightFXTrack {
	version: number;
	metadata: TrackMetadata;
	channels: Channel[];
	keyframes: Keyframe[];
	effectKeyframes: EffectKeyframe[];
	safetyInfo: SafetyInfo;
}

// ============================================================
// Studio-only types (not in proto)
// ============================================================

export type SceneMarkerType = 'MARKER_USER' | 'MARKER_CHAPTER' | 'MARKER_AUTO_DETECTED';

export interface SceneMarker {
	id: string;
	timestampMs: number;
	label: string;
	type: SceneMarkerType;
}

export type GroupMode = 'GROUP_MIRROR' | 'GROUP_SPREAD' | 'GROUP_ALTERNATE';

export interface ChannelGroupOffset {
	channelId: string;
	hueOffset: number;
	brightnessOffset: number;
	timingOffsetMs: number;
}

export interface ChannelGroup {
	id: string;
	name: string;
	mode: GroupMode;
	channelIds: string[];
	offsets: ChannelGroupOffset[];
	defaultTimingOffsetMs: number;
}

// ============================================================
// UI State types
// ============================================================

export interface TimelineViewport {
	startMs: number;
	endMs: number;
	pixelsPerMs: number;
}

export interface SelectionState {
	selectedKeyframeIds: Set<string>;
	selectedEffectIds: Set<string>;
	selectedChannelId: string | null;
	selectedSceneMarkerId: string | null;
}

export interface ClipboardData {
	keyframes: Keyframe[];
	sourceChannelId: string;
}

export interface ProjectState {
	track: LightFXTrack;
	channelGroups: ChannelGroup[];
	sceneMarkers: SceneMarker[];
	channelOrder: string[];
	mutedChannels: Set<string>;
	soloedChannels: Set<string>;
}

export interface UndoableAction {
	type: string;
	description: string;
	undo: () => void;
	redo: () => void;
}

export interface ProjectFile {
	version: number;
	track: LightFXTrack;
	channelGroups: ChannelGroup[];
	sceneMarkers: SceneMarker[];
	channelOrder: string[];
	mutedChannels: string[];
	soloedChannels: string[];
	videoFilePath: string;
	ui: {
		zoom: number;
		scrollX: number;
		scrollY: number;
	};
	undoHistory: unknown[];
	redoHistory: unknown[];
}

// ============================================================
// Toast types
// ============================================================

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
}

// ============================================================
// Context menu types
// ============================================================

export interface ContextMenuItem {
	label: string;
	action?: () => void;
	disabled?: boolean;
	separator?: boolean;
	submenu?: ContextMenuItem[];
	icon?: string;
}

// ============================================================
// Channel template definitions
// ============================================================

export interface ChannelTemplate {
	name: string;
	description: string;
	channels: Omit<Channel, 'description' | 'defaultColor' | 'defaultBrightness' | 'optional'>[];
}

// ============================================================
// Default value factories
// ============================================================

export function createDefaultMovieReference(): MovieReference {
	return {
		imdbId: '',
		title: '',
		year: new Date().getFullYear(),
		runtimeMinutes: 0
	};
}

export function createDefaultTrackMetadata(): TrackMetadata {
	return {
		title: 'Untitled Track',
		description: '',
		movieReference: createDefaultMovieReference(),
		author: '',
		tags: [],
		durationMs: 0,
		startBehavior: 'OFF',
		endBehavior: 'OFF',
		preshowDurationMs: 0,
		preshowState: 'PRESHOW_DIM',
		creditsStartMs: 0,
		creditsBehavior: 'CREDITS_CONTINUE',
		trackVersion: '1.0'
	};
}

export function createDefaultChannel(id: string, displayName: string): Channel {
	return {
		id,
		displayName,
		description: '',
		defaultColor: { r: 0, g: 0, b: 0 },
		defaultBrightness: 0,
		spatialHint: 'SPATIAL_UNSPECIFIED',
		optional: false
	};
}

export function createDefaultKeyframe(
	id: string,
	channelId: string,
	timestampMs: number
): Keyframe {
	return {
		id,
		channelId,
		timestampMs,
		colorMode: 'RGB',
		color: { r: 0, g: 0, b: 0 },
		colorTemperature: 4000,
		brightness: 0,
		transitionMs: 0,
		interpolation: 'STEP',
		powerOn: false
	};
}

export function createDefaultEffectKeyframe(
	id: string,
	channelId: string,
	timestampMs: number
): EffectKeyframe {
	return {
		id,
		channelId,
		timestampMs,
		durationMs: 2000,
		effectType: 'LIGHTNING',
		intensity: 50,
		primaryColor: { r: 255, g: 255, b: 255 },
		secondaryColor: { r: 0, g: 0, b: 0 },
		effectParams: {},
		requiredCapability: '',
		fallbackColor: { r: 128, g: 128, b: 128 },
		fallbackBrightness: 50
	};
}

export function createDefaultSafetyInfo(): SafetyInfo {
	return {
		containsFlashing: false,
		containsStrobing: false,
		maxFlashFrequencyHz: 0,
		maxBrightnessDelta: 0,
		warningText: '',
		intensityRating: 'SUBTLE'
	};
}

export function createDefaultTrack(): LightFXTrack {
	return {
		version: 1,
		metadata: createDefaultTrackMetadata(),
		channels: [],
		keyframes: [],
		effectKeyframes: [],
		safetyInfo: createDefaultSafetyInfo()
	};
}

// ============================================================
// Channel templates (STU-054)
// ============================================================

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
	{
		name: 'Mono (1-channel)',
		description: 'Single channel for simple setups',
		channels: [{ id: 'main', displayName: 'Main', spatialHint: 'SPATIAL_CENTER' }]
	},
	{
		name: 'Stereo (2-channel)',
		description: 'Left and right channels',
		channels: [
			{ id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
			{ id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' }
		]
	},
	{
		name: 'Stereo + Ambient (3-channel)',
		description: 'Left, right, and ambient channels',
		channels: [
			{ id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
			{ id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
			{ id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' }
		]
	},
	{
		name: 'Surround (4-channel)',
		description: 'Left, right, surround left, and surround right',
		channels: [
			{ id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
			{ id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
			{
				id: 'surround-left',
				displayName: 'Surround Left',
				spatialHint: 'SPATIAL_SURROUND_LEFT'
			},
			{
				id: 'surround-right',
				displayName: 'Surround Right',
				spatialHint: 'SPATIAL_SURROUND_RIGHT'
			}
		]
	},
	{
		name: '6-Channel Theater',
		description: 'Full theater setup with center and ambient',
		channels: [
			{ id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
			{ id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
			{ id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
			{
				id: 'surround-left',
				displayName: 'Surround Left',
				spatialHint: 'SPATIAL_SURROUND_LEFT'
			},
			{
				id: 'surround-right',
				displayName: 'Surround Right',
				spatialHint: 'SPATIAL_SURROUND_RIGHT'
			},
			{ id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' }
		]
	},
	{
		name: '8-Channel Home Theater',
		description: 'Full home theater with back channels and ambient',
		channels: [
			{ id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
			{ id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
			{ id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
			{
				id: 'surround-left',
				displayName: 'Surround Left',
				spatialHint: 'SPATIAL_SURROUND_LEFT'
			},
			{
				id: 'surround-right',
				displayName: 'Surround Right',
				spatialHint: 'SPATIAL_SURROUND_RIGHT'
			},
			{ id: 'back-left', displayName: 'Back Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
			{ id: 'back-right', displayName: 'Back Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
			{ id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' }
		]
	}
];
