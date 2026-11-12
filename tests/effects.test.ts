import { describe, expect, it } from 'vitest';
import { bulbSupportsEffect, renderEffect } from '$lib/engine/effects';
import { framesForBulbs, previewIntervalMs, sampleChannel } from '$lib/engine/sample';
import { emptyTrack, makeEffect, makeKeyframe, rgb } from '$lib/model/types';

describe('effects and preview frames', () => {
  it('renders strobe, breathing, and an empty window', () => {
    const strobe = makeEffect({
      id: 'strobe',
      channelId: 'main',
      timestampMs: 1000,
      durationMs: 1000,
      effectType: 'STROBE',
      intensity: 80,
      effectParams: { flash_count: 10 },
      primaryColor: rgb(255, 0, 0)
    });
    expect(renderEffect(strobe, 999)).toBeNull();
    expect(renderEffect(strobe, 1000)?.brightness).toBe(80);
    expect(renderEffect(strobe, 1000 + 50)?.brightness).toBe(0);
    expect(renderEffect(strobe, 2000)).toBeNull();

    const breath = makeEffect({
      id: 'breath',
      channelId: 'main',
      timestampMs: 0,
      durationMs: 5000,
      effectType: 'BREATHING',
      intensity: 100,
      effectParams: { pulse_rate_hz: 1 },
      primaryColor: rgb(0, 80, 255)
    });
    expect(renderEffect(breath, 0)?.brightness).toBeCloseTo(15, 5);
    expect(renderEffect(breath, 500)?.brightness).toBeCloseTo(100, 5);
  });

  it('overlays an effect on the interpolated channel and falls back for dim bulbs', () => {
    const track = emptyTrack();
    track.metadata.durationMs = 10_000;
    track.keyframes.push(
      makeKeyframe({
        id: 'base',
        channelId: 'main',
        timestampMs: 0,
        color: rgb(0, 255, 0),
        brightness: 30,
        transitionMs: 0,
        powerOn: true
      })
    );
    track.effectKeyframes.push(
      makeEffect({
        id: 'siren',
        channelId: 'main',
        timestampMs: 1000,
        durationMs: 2000,
        effectType: 'SIREN',
        intensity: 90,
        primaryColor: rgb(255, 0, 0),
        secondaryColor: rgb(0, 0, 255),
        requiredCapability: 'CAPABILITY_RGB',
        fallbackColor: rgb(1, 2, 3),
        fallbackBrightness: 12,
        effectParams: { flash_count: 2 }
      })
    );
    expect(sampleChannel(track, 'main', 500).g).toBe(255);
    expect(sampleChannel(track, 'main', 1000).r).toBe(255);
    const bulbs = [
      { id: 'rgb', capabilities: { rgb: true, minTransitionMs: 40 } },
      { id: 'white', capabilities: { rgb: false, minTransitionMs: 500 } }
    ];
    const frames = framesForBulbs(track, 1000, { main: ['rgb', 'white'] }, bulbs, new Set(), new Set(), 500);
    const color = frames.find((frame) => frame.bulbId === 'rgb');
    const fallback = frames.find((frame) => frame.bulbId === 'white');
    expect(color?.r).toBe(255);
    expect(fallback).toMatchObject({ r: 1, g: 2, b: 3, brightness: 12, transitionMs: 500 });
    expect(bulbSupportsEffect(track.effectKeyframes[0], bulbs[1].capabilities)).toBe(false);
  });

  it('throttles to 10 Hz unless a mapped bulb is slower', () => {
    const bulbs = [
      { id: 'fast', capabilities: { minTransitionMs: 40 } },
      { id: 'slow', capabilities: { minTransitionMs: 250 } }
    ];
    expect(previewIntervalMs(bulbs, { left: ['fast'] })).toBe(100);
    expect(previewIntervalMs(bulbs, { left: ['fast', 'slow'] })).toBe(250);
  });
});
