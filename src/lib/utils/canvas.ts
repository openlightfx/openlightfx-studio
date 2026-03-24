/**
 * Sets up a canvas for HiDPI rendering. Sizes the canvas to fill the container
 * and returns the 2D context with the appropriate scale applied.
 */
export function setupHiDpiCanvas(
	canvas: HTMLCanvasElement,
	container: HTMLElement
): CanvasRenderingContext2D {
	const dpr = window.devicePixelRatio || 1;
	const rect = container.getBoundingClientRect();

	canvas.width = rect.width * dpr;
	canvas.height = rect.height * dpr;
	canvas.style.width = `${rect.width}px`;
	canvas.style.height = `${rect.height}px`;

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Could not get 2D canvas context');
	}

	ctx.scale(dpr, dpr);
	return ctx;
}

export function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	const radius = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + w - radius, y);
	ctx.arcTo(x + w, y, x + w, y + radius, radius);
	ctx.lineTo(x + w, y + h - radius);
	ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
	ctx.lineTo(x + radius, y + h);
	ctx.arcTo(x, y + h, x, y + h - radius, radius);
	ctx.lineTo(x, y + radius);
	ctx.arcTo(x, y, x + radius, y, radius);
	ctx.closePath();
}

/** Draws a diamond-shaped keyframe marker */
export function drawKeyframeDiamond(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	color: string,
	selected: boolean
): void {
	const half = size / 2;

	ctx.save();
	ctx.beginPath();
	ctx.moveTo(x, y - half);
	ctx.lineTo(x + half, y);
	ctx.lineTo(x, y + half);
	ctx.lineTo(x - half, y);
	ctx.closePath();

	ctx.fillStyle = color;
	ctx.fill();

	if (selected) {
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();
		// Outer glow
		ctx.shadowColor = '#ffffff';
		ctx.shadowBlur = 4;
		ctx.stroke();
		ctx.shadowBlur = 0;
	} else {
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	ctx.restore();
}

/** Draws a rounded rect block with a label for effect keyframes */
export function drawEffectBlock(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	color: string,
	label: string
): void {
	ctx.save();

	// Block background
	drawRoundedRect(ctx, x, y, width, height, 4);
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.6;
	ctx.fill();
	ctx.globalAlpha = 1.0;
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	ctx.stroke();

	// Label text (clipped to block)
	ctx.beginPath();
	ctx.rect(x, y, width, height);
	ctx.clip();
	ctx.fillStyle = '#ffffff';
	ctx.font = '11px system-ui, sans-serif';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + 4, y + height / 2);

	ctx.restore();
}

/** Draws the vertical playhead line with a triangular top marker */
export function drawPlayhead(
	ctx: CanvasRenderingContext2D,
	x: number,
	height: number,
	color: string = '#ef4444'
): void {
	ctx.save();

	// Vertical line
	ctx.beginPath();
	ctx.moveTo(x, 0);
	ctx.lineTo(x, height);
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	// Triangular marker at top
	const markerSize = 6;
	ctx.beginPath();
	ctx.moveTo(x - markerSize, 0);
	ctx.lineTo(x + markerSize, 0);
	ctx.lineTo(x, markerSize * 1.2);
	ctx.closePath();
	ctx.fillStyle = color;
	ctx.fill();

	ctx.restore();
}

/** Draws a vertical dashed line with a label tag at the top */
export function drawSceneMarker(
	ctx: CanvasRenderingContext2D,
	x: number,
	height: number,
	label: string,
	color: string
): void {
	ctx.save();

	// Dashed vertical line
	ctx.beginPath();
	ctx.setLineDash([4, 3]);
	ctx.moveTo(x, 0);
	ctx.lineTo(x, height);
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.setLineDash([]);

	// Label tag at top
	ctx.font = '10px system-ui, sans-serif';
	const metrics = ctx.measureText(label);
	const tagWidth = metrics.width + 8;
	const tagHeight = 16;

	drawRoundedRect(ctx, x - tagWidth / 2, 2, tagWidth, tagHeight, 3);
	ctx.fillStyle = color;
	ctx.fill();

	ctx.fillStyle = '#ffffff';
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'center';
	ctx.fillText(label, x, 2 + tagHeight / 2);
	ctx.textAlign = 'start';

	ctx.restore();
}
