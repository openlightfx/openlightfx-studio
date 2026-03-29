import { describe, it, expect } from 'vitest';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from '$lib/commands/add-keyframe.js';
import { PasteKeyframesCommand } from '$lib/commands/paste-keyframes.js';

function makeStore(): KeyframeStore & { keyframes: Keyframe[] } {
  const keyframes: Keyframe[] = [];
  return {
    keyframes,
    getKeyframes: () => keyframes,
    addKeyframe: (kf) => keyframes.push(kf),
    removeKeyframe: (id) => {
      const idx = keyframes.findIndex((k) => k.id === id);
      if (idx >= 0) keyframes.splice(idx, 1);
    },
    updateKeyframe: (id, patch) => {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) Object.assign(kf, patch);
    },
  };
}

function makeKf(id: string, channelId: string, timestampMs: number): Keyframe {
  return {
    id, channelId, timestampMs, colorMode: 'RGB',
    color: { r: 255, g: 0, b: 0 }, colorTemperature: 6500,
    brightness: 100, transitionMs: 0, interpolation: 'STEP', powerOn: true,
  };
}

describe('PasteKeyframesCommand', () => {
  it('pastes with correct offsets', () => {
    const store = makeStore();
    const source = [makeKf('kf-1', 'ch-a', 1000), makeKf('kf-2', 'ch-a', 2000)];
    const cmd = new PasteKeyframesCommand(source, 'ch-b', 5000, 1000, () => 'new-id', store);
    cmd.execute();
    expect(store.keyframes).toHaveLength(2);
    expect(store.keyframes[0].timestampMs).toBe(5000); // offset: 5000-1000=4000, 1000+4000=5000
    expect(store.keyframes[1].timestampMs).toBe(6000); // 2000+4000=6000
    expect(store.keyframes[0].channelId).toBe('ch-b');
  });

  it('undoes paste by removing pasted keyframes', () => {
    const store = makeStore();
    const source = [makeKf('kf-1', 'ch-a', 1000)];
    const cmd = new PasteKeyframesCommand(source, 'ch-a', 5000, 1000, () => 'paste-1', store);
    cmd.execute();
    expect(store.keyframes).toHaveLength(1);
    cmd.undo();
    expect(store.keyframes).toHaveLength(0);
  });
});
