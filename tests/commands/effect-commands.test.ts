import { describe, it, expect } from 'vitest';
import { AddEffectCommand } from '../../src/lib/commands/add-effect.js';
import { DeleteEffectCommand } from '../../src/lib/commands/delete-effect.js';
import { EditEffectCommand } from '../../src/lib/commands/edit-effect.js';
import { MoveEffectCommand } from '../../src/lib/commands/move-effect.js';
import type { EffectKeyframe } from '../../src/lib/types/index.js';

function makeStore() {
  const effects: EffectKeyframe[] = [];
  return {
    effects,
    getEffectKeyframes: () => effects,
    addEffectKeyframe: (ef: EffectKeyframe) => effects.push(ef),
    removeEffectKeyframe: (id: string) => {
      const idx = effects.findIndex((e) => e.id === id);
      if (idx >= 0) effects.splice(idx, 1);
    },
    updateEffectKeyframe: (id: string, patch: Partial<EffectKeyframe>) => {
      const ef = effects.find((e) => e.id === id);
      if (ef) Object.assign(ef, patch);
    },
  };
}

const sampleEffect: EffectKeyframe = {
  id: 'e1',
  channelId: 'ambient',
  timestampMs: 1000,
  durationMs: 500,
  effectType: 'LIGHTNING',
  intensity: 80,
  primaryColor: { r: 255, g: 255, b: 255 },
  secondaryColor: { r: 0, g: 0, b: 255 },
  effectParams: { params: { speed: 1 } },
  requiredCapability: 'CAPABILITY_ANY',
  fallbackColor: { r: 255, g: 255, b: 255 },
  fallbackBrightness: 100,
};

describe('AddEffectCommand', () => {
  it('adds and undoes an effect keyframe', () => {
    const store = makeStore();
    const cmd = new AddEffectCommand(sampleEffect, store);
    cmd.execute();
    expect(store.getEffectKeyframes()).toHaveLength(1);
    expect(store.getEffectKeyframes()[0].effectType).toBe('LIGHTNING');
    cmd.undo();
    expect(store.getEffectKeyframes()).toHaveLength(0);
  });
});

describe('DeleteEffectCommand', () => {
  it('deletes and restores an effect keyframe', () => {
    const store = makeStore();
    store.addEffectKeyframe({ ...sampleEffect, primaryColor: { ...sampleEffect.primaryColor }, secondaryColor: { ...sampleEffect.secondaryColor }, fallbackColor: { ...sampleEffect.fallbackColor }, effectParams: { params: { ...sampleEffect.effectParams.params } } });
    const cmd = new DeleteEffectCommand('e1', store);
    cmd.execute();
    expect(store.getEffectKeyframes()).toHaveLength(0);
    cmd.undo();
    expect(store.getEffectKeyframes()).toHaveLength(1);
    expect(store.getEffectKeyframes()[0].id).toBe('e1');
    expect(store.getEffectKeyframes()[0].effectType).toBe('LIGHTNING');
  });
});

describe('EditEffectCommand', () => {
  it('edits intensity and undoes', () => {
    const store = makeStore();
    store.addEffectKeyframe({ ...sampleEffect, primaryColor: { ...sampleEffect.primaryColor }, secondaryColor: { ...sampleEffect.secondaryColor }, fallbackColor: { ...sampleEffect.fallbackColor }, effectParams: { params: { ...sampleEffect.effectParams.params } } });
    const cmd = new EditEffectCommand('e1', { intensity: 50 }, store);
    cmd.execute();
    expect(store.getEffectKeyframes()[0].intensity).toBe(50);
    cmd.undo();
    expect(store.getEffectKeyframes()[0].intensity).toBe(80);
  });

  it('edits a nested object (primaryColor) and undoes', () => {
    const store = makeStore();
    store.addEffectKeyframe({ ...sampleEffect, primaryColor: { ...sampleEffect.primaryColor }, secondaryColor: { ...sampleEffect.secondaryColor }, fallbackColor: { ...sampleEffect.fallbackColor }, effectParams: { params: { ...sampleEffect.effectParams.params } } });
    const cmd = new EditEffectCommand('e1', { primaryColor: { r: 0, g: 128, b: 64 } }, store);
    cmd.execute();
    expect(store.getEffectKeyframes()[0].primaryColor.r).toBe(0);
    cmd.undo();
    expect(store.getEffectKeyframes()[0].primaryColor.r).toBe(255);
  });
});

describe('MoveEffectCommand', () => {
  it('moves timestampMs and undoes', () => {
    const store = makeStore();
    store.addEffectKeyframe({ ...sampleEffect, primaryColor: { ...sampleEffect.primaryColor }, secondaryColor: { ...sampleEffect.secondaryColor }, fallbackColor: { ...sampleEffect.fallbackColor }, effectParams: { params: { ...sampleEffect.effectParams.params } } });
    const cmd = new MoveEffectCommand('e1', 3000, store);
    cmd.execute();
    expect(store.getEffectKeyframes()[0].timestampMs).toBe(3000);
    cmd.undo();
    expect(store.getEffectKeyframes()[0].timestampMs).toBe(1000);
  });
});
