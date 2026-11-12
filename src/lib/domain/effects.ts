/**
 * Transcription of the plugin effect renderers on
 * openlightfx-emby branch cursor/studio-host-api-18c1.
 * The shared fixture is this output. The plugin's dotnet test is the cross-check.
 */
import type { EffectType, Rgb } from './types';

export interface EffectCommand {
  offsetMs: number;
  r: number;
  g: number;
  b: number;
  brightness: number;
  transitionMs: number;
}

export interface EffectInput {
  effectType: EffectType;
  durationMs: number;
  intensity: number;
  primaryColor: Rgb | null;
  secondaryColor: Rgb | null;
  params: Record<string, number>;
  requiredCapability?: string;
  fallbackColor?: Rgb | null;
  fallbackBrightness?: number;
}

export interface EffectSampleContext {
  supportsRgb: boolean;
  minTransitionMs: number;
  brightnessCap: number;
}

const FAST_CONTEXT: EffectSampleContext = { supportsRgb: true, minTransitionMs: 0, brightnessCap: 100 };

export function defaultEffectContext(): EffectSampleContext {
  return { ...FAST_CONTEXT };
}

function scaleBrightness(baseBrightness: number, intensity: number, cap: number): number {
  const scaled = Math.trunc((baseBrightness * intensity) / 100);
  return Math.min(Math.trunc((scaled * cap) / 100), 100);
}

function param(input: EffectInput, name: string, fallback: number): number {
  const value = input.params[name];
  return value === undefined ? fallback : value;
}

function primary(input: EffectInput): Rgb {
  return input.primaryColor ?? { r: 255, g: 255, b: 255 };
}

function secondary(input: EffectInput): Rgb {
  return input.secondaryColor ?? { r: 0, g: 0, b: 0 };
}

function meets(input: EffectInput, context: EffectSampleContext): boolean {
  const required = input.requiredCapability ?? '';
  const fast = context.minTransitionMs <= 100;
  if (required === '' || required === 'CAPABILITY_ANY') return true;
  if (required === 'CAPABILITY_FAST_TRANSITION') return fast;
  if (required === 'CAPABILITY_RGB') return context.supportsRgb;
  if (required === 'CAPABILITY_FAST_RGB') return context.supportsRgb && fast;
  return false;
}

function simplify(context: EffectSampleContext): boolean {
  return context.minTransitionMs > 100;
}

function fallback(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  if (!input.fallbackColor) return [];
  const brightness = scaleBrightness(input.fallbackBrightness && input.fallbackBrightness > 0 ? input.fallbackBrightness : 50, 100, context.brightnessCap);
  return [cmd(0, input.fallbackColor, brightness, 200)];
}

function cmd(offsetMs: number, color: Rgb, brightness: number, transitionMs: number): EffectCommand {
  return { offsetMs: offsetMs >>> 0, r: color.r & 255, g: color.g & 255, b: color.b & 255, brightness: brightness >>> 0, transitionMs: transitionMs >>> 0 };
}

function trunc(value: number): number {
  return Math.trunc(value);
}

function lightning(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const cap = context.brightnessCap;
  let flashCount = trunc(param(input, 'flash_count', 1));
  const decayMs = trunc(param(input, 'decay_ms', 500));
  const peak = scaleBrightness(100, intensity, cap);
  if (simplify(context)) {
    return [cmd(0, { r: 255, g: 255, b: 255 }, peak, 0), cmd(50, { r: 255, g: 255, b: 255 }, 0, 500)];
  }
  flashCount = Math.min(4, Math.max(1, flashCount));
  const commands: EffectCommand[] = [];
  let offset = 0;
  for (let i = 0; i < flashCount; i++) {
    commands.push(cmd(offset, { r: 255, g: 255, b: 255 }, peak, 0));
    offset += 50;
    commands.push(cmd(offset, { r: 255, g: 255, b: 255 }, 0, 0));
    offset += 50;
  }
  const afterglow = scaleBrightness(40, intensity, cap);
  commands.push(cmd(offset, { r: 255, g: 180, b: 80 }, afterglow, 50));
  commands.push(cmd(offset + 50, { r: 255, g: 180, b: 80 }, 0, decayMs));
  return commands;
}

