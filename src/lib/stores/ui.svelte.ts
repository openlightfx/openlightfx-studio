const DARK_MODE_KEY = 'openlightfx-dark-mode';
const MIN_INTERVAL_KEY = 'openlightfx-min-keyframe-interval';

function loadBoolean(key: string, fallback: boolean): boolean {
	if (typeof globalThis.localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(key);
	if (stored === null) return fallback;
	return stored === 'true';
}

function loadNumber(key: string, fallback: number): number {
	if (typeof globalThis.localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(key);
	if (stored === null) return fallback;
	const parsed = Number(stored);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function persistBoolean(key: string, value: boolean) {
	if (typeof globalThis.localStorage === 'undefined') return;
	localStorage.setItem(key, String(value));
}

function persistNumber(key: string, value: number) {
	if (typeof globalThis.localStorage === 'undefined') return;
	localStorage.setItem(key, String(value));
}

class UIStore {
	darkMode: boolean = $state(loadBoolean(DARK_MODE_KEY, true));
	panelSizes = $state({ video: 40, properties: 25, timeline: 35 });
	propertiesPanelCollapsed: boolean = $state(false);
	effectsPaletteCollapsed: boolean = $state(false);
	showOverlay: boolean = $state(true);
	minKeyframeIntervalMs: number = $state(loadNumber(MIN_INTERVAL_KEY, 200));

	toggleDarkMode() {
		this.darkMode = !this.darkMode;
		persistBoolean(DARK_MODE_KEY, this.darkMode);
	}

	setDarkMode(value: boolean) {
		this.darkMode = value;
		persistBoolean(DARK_MODE_KEY, value);
	}

	setMinKeyframeIntervalMs(value: number) {
		this.minKeyframeIntervalMs = value;
		persistNumber(MIN_INTERVAL_KEY, value);
	}

	setPanelSizes(sizes: { video: number; properties: number; timeline: number }) {
		this.panelSizes = sizes;
	}

	togglePropertiesPanel() {
		this.propertiesPanelCollapsed = !this.propertiesPanelCollapsed;
	}

	toggleEffectsPalette() {
		this.effectsPaletteCollapsed = !this.effectsPaletteCollapsed;
	}

	toggleOverlay() {
		this.showOverlay = !this.showOverlay;
	}
}

export const uiStore = new UIStore();
