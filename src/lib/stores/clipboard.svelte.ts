import type { ClipboardBuffer } from '$lib/types/ui.js';
import type { Keyframe, EffectKeyframe } from '$lib/types/track.js';

class ClipboardStore {
  buffer = $state<ClipboardBuffer | null>(null);

  get hasContent(): boolean { return this.buffer !== null; }

  copyKeyframes(keyframes: Keyframe[], sourceChannelId: string): void {
    if (keyframes.length === 0) return;
    const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);
    const baseTimestampMs = sorted[0].timestampMs;
    this.buffer = {
      type: 'keyframes',
      sourceChannelId,
      data: sorted.map((kf) => ({ ...kf, color: { ...kf.color } })),
      baseTimestampMs,
    };
  }

  copyEffects(effects: EffectKeyframe[], sourceChannelId: string): void {
    if (effects.length === 0) return;
    const sorted = [...effects].sort((a, b) => a.timestampMs - b.timestampMs);
    const baseTimestampMs = sorted[0].timestampMs;
    this.buffer = {
      type: 'effect',
      sourceChannelId,
      data: sorted.map((ef) => ({
        ...ef,
        primaryColor: { ...ef.primaryColor },
        secondaryColor: { ...ef.secondaryColor },
        fallbackColor: { ...ef.fallbackColor },
        effectParams: { params: { ...ef.effectParams.params } },
      })),
      baseTimestampMs,
    };
  }

  clear(): void { this.buffer = null; }
}

export const clipboardStore = new ClipboardStore();