function flame(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const cap = context.brightnessCap;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 1000);
  const flickerHz = param(input, 'flicker_rate_hz', 8);
  if (simplify(context)) {
    const half = trunc(duration / 2);
    return [
      cmd(0, { r: 255, g: 120, b: 20 }, scaleBrightness(80, intensity, cap), half),
      cmd(half, { r: 200, g: 80, b: 10 }, scaleBrightness(40, intensity, cap), half),
    ];
  }
  const stepMs = Math.max(1000 / flickerHz / 2, 20);
  const steps = trunc(duration / stepMs);
  const commands: EffectCommand[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepMs;
    const wave1 = Math.sin((2 * Math.PI * flickerHz * t) / 1000);
    const wave2 = Math.sin((2 * Math.PI * flickerHz * 1.7 * t) / 1000) * 0.3;
    const wave3 = Math.sin((2 * Math.PI * flickerHz * 0.3 * t) / 1000) * 0.2;
    const combined = (wave1 + wave2 + wave3 + 1.5) / 3;
    const brightness = scaleBrightness(trunc(40 + combined * 60), intensity, cap);
    const color = {
      r: (200 + trunc(combined * 55)) & 255,
      g: (60 + trunc(combined * 100)) & 255,
      b: (5 + trunc(combined * 20)) & 255,
    };
    commands.push(cmd(trunc(t), color, brightness, trunc(stepMs)));
  }
  return commands;
}

function flashbang(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 2000);
  const peak = scaleBrightness(100, intensity, context.brightnessCap);
  const white = { r: 255, g: 255, b: 255 };
  if (simplify(context)) {
    const fadeMs = Math.max(duration - 200, 200);
    return [cmd(0, white, 0, 0), cmd(0, white, peak, 200), cmd(200, white, 0, fadeMs)];
  }
  const fadeDuration = Math.max(duration - 100, 100);
  return [cmd(0, white, peak, 0), cmd(100, white, 0, fadeDuration)];
}

function explosion(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const cap = context.brightnessCap;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 1500);
  const peak = scaleBrightness(100, intensity, cap);
  if (simplify(context)) {
    const half = trunc(duration / 2);
    return [
      cmd(0, { r: 255, g: 140, b: 20 }, scaleBrightness(60, intensity, cap), half),
      cmd(half, { r: 255, g: 140, b: 20 }, 0, half),
    ];
  }
  const phase1 = trunc(duration / 5);
  const phase2 = trunc((duration * 2) / 5);
  const phase3 = trunc((duration * 2) / 5);
  return [
    cmd(0, { r: 255, g: 160, b: 30 }, peak, 0),
    cmd(phase1, { r: 220, g: 60, b: 10 }, scaleBrightness(50, intensity, cap), phase2),
    cmd(phase1 + phase2, { r: 150, g: 30, b: 5 }, scaleBrightness(15, intensity, cap), phase3),
    cmd(duration, { r: 100, g: 20, b: 0 }, 0, 200),
  ];
}

function pulse(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 2000);
  const color = primary(input);
  let rateHz = param(input, 'pulse_rate_hz', 1);
  if (simplify(context)) rateHz = Math.min(rateHz, 2);
  const stepMs = Math.max(1000 / rateHz / 8, 30);
  const steps = trunc(duration / stepMs);
  const commands: EffectCommand[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepMs;
    const sine = (Math.sin((2 * Math.PI * rateHz * t) / 1000 - Math.PI / 2) + 1) / 2;
    commands.push(cmd(trunc(t), color, scaleBrightness(trunc(sine * 100), intensity, context.brightnessCap), trunc(stepMs)));
  }
  return commands;
}

