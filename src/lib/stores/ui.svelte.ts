import type { ModalType } from '$lib/types/ui.js';
import { LS_KEY_DARK_MODE, LS_KEY_MIN_KEYFRAME_INTERVAL } from '$lib/types/ui.js';
import { DEFAULT_KEYFRAME_INTERVAL_MS } from '$lib/types/track.js';

class UIStore {
  darkMode = $state(true);
  overlayEnabled = $state(true);
  snappingEnabled = $state(true);
  onboardingComplete = $state(false);
  activeModal = $state<ModalType | null>(null);
  eyedropperActive = $state(false);
  minKeyframeIntervalMs = $state(DEFAULT_KEYFRAME_INTERVAL_MS);

  init(): void {
    if (typeof localStorage === 'undefined') return;
    const dm = localStorage.getItem(LS_KEY_DARK_MODE);
    if (dm !== null) this.darkMode = dm === 'true';
    const mki = localStorage.getItem(LS_KEY_MIN_KEYFRAME_INTERVAL);
    if (mki) this.minKeyframeIntervalMs = parseInt(mki, 10);
  }

  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem(LS_KEY_DARK_MODE, String(this.darkMode));
  }

  toggleOverlay(): void { this.overlayEnabled = !this.overlayEnabled; }
  toggleSnapping(): void { this.snappingEnabled = !this.snappingEnabled; }
  openModal(modal: ModalType): void { this.activeModal = modal; }
  closeModal(): void { this.activeModal = null; }
  toggleEyedropper(): void { this.eyedropperActive = !this.eyedropperActive; }
}

export const uiStore = new UIStore();
