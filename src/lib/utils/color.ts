import type { RGBColor } from '$lib/types';

export function rgbToHex(color: RGBColor): string {
	const r = Math.round(Math.max(0, Math.min(255, color.r)));
	const g = Math.round(Math.max(0, Math.min(255, color.g)));
	const b = Math.round(Math.max(0, Math.min(255, color.b)));
	return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function hexToRgb(hex: string): RGBColor {
	const cleaned = hex.replace(/^#/, '');
	let r: number, g: number, b: number;

	if (cleaned.length === 3) {
		r = parseInt(cleaned[0] + cleaned[0], 16);
		g = parseInt(cleaned[1] + cleaned[1], 16);
		b = parseInt(cleaned[2] + cleaned[2], 16);
	} else if (cleaned.length === 6) {
		r = parseInt(cleaned.slice(0, 2), 16);
		g = parseInt(cleaned.slice(2, 4), 16);
		b = parseInt(cleaned.slice(4, 6), 16);
	} else {
		throw new Error(`Invalid hex color: ${hex}`);
	}

	if (isNaN(r) || isNaN(g) || isNaN(b)) {
		throw new Error(`Invalid hex color: ${hex}`);
	}

	return { r, g, b };
}

export function rgbToHsl(color: RGBColor): { h: number; s: number; l: number } {
	const r = color.r / 255;
	const g = color.g / 255;
	const b = color.b / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) {
		return { h: 0, s: 0, l };
	}

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

	let h: number;
	if (max === r) {
		h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	} else if (max === g) {
		h = ((b - r) / d + 2) / 6;
	} else {
		h = ((r - g) / d + 4) / 6;
	}

	return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RGBColor {
	if (s === 0) {
		const v = Math.round(l * 255);
		return { r: v, g: v, b: v };
	}

	const hue2rgb = (p: number, q: number, t: number): number => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;

	return {
		r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
		g: Math.round(hue2rgb(p, q, h) * 255),
		b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
	};
}

/**
 * Tanner Helland algorithm for approximating blackbody radiation colors.
 * Valid range: 1000K–10000K.
 */
export function kelvinToRgb(kelvin: number): RGBColor {
	const temp = Math.max(1000, Math.min(10000, kelvin)) / 100;

	let r: number, g: number, b: number;

	// Red
	if (temp <= 66) {
		r = 255;
	} else {
		r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
	}

	// Green
	if (temp <= 66) {
		g = 99.4708025861 * Math.log(temp) - 161.1195681661;
	} else {
		g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
	}

	// Blue
	if (temp >= 66) {
		b = 255;
	} else if (temp <= 19) {
		b = 0;
	} else {
		b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
	}

	return {
		r: Math.round(Math.max(0, Math.min(255, r))),
		g: Math.round(Math.max(0, Math.min(255, g))),
		b: Math.round(Math.max(0, Math.min(255, b)))
	};
}

/**
 * Approximate inverse of kelvinToRgb. Estimates color temperature from an RGB color
 * by searching over the 1000K–10000K range.
 */
export function rgbToKelvin(color: RGBColor): number {
	let minDist = Infinity;
	let bestKelvin = 6500;

	// Coarse search
	for (let k = 1000; k <= 10000; k += 100) {
		const ref = kelvinToRgb(k);
		const dist =
			(ref.r - color.r) ** 2 + (ref.g - color.g) ** 2 + (ref.b - color.b) ** 2;
		if (dist < minDist) {
			minDist = dist;
			bestKelvin = k;
		}
	}

	// Fine search around best coarse result
	const lo = Math.max(1000, bestKelvin - 100);
	const hi = Math.min(10000, bestKelvin + 100);
	for (let k = lo; k <= hi; k += 10) {
		const ref = kelvinToRgb(k);
		const dist =
			(ref.r - color.r) ** 2 + (ref.g - color.g) ** 2 + (ref.b - color.b) ** 2;
		if (dist < minDist) {
			minDist = dist;
			bestKelvin = k;
		}
	}

	return bestKelvin;
}

export function interpolateColor(from: RGBColor, to: RGBColor, t: number): RGBColor {
	const clamped = Math.max(0, Math.min(1, t));
	return {
		r: Math.round(from.r + (to.r - from.r) * clamped),
		g: Math.round(from.g + (to.g - from.g) * clamped),
		b: Math.round(from.b + (to.b - from.b) * clamped)
	};
}

/** Perceived brightness using the ITU-R BT.601 luma formula. Returns 0–255. */
export function colorBrightness(color: RGBColor): number {
	return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

/** Returns 'white' or 'black' for optimal text contrast over the given background. */
export function contrastColor(color: RGBColor): string {
	return colorBrightness(color) > 128 ? 'black' : 'white';
}