function strobe(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 1000);
  const color = primary(input);
  const rateHz = param(input, 'flicker_rate_hz', 10);
  const peak = scaleBrightness(100, intensity, context.brightnessCap);
  if (simplify(context)) {
    const half = trunc(duration / 2);
    return [
      cmd(0, color, peak, half),
      cmd(half, color, scaleBrightness(50, intensity, context.brightnessCap), half),
    ];
  }
  const halfCycle = Math.max(1000 / rateHz / 2, 10);
  const commands: EffectCommand[] = [];
  let offset = 0;
  let on = true;
  while (offset < duration) {
    commands.push(cmd(offset, color, on ? peak : 0, 0));
    offset += trunc(halfCycle);
    on = !on;
  }
  return commands;
}

function siren(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 2000);
  let first = primary(input);
  let second = secondary(input);
  if (input.primaryColor === null) first = { r: 255, g: 0, b: 0 };
  if (input.secondaryColor === null) second = { r: 0, g: 0, b: 255 };
  let rateHz = param(input, 'pulse_rate_hz', 2);
  const peak = scaleBrightness(100, intensity, context.brightnessCap);
  if (simplify(context)) rateHz = Math.min(rateHz, 1);
  const halfCycle = Math.max(1000 / rateHz / 2, 50);
  const transitionMs = Math.min(halfCycle / 4, 50);
  const commands: EffectCommand[] = [];
  let offset = 0;
  let usePrimary = true;
  while (offset < duration) {
    commands.push(cmd(offset, usePrimary ? first : second, peak, trunc(transitionMs)));
    offset += trunc(halfCycle);
    usePrimary = !usePrimary;
  }
  return commands;
}

function rgbToHue(r: number, g: number, b: number): number {
  const rd = r / 255;
  const gd = g / 255;
  const bd = b / 255;
  const max = Math.max(rd, gd, bd);
  const min = Math.min(rd, gd, bd);
  const delta = max - min;
  if (delta < 0.001) return 180;
  let hue: number;
  if (max === rd) hue = 60 * (((gd - bd) / delta) % 6);
  else if (max === gd) hue = 60 * ((bd - rd) / delta + 2);
  else hue = 60 * ((rd - gd) / delta + 4);
  if (hue < 0) hue += 360;
  return hue;
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: trunc((r + m) * 255) & 255, g: trunc((g + m) * 255) & 255, b: trunc((b + m) * 255) & 255 };
}

function aurora(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 5000);
  const base = primary(input);
  const stepMs = 250;
  const steps = trunc(duration / stepMs);
  const baseHue = rgbToHue(base.r, base.g, base.b);
  const brightness = scaleBrightness(70, intensity, context.brightnessCap);
  const commands: EffectCommand[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepMs;
    const hueShift =
      Math.sin((2 * Math.PI * 0.1 * t) / 1000) * 60 +
      Math.sin((2 * Math.PI * 0.07 * t) / 1000) * 40 +
      Math.sin((2 * Math.PI * 0.03 * t) / 1000) * 20;
    const satMod = 0.7 + 0.3 * Math.sin((2 * Math.PI * 0.05 * t) / 1000);
    let hue = (baseHue + hueShift) % 360;
    if (hue < 0) hue += 360;
    commands.push(cmd(t, hsvToRgb(hue, satMod, 1), brightness, stepMs));
  }
  return commands;
}

function candle(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const warm = { r: 255, g: 170, b: 80 };
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const cap = context.brightnessCap;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 3000);
  if (simplify(context)) {
    const half = trunc(duration / 2);
    return [
      cmd(0, warm, scaleBrightness(65, intensity, cap), half),
      cmd(half, warm, scaleBrightness(50, intensity, cap), half),
    ];
  }
  const stepMs = 100;
  const steps = trunc(duration / stepMs);
  const commands: EffectCommand[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepMs;
    const variation =
      Math.sin((2 * Math.PI * 1.1 * t) / 1000) * 0.05 +
      Math.sin((2 * Math.PI * 2.3 * t) / 1000) * 0.03 +
      Math.sin((2 * Math.PI * 0.4 * t) / 1000) * 0.02;
    const luminance = Math.min(0.75, Math.max(0.45, 0.6 + variation));
    commands.push(cmd(t, warm, scaleBrightness(trunc(luminance * 100), intensity, cap), stepMs));
  }
  return commands;
}

