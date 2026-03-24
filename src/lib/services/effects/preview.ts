import type { EffectKeyframe, RGBColor } from '$lib/types';

export interface EffectState {
	color: RGBColor;
	brightness: number;
}

/**
 * Compute the instantaneous visual state of an effect at a given time.
 * Returns null if currentTimeMs falls outside the effect's active window.
 */
export function computeEffectState(
	effect: EffectKeyframe,
	currentTimeMs: number,
): EffectState | null {
	const elapsed = currentTimeMs - effect.timestampMs;
	if (elapsed < 0 || elapsed > effect.durationMs) return null;

	const t = effect.durationMs > 0 ? elapsed / effect.durationMs : 0;
	const intensity = effect.intensity / 100;

	switch (effect.effectType) {
		case 'LIGHTNING':
			return renderLightning(effect, elapsed, intensity);
		case 'FLAME':
			return renderFlame(effect, elapsed, intensity);
		case 'CANDLE':
			return renderCandle(effect, elapsed, intensity);
		case 'FLASHBANG':
			return renderFlashbang(effect, t, intensity);
		case 'EXPLOSION':
			return renderExplosion(effect, t, intensity);
		case 'PULSE':
			return renderPulse(effect, elapsed, intensity);
		case 'BREATHING':
			return renderBreathing(effect, elapsed, intensity);
		case 'STROBE':
			return renderStrobe(effect, elapsed, intensity);
		case 'SIREN':
			return renderSiren(effect, elapsed, intensity);
		case 'AURORA':
			return renderAurora(effect, elapsed, intensity);
		case 'NEON':
			return renderNeon(effect, elapsed, intensity);
		case 'GUNFIRE':
			return renderGunfire(effect, elapsed, intensity);
		case 'SPARK':
			return renderSpark(effect, elapsed, intensity);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function lerpColor(a: RGBColor, b: RGBColor, t: number): RGBColor {
	return {
		r: Math.round(lerp(a.r, b.r, t)),
		g: Math.round(lerp(a.g, b.g, t)),
		b: Math.round(lerp(a.b, b.b, t)),
	};
}

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

/** Deterministic pseudo-random from a seed, returns 0–1. */
function seededRandom(seed: number): number {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
}

function getParam(effect: EffectKeyframe, key: string, fallback: number): number {
	return effect.effectParams[key] ?? fallback;
}

// ---------------------------------------------------------------------------
// Effect renderers
// ---------------------------------------------------------------------------

function renderLightning(
	effect: EffectKeyframe,
	elapsedMs: number,
	intensity: number,
): EffectState {
	const flashCount = Math.round(getParam(effect, 'flash_count', 2));
	const decayMs = getParam(effect, 'decay_ms', 200);
	const flashDuration = effect.durationMs / Math.max(flashCount, 1);

	const flashIndex = Math.floor(elapsedMs / flashDuration);
	const withinFlash = elapsedMs - flashIndex * flashDuration;

	// Each flash: instant peak then exponential decay
	const flashBrightness = clamp01(Math.exp(-withinFlash / Math.max(decayMs, 1)));
	const rnd = seededRandom(flashIndex * 137 + effect.timestampMs);
	const jitter = 0.7 + 0.3 * rnd;
	const brightness = clamp01(flashBrightness * intensity * jitter) * 100;

	return { color: effect.primaryColor, brightness };
}

function renderFlame(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flickerHz = getParam(effect, 'flicker_rate_hz', 8);
	const randomness = getParam(effect, 'randomness', 0.4);

	const phase = (elapsedMs / 1000) * flickerHz;
	const base = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
	const rnd = seededRandom(Math.floor(phase * 3) + effect.timestampMs);
	const flicker = base * (1 - randomness) + rnd * randomness;

	const brightness = clamp01(flicker * intensity) * 100;
	const colorT = clamp01(flicker);
	const color = lerpColor(effect.secondaryColor, effect.primaryColor, colorT);
	return { color, brightness };
}

function renderCandle(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flickerHz = getParam(effect, 'flicker_rate_hz', 4);
	const randomness = getParam(effect, 'randomness', 0.6);

	const phase = (elapsedMs / 1000) * flickerHz;
	const wave = 0.6 + 0.4 * Math.sin(phase * Math.PI * 2);
	const rnd = seededRandom(Math.floor(phase * 5) + effect.timestampMs);
	const flicker = wave * (1 - randomness) + rnd * randomness;

	const brightness = clamp01((0.3 + 0.7 * flicker) * intensity) * 100;
	const color = lerpColor(effect.secondaryColor, effect.primaryColor, clamp01(flicker));
	return { color, brightness };
}

function renderFlashbang(effect: EffectKeyframe, t: number, intensity: number): EffectState {
	// Bright white flash at start, then slow exponential decay
	const flashCount = Math.round(getParam(effect, 'flash_count', 1));
	const flashPhase = 0.1 / Math.max(flashCount, 1);

	let brightness: number;
	if (t < flashPhase) {
		brightness = intensity * 100;
	} else {
		const decayT = (t - flashPhase) / (1 - flashPhase);
		brightness = clamp01(intensity * Math.exp(-decayT * 3)) * 100;
	}

	// Flash is always white
	const white: RGBColor = { r: 255, g: 255, b: 255 };
	const color = lerpColor(white, effect.primaryColor, clamp01(t * 2));
	return { color, brightness };
}

function renderExplosion(effect: EffectKeyframe, t: number, intensity: number): EffectState {
	const decayMs = getParam(effect, 'decay_ms', 500);
	const decayFraction = effect.durationMs > 0 ? decayMs / effect.durationMs : 0.5;

	let brightness: number;
	if (t < 0.1) {
		// Initial bright burst
		brightness = intensity * 100;
	} else {
		const decayT = (t - 0.1) / Math.max(1 - 0.1, 0.01);
		brightness = clamp01(intensity * Math.exp(-decayT / Math.max(decayFraction, 0.01))) * 100;
	}

	// Warm burst: start white-hot, transition to primary (warm orange/red)
	const warmWhite: RGBColor = { r: 255, g: 220, b: 180 };
	const color = lerpColor(warmWhite, effect.primaryColor, clamp01(t * 1.5));
	return { color, brightness };
}

function renderPulse(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const rateHz = getParam(effect, 'pulse_rate_hz', 1);
	const phase = (elapsedMs / 1000) * rateHz * Math.PI * 2;
	const wave = 0.5 + 0.5 * Math.sin(phase);
	const brightness = clamp01(wave * intensity) * 100;
	return { color: effect.primaryColor, brightness };
}

function renderBreathing(
	effect: EffectKeyframe,
	elapsedMs: number,
	intensity: number,
): EffectState {
	const rateHz = getParam(effect, 'pulse_rate_hz', 0.3);
	const phase = (elapsedMs / 1000) * rateHz * Math.PI * 2;
	// Smoother cosine curve
	const wave = 0.5 - 0.5 * Math.cos(phase);
	const brightness = clamp01(wave * intensity) * 100;
	return { color: effect.primaryColor, brightness };
}

function renderStrobe(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flashCount = Math.round(getParam(effect, 'flash_count', 10));
	const hz = effect.durationMs > 0 ? (flashCount / effect.durationMs) * 1000 : 5;
	const period = 1000 / Math.max(hz, 0.1);
	const on = (elapsedMs % period) < period / 2;
	const brightness = on ? intensity * 100 : 0;
	return { color: effect.primaryColor, brightness };
}

function renderSiren(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flashCount = Math.round(getParam(effect, 'flash_count', 4));
	const hz = effect.durationMs > 0 ? (flashCount / effect.durationMs) * 1000 : 2;
	const period = 1000 / Math.max(hz, 0.1);
	const usePrimary = (elapsedMs % period) < period / 2;
	const color = usePrimary ? effect.primaryColor : effect.secondaryColor;
	return { color, brightness: intensity * 100 };
}

function renderAurora(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flickerHz = getParam(effect, 'flicker_rate_hz', 0.5);
	const randomness = getParam(effect, 'randomness', 0.3);

	const phase = (elapsedMs / 1000) * flickerHz;
	const hueShift = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
	const rnd = seededRandom(Math.floor(phase * 2) + effect.timestampMs);
	const t = hueShift * (1 - randomness) + rnd * randomness;

	const color = lerpColor(effect.primaryColor, effect.secondaryColor, clamp01(t));
	const brightness = clamp01((0.6 + 0.4 * hueShift) * intensity) * 100;
	return { color, brightness };
}

function renderNeon(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flickerHz = getParam(effect, 'flicker_rate_hz', 1);
	const randomness = getParam(effect, 'randomness', 0.1);

	// Mostly steady, occasional flicker
	const rnd = seededRandom(Math.floor((elapsedMs / 1000) * flickerHz * 10) + effect.timestampMs);
	const flicker = rnd < randomness ? 0.3 + 0.7 * rnd : 1.0;
	const brightness = clamp01(flicker * intensity) * 100;
	return { color: effect.primaryColor, brightness };
}

function renderGunfire(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const flashCount = Math.round(getParam(effect, 'flash_count', 4));
	const decayMs = getParam(effect, 'decay_ms', 50);
	const flashDuration = effect.durationMs / Math.max(flashCount, 1);

	const flashIndex = Math.floor(elapsedMs / flashDuration);
	const withinFlash = elapsedMs - flashIndex * flashDuration;

	// Very quick bright flash then rapid decay
	const flashBrightness = clamp01(Math.exp(-withinFlash / Math.max(decayMs, 1)));
	const brightness = clamp01(flashBrightness * intensity) * 100;
	return { color: effect.primaryColor, brightness };
}

function renderSpark(effect: EffectKeyframe, elapsedMs: number, intensity: number): EffectState {
	const randomness = getParam(effect, 'randomness', 0.7);

	// Random bright sparks
	const seed = Math.floor(elapsedMs / 30) + effect.timestampMs;
	const rnd = seededRandom(seed);
	const isSpark = rnd > (1 - randomness * 0.3);
	const brightness = isSpark ? clamp01(intensity * (0.7 + 0.3 * rnd)) * 100 : 0;
	return { color: effect.primaryColor, brightness };
}
