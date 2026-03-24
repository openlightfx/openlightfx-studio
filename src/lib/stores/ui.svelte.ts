// ============================================================
// UI Store — application UI state with localStorage persistence
// ============================================================

import type { UIState, ModalType, PropertiesContext } from '$lib/types/index.js';
import {
	DEFAULT_KEYFRAME_INTERVAL_MS,
	LS_KEY_DARK_MODE,
	LS_KEY_ONBOARDING,
	LS_KEY_MIN_KEYFRAME_INTERVAL,
} from '$lib/types/index.js';

function loadBoolean(key: string, fallback: boolean): boolean {
	if (typeof localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(key);
	if (stored === null) return fallback;
	return stored === 'true';
}

function loadNumber(key: string, fallback: number): number {
	if (typeof localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(key);
	if (stored === null) return fallback;
	const parsed = Number(stored);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function persistBoolean(key: string, value: boolean): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(key, String(value));
}

function persistNumber(key: string, value: number): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(key, String(value));
}

function createDefaultUIState(): UIState {
	return {
		darkMode: loadBoolean(LS_KEY_DARK_MODE, true),
		overlayEnabled: true,
		snappingEnabled: true,
		onboardingComplete: loadBoolean(LS_KEY_ONBOARDING, false),
		activeModal: null,
		eyedropperActive: false,
		propertiesContext: { type: 'track' },
		minKeyframeIntervalMs: loadNumber(LS_KEY_MIN_KEYFRAME_INTERVAL, DEFAULT_KEYFRAME_INTERVAL_MS),
	};
}

class UIStoreClass {
	state = $state<UIState>(createDefaultUIState());

	toggleDarkMode(): void {
		const next = !this.state.darkMode;
		this.state = { ...this.state, darkMode: next };
		persistBoolean(LS_KEY_DARK_MODE, next);
	}

	toggleOverlay(): void {
		this.state = { ...this.state, overlayEnabled: !this.state.overlayEnabled };
	}

	toggleSnapping(): void {
		this.state = { ...this.state, snappingEnabled: !this.state.snappingEnabled };
	}

	openModal(type: ModalType): void {
		this.state = { ...this.state, activeModal: type };
	}

	closeModal(): void {
		this.state = { ...this.state, activeModal: null };
	}

	setPropertiesContext(ctx: PropertiesContext): void {
		this.state = { ...this.state, propertiesContext: ctx };
	}

	setEyedropperActive(active: boolean): void {
		this.state = { ...this.state, eyedropperActive: active };
	}

	setMinKeyframeInterval(ms: number): void {
		const clamped = Math.max(100, Math.min(1000, ms));
		this.state = { ...this.state, minKeyframeIntervalMs: clamped };
		persistNumber(LS_KEY_MIN_KEYFRAME_INTERVAL, clamped);
	}

	completeOnboarding(): void {
		this.state = { ...this.state, onboardingComplete: true };
		persistBoolean(LS_KEY_ONBOARDING, true);
	}
}

export const uiStore = new UIStoreClass();