function gunfire(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 500);
  const peak = scaleBrightness(100, intensity, context.brightnessCap);
  const color = { r: 255, g: 240, b: 180 };
  if (simplify(context)) return [cmd(0, color, peak, 0), cmd(50, color, 0, 100)];
  const defaultCount = Math.max(trunc(duration / 100), 1);
  let flashCount = trunc(param(input, 'flash_count', defaultCount));
  flashCount = Math.max(flashCount, 1);
  const cycleMs = Math.max(trunc(duration / flashCount), 50);
  const commands: EffectCommand[] = [];
  for (let i = 0; i < flashCount; i++) {
    const offset = i * cycleMs;
    commands.push(cmd(offset, color, peak, 0));
    commands.push(cmd(offset + 30, color, 0, 0));
  }
  return commands;
}

function neon(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 2000);
  const color = primary(input);
  const steady = scaleBrightness(90, intensity, context.brightnessCap);
  const dim = scaleBrightness(20, intensity, context.brightnessCap);
  if (simplify(context)) {
    const third = trunc(duration / 3);
    return [cmd(0, color, steady, 200), cmd(third, color, dim, 200), cmd(third + 200, color, steady, 200)];
  }
  const commands = [cmd(0, color, steady, 0)];
  let seed = (duration * 7 + 13) >>> 0;
  let offset = 100;
  while (offset < duration - 40) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    seed = seed & 0x7fffffff;
    const gap = 150 + (seed % 400);
    offset += gap;
    if (offset >= duration - 40) break;
    commands.push(cmd(offset, color, dim, 0));
    commands.push(cmd(offset + 20, color, steady, 0));
  }
  return commands;
}

function breathing(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const duration = trunc(input.durationMs > 0 ? input.durationMs : 4000);
  const color = primary(input);
  const rateHz = param(input, 'pulse_rate_hz', 0.25);
  const stepMs = 200;
  const steps = trunc(duration / stepMs);
  const commands: EffectCommand[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i * stepMs;
    const sine = (Math.sin((2 * Math.PI * rateHz * t) / 1000 - Math.PI / 2) + 1) / 2;
    const eased = Math.pow(sine, 1.5);
    commands.push(cmd(t, color, scaleBrightness(trunc(eased * 100), intensity, context.brightnessCap), stepMs));
  }
  return commands;
}

function spark(input: EffectInput, context: EffectSampleContext): EffectCommand[] {
  const intensity = input.intensity > 0 ? input.intensity : 100;
  const color = primary(input);
  const peak = scaleBrightness(100, intensity, context.brightnessCap);
  if (simplify(context)) return [cmd(0, color, peak, 0), cmd(100, color, 0, 0)];
  return [cmd(0, color, peak, 0), cmd(30, color, 0, 0)];
}

const RENDERERS: Record<EffectType, (input: EffectInput, context: EffectSampleContext) => EffectCommand[]> = {
  LIGHTNING: lightning,
  FLAME: flame,
  FLASHBANG: flashbang,
  EXPLOSION: explosion,
  PULSE: pulse,
  STROBE: strobe,
  SIREN: siren,
  AURORA: aurora,
  CANDLE: candle,
  GUNFIRE: gunfire,
  NEON: neon,
  BREATHING: breathing,
  SPARK: spark,
};

export function renderEffect(input: EffectInput, context: EffectSampleContext = defaultEffectContext()): EffectCommand[] {
  if (!meets(input, context)) return fallback(input, context);
  return RENDERERS[input.effectType](input, context);
}

export function sampleEffectAt(commands: EffectCommand[], offsetMs: number): EffectCommand | null {
  let active: EffectCommand | null = null;
  for (const command of commands) {
    if (command.offsetMs <= offsetMs) active = command;
  }
  return active;
}
