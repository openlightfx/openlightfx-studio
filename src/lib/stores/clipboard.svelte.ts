// ============================================================
// Clipboard Store — copy/paste buffer for keyframes and effects
// ============================================================

import type { ClipboardBuffer } from '$lib/types/index.js';
import type { Keyframe, EffectKeyframe } from '$lib/types/index.js';

class ClipboardStoreClass {
  buffer = $state<ClipboardBuffer | null>(null);

  get hasContent(): boolean {
    return this.buffer !== null;
  }

  get contentType(): ClipboardBuffer['type'] | null {
    return this.buffer?.type ?? null;
  }

  copy(keyframes: Keyframe[], sourceChannelId: string): void {
    if (keyframes.length === 0) return;
    const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);
    this.buffer = {
      type: 'keyframes',
      sourceChannelId,
      data: structuredClone(sorted),
      baseTimestampMs: sorted[0].timestampMs,
    };
  }

  copyEffect(effect: EffectKeyframe, sourceChannelId: string): void {
    this.buffer = {
      type: 'effect',
      sourceChannelId,
      data: structuredClone(effect),
      baseTimestampMs: effect.timestampMs,
    };
  }

  cut(keyframes: Keyframe[], sourceChannelId: string): void {
    // Cut copies the data; the caller is responsible for deleting originals
    this.copy(keyframes, sourceChannelId);
  }

  paste(
    targetChannelId: string,
    targetTimestampMs: number
  ):
    | { type: 'keyframes'; keyframes: Keyframe[] }
    | { type: 'effect'; effect: EffectKeyframe }
    | null {
    if (!this.buffer) return null;

    const offset = targetTimestampMs - this.buffer.baseTimestampMs;

    if (this.buffer.type === 'keyframes') {
      const originals = this.buffer.data as Keyframe[];
      const pasted = originals.map((kf) => ({
        ...structuredClone(kf),
        id: crypto.randomUUID(),
        channelId: targetChannelId,
        timestampMs: Math.max(0, kf.timestampMs + offset),
      }));
      return { type: 'keyframes', keyframes: pasted };
    }

    if (this.buffer.type === 'effect') {
      const original = this.buffer.data as EffectKeyframe;
      const pasted: EffectKeyframe = {
        ...structuredClone(original),
        id: crypto.randomUUID(),
        channelId: targetChannelId,
        timestampMs: Math.max(0, original.timestampMs + offset),
      };
      return { type: 'effect', effect: pasted };
    }

    return null;
  }

  clear(): void {
    this.buffer = null;
  }
}

export const clipboardStore = new ClipboardStoreClass();
