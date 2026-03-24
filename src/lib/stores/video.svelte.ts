// ============================================================
// Video Store — HTML5 video element state and playback control
// ============================================================

import type { VideoState, PlaybackSpeed } from '$lib/types/index.js';
import { DEFAULT_PLAYBACK_SPEED, DEFAULT_FRAME_RATE } from '$lib/types/index.js';

function createDefaultVideoState(): VideoState {
	return {
		isLoaded: false,
		isPlaying: false,
		currentTimeMs: 0,
		durationMs: 0,
		playbackSpeed: DEFAULT_PLAYBACK_SPEED,
		videoWidth: 0,
		videoHeight: 0,
		frameRate: DEFAULT_FRAME_RATE,
		frameDurationMs: 1000 / DEFAULT_FRAME_RATE,
		objectUrl: null,
	};
}

class VideoStoreClass {
	state = $state<VideoState>(createDefaultVideoState());

	private videoElement: HTMLVideoElement | null = null;
	private rafId: number | null = null;

	bindVideoElement(el: HTMLVideoElement): void {
		this.unbindVideoElement();
		this.videoElement = el;

		el.addEventListener('loadedmetadata', this.handleLoadedMetadata);
		el.addEventListener('ended', this.handleEnded);
	}

	unbindVideoElement(): void {
		if (this.videoElement) {
			this.videoElement.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
			this.videoElement.removeEventListener('ended', this.handleEnded);
			this.stopRafLoop();
			this.videoElement = null;
		}
	}

	private handleLoadedMetadata = (): void => {
		const el = this.videoElement;
		if (!el) return;
		this.state = {
			...this.state,
			isLoaded: true,
			durationMs: el.duration * 1000,
			videoWidth: el.videoWidth,
			videoHeight: el.videoHeight,
		};
	};

	private handleEnded = (): void => {
		this.stopRafLoop();
		this.state = { ...this.state, isPlaying: false };
	};

	// requestAnimationFrame loop for smooth playhead sync (STU-014)
	private startRafLoop(): void {
		if (this.rafId !== null) return;
		const tick = (): void => {
			if (this.videoElement && !this.videoElement.paused) {
				this.state = {
					...this.state,
					currentTimeMs: this.videoElement.currentTime * 1000,
				};
				this.rafId = requestAnimationFrame(tick);
			} else {
				this.rafId = null;
			}
		};
		this.rafId = requestAnimationFrame(tick);
	}

	private stopRafLoop(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	play(): void {
		if (!this.videoElement || !this.state.isLoaded) return;
		this.videoElement.play();
		this.state = { ...this.state, isPlaying: true };
		this.startRafLoop();
	}

	pause(): void {
		if (!this.videoElement) return;
		this.videoElement.pause();
		this.stopRafLoop();
		this.state = {
			...this.state,
			isPlaying: false,
			currentTimeMs: this.videoElement.currentTime * 1000,
		};
	}

	togglePlayback(): void {
		if (this.state.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
	}

	seek(ms: number): void {
		const clamped = Math.max(0, Math.min(ms, this.state.durationMs));
		if (this.videoElement) {
			this.videoElement.currentTime = clamped / 1000;
		}
		this.state = { ...this.state, currentTimeMs: clamped };
	}

	stepForward(): void {
		this.seek(this.state.currentTimeMs + this.state.frameDurationMs);
	}

	stepBackward(): void {
		this.seek(this.state.currentTimeMs - this.state.frameDurationMs);
	}

	setSpeed(speed: PlaybackSpeed): void {
		if (this.videoElement) {
			this.videoElement.playbackRate = speed;
		}
		this.state = { ...this.state, playbackSpeed: speed };
	}

	setFrameRate(fps: number): void {
		const rate = fps > 0 ? fps : DEFAULT_FRAME_RATE;
		this.state = {
			...this.state,
			frameRate: rate,
			frameDurationMs: 1000 / rate,
		};
	}

	loadFile(file: File): void {
		this.unloadFile();
		const objectUrl = URL.createObjectURL(file);
		if (this.videoElement) {
			this.videoElement.src = objectUrl;
			this.videoElement.load();
		}
		this.state = {
			...createDefaultVideoState(),
			objectUrl,
		};
	}

	unloadFile(): void {
		this.stopRafLoop();
		if (this.state.objectUrl) {
			URL.revokeObjectURL(this.state.objectUrl);
		}
		if (this.videoElement) {
			this.videoElement.removeAttribute('src');
			this.videoElement.load();
		}
		this.state = createDefaultVideoState();
	}
}

export const videoStore = new VideoStoreClass();
