/** Half-to-even rounding. Matches .NET Math.Round, not JavaScript Math.round. */
export function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  let rounded: number;
  if (Math.abs(frac - 0.5) < 1e-9) rounded = floor % 2 === 0 ? floor : floor + 1;
  else rounded = frac < 0.5 ? floor : floor + 1;
  return sign * rounded;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Truncate toward zero after clamping, matching a C# `(byte)` cast of a clamped double. */
export function truncByte(value: number): number {
  const clamped = clamp(value, 0, 255);
  return Math.trunc(clamped);
}
