import { describe, it, expect } from 'vitest';
import { AddKeyframeCommand } from '../../src/lib/commands/add-keyframe.js';
import { DeleteKeyframeCommand } from '../../src/lib/commands/delete-keyframe.js';
import { MoveKeyframeCommand } from '../../src/lib/commands/move-keyframe.js';
import { EditKeyframeCommand } from '../../src/lib/commands/edit-keyframe.js';
import type { Keyframe } from '../../src/lib/types/index.js';

function makeStore() {
  const keyframes: Keyframe[] = [];
  return {
    getKeyframes: () => keyframes,
    addKeyframe: (kf: Keyframe) => keyframes.push(kf),
    removeKeyframe: (id: string) => {
      const idx = keyframes.findIndex((k) => k.id === id);
      if (idx >= 0) keyframes.splice(idx, 1);
    },
    updateKeyframe: (id: string, patch: Partial<Keyframe>) => {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) Object.assign(kf, patch);
    },
  };
}

const sampleKf: Keyframe = {
  id: 'k1', channelId: 'ambient', timestampMs: 1000,
  colorMode: 'RGB', color: { r: 255, g: 0, b: 0 }, colorTemperature: 0,
  brightness: 80, transitionMs: 0, interpolation: 'STEP', powerOn: true,
};

describe('AddKeyframeCommand', () => {
  it('adds and undoes a keyframe', () => {
    const store = makeStore();
    const cmd = new AddKeyframeCommand(sampleKf, store);
    cmd.execute();
    expect(store.getKeyframes()).toHaveLength(1);
    cmd.undo();
    expect(store.getKeyframes()).toHaveLength(0);
  });
});

describe('DeleteKeyframeCommand', () => {
  it('deletes and restores a keyframe', () => {
    const store = makeStore();
    store.addKeyframe({ ...sampleKf });
    const cmd = new DeleteKeyframeCommand('k1', store);
    cmd.execute();
    expect(store.getKeyframes()).toHaveLength(0);
    cmd.undo();
    expect(store.getKeyframes()).toHaveLength(1);
    expect(store.getKeyframes()[0].id).toBe('k1');
  });
});

describe('MoveKeyframeCommand', () => {
  it('moves and undoes a keyframe timestamp', () => {
    const store = makeStore();
    store.addKeyframe({ ...sampleKf });
    const cmd = new MoveKeyframeCommand('k1', 2000, store);
    cmd.execute();
    expect(store.getKeyframes()[0].timestampMs).toBe(2000);
    cmd.undo();
    expect(store.getKeyframes()[0].timestampMs).toBe(1000);
  });
});

describe('EditKeyframeCommand', () => {
  it('edits and undoes keyframe properties', () => {
    const store = makeStore();
    store.addKeyframe({ ...sampleKf });
    const cmd = new EditKeyframeCommand('k1', { brightness: 50, color: { r: 0, g: 255, b: 0 } }, store);
    cmd.execute();
    expect(store.getKeyframes()[0].brightness).toBe(50);
    expect(store.getKeyframes()[0].color.g).toBe(255);
    cmd.undo();
    expect(store.getKeyframes()[0].brightness).toBe(80);
    expect(store.getKeyframes()[0].color.r).toBe(255);
  });
});
