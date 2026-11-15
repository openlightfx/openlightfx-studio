import { describe, expect } from 'vitest';
import { requirement } from '../harness/requirement';
import {
  applyKeyframeMovePlan,
  indexKeyframesForMove,
  planAbsoluteKeyframeTime,
  planSharedKeyframeMove,
  proxyFrameTimeMs,
  validateTrack,
  type Keyframe,
  type Track,
} from '../../src/lib/domain';

function key(id: string, channelId: string, timestampMs: number, transitionMs = 0): Keyframe {
  return {
    id,
    channelId,
    timestampMs,
    colorMode: 'RGB',
    color: { r: 12, g: 34, b: 56 },
    colorTemperature: 2700,
    brightness: 70,
    transitionMs,
    interpolation: 'LINEAR',
    powerOn: true,
  };
}

function track(keyframes: Keyframe[]): Track {
  return {
    version: 1,
    metadata: {
      title: 'Move test',
      description: 'metadata stays',
      author: 'author',
      tags: ['keep'],
      imdbId: '',
      movieTitle: 'Movie',
      year: 2026,
      durationMs: 2000,
    },
    channels: [
      {
        id: 'left',
        displayName: 'Left',
        spatialHint: 'SPATIAL_LEFT',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 0,
        optional: false,
      },
      {
        id: 'right',
        displayName: 'Right',
        spatialHint: 'SPATIAL_RIGHT',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 0,
        optional: false,
      },
    ],
    keyframes,
    effects: [
      {
        id: 'effect',
        channelId: 'left',
        timestampMs: 500,
        durationMs: 100,
        effectType: 'PULSE',
        intensity: 30,
        primaryColor: { r: 1, g: 2, b: 3 },
        secondaryColor: null,
        params: { count: 2 },
        requiredCapability: '',
        fallbackColor: null,
        fallbackBrightness: 0,
      },
    ],
    safety: null,
  };
}

function validSharedDelta(keys: Keyframe[], ids: Set<string>, delta: number, spacing: number) {
  for (const frame of keys) {
    if (!ids.has(frame.id)) continue;
    const time = frame.timestampMs + delta;
    if (time < 0 || time > 2000 || time < frame.transitionMs) return false;
    for (const other of keys) {
      if (other.channelId !== frame.channelId || ids.has(other.id)) continue;
      const oldGap = Math.abs(frame.timestampMs - other.timestampMs);
      const newGap = Math.abs(time - other.timestampMs);
      if ((frame.timestampMs - other.timestampMs) * (time - other.timestampMs) <= 0) return false;
      if (oldGap >= spacing && newGap < Math.max(1, spacing)) return false;
      if (oldGap < spacing && newGap < oldGap) return false;
    }
  }
  return true;
}

requirement(
  'ED2-015 @unit a shared delta moves selected adjacent keys atomically across lanes',
  () => {
    const source = track([
      key('left-before', 'left', 100),
      key('left-a', 'left', 400),
      key('left-b', 'left', 500),
      key('left-after', 'left', 900),
      key('right-before', 'right', 200),
      key('right-a', 'right', 450),
      key('right-after', 'right', 1000),
    ]);
    const original = structuredClone(source);
    const plan = planSharedKeyframeMove(indexKeyframesForMove(source.keyframes), {
      ids: ['left-a', 'left-b', 'right-a'],
      deltaMs: 200,
      durationMs: 2000,
      spacingMs: 100,
    });
    expect(plan).toMatchObject({ status: 'valid', deltaMs: 200 });
    expect(plan.times).toEqual([
      { id: 'left-a', timestampMs: 600 },
      { id: 'left-b', timestampMs: 700 },
      { id: 'right-a', timestampMs: 650 },
    ]);
    const moved = applyKeyframeMovePlan(source, plan);
    expect(source).toEqual(original);
    expect(moved.metadata).toEqual(source.metadata);
    expect(moved.effects).toEqual(source.effects);
    expect(moved.keyframes.find((frame) => frame.id === 'left-a')).toEqual({
      ...source.keyframes.find((frame) => frame.id === 'left-a')!,
      timestampMs: 600,
    });
    expect(validateTrack(moved)).toEqual([]);
  }
);

requirement('ED2-015 @unit nearest unselected neighbors clamp a shared delta atomically', () => {
  const keys = [
    key('left-obstacle', 'left', 200),
    key('left-selected', 'left', 500),
    key('left-next', 'left', 800),
    key('right-obstacle', 'right', 100),
    key('right-selected', 'right', 600),
    key('right-next', 'right', 1000),
  ];
  for (const spacing of [0, 100, 200, 1000]) {
    const move = planSharedKeyframeMove(indexKeyframesForMove(keys), {
      ids: ['left-selected', 'right-selected'],
      deltaMs: 800,
      durationMs: 2000,
      spacingMs: spacing,
    });
    const expectedDelta = spacing === 0 ? 299 : spacing === 100 ? 200 : spacing === 200 ? 100 : 0;
    expect(move.status).toBe(expectedDelta === 0 ? 'no-op' : 'clamped');
    expect(move.deltaMs).toBe(expectedDelta);
    expect(move.times).toHaveLength(expectedDelta === 0 ? 0 : 2);
    expect(new Set(move.times.map((entry) => entry.timestampMs)).size).toBe(move.times.length);
  }
});

requirement('ED2-015 @unit bounds and incoming fades constrain the whole group', () => {
  const index = indexKeyframesForMove([key('fade', 'left', 300, 250), key('other', 'right', 1000)]);
  const beforeZero = planSharedKeyframeMove(index, {
    ids: ['fade', 'other'],
    deltaMs: -500,
    durationMs: 2000,
    spacingMs: 0,
  });
  expect(beforeZero).toMatchObject({ status: 'clamped', deltaMs: -50 });
  expect(beforeZero.times).toEqual([
    { id: 'fade', timestampMs: 250 },
    { id: 'other', timestampMs: 950 },
  ]);
  const end = planSharedKeyframeMove(indexKeyframesForMove([key('edge', 'left', 1900)]), {
    ids: ['edge'],
    deltaMs: 500,
    durationMs: 2000,
    spacingMs: 0,
  });
  expect(end).toMatchObject({ status: 'clamped', deltaMs: 100 });
  expect(end.times).toEqual([{ id: 'edge', timestampMs: 2000 }]);
  const atZero = planSharedKeyframeMove(indexKeyframesForMove([key('zero', 'left', 0)]), {
    ids: ['zero'],
    deltaMs: -1,
    durationMs: 2000,
    spacingMs: 0,
  });
  expect(atZero).toMatchObject({ status: 'no-op', deltaMs: 0, times: [] });
});

requirement(
  'ED2-015 @unit spacing zero still preserves unique times and imported close relationships',
  () => {
    const closeImport = [
      key('legacy-a', 'left', 100),
      key('legacy-b', 'left', 150),
      key('moved', 'right', 500),
    ];
    const away = planSharedKeyframeMove(indexKeyframesForMove(closeImport), {
      ids: ['legacy-b', 'moved'],
      deltaMs: 100,
      durationMs: 2000,
      spacingMs: 100,
    });
    expect(away).toMatchObject({ status: 'valid', deltaMs: 100 });
    const toward = planSharedKeyframeMove(indexKeyframesForMove(closeImport), {
      ids: ['legacy-b'],
      deltaMs: -10,
      durationMs: 2000,
      spacingMs: 100,
    });
    expect(toward).toMatchObject({ status: 'no-op', deltaMs: 0, times: [] });
    const unique = planSharedKeyframeMove(indexKeyframesForMove([key('a', 'left', 500)]), {
      ids: ['a'],
      deltaMs: 0,
      durationMs: 2000,
      spacingMs: 0,
    });
    expect(unique.status).toBe('no-op');
    const duplicate = planAbsoluteKeyframeTime(
      indexKeyframesForMove([key('a', 'left', 500), key('b', 'left', 800)]),
      { id: 'a', timeMs: 800, durationMs: 2000, spacingMs: 0 }
    );
    expect(duplicate.status).toBe('blocked');
  }
);

requirement('ED2-015 @unit fractional proxy fps quantizes the anchor once for the group', () => {
  const fps = 23.976;
  const keys = [key('anchor', 'left', 1000), key('group', 'right', 1250)];
  const plan = planSharedKeyframeMove(indexKeyframesForMove(keys), {
    ids: ['anchor', 'group'],
    deltaMs: 300,
    durationMs: 2000,
    spacingMs: 0,
    framePolicy: { kind: 'proxy-frame', fps, anchorId: 'anchor' },
  });
  const anchorTarget = Math.min(2000, proxyFrameTimeMs(Math.round((1300 * fps) / 1000), fps));
  expect(plan.status).toBe('valid');
  expect(plan.deltaMs).toBe(anchorTarget - 1000);
  expect(plan.times).toEqual([
    { id: 'anchor', timestampMs: anchorTarget },
    { id: 'group', timestampMs: 1250 + anchorTarget - 1000 },
  ]);
  expect(plan.times[1].timestampMs - plan.times[0].timestampMs).toBe(250);
});

requirement('ED2-015 @unit absolute typed time remains exact and may reorder if valid', () => {
  const source = [
    key('first', 'left', 300),
    key('typed', 'left', 700),
    key('last', 'left', 1200, 100),
  ];
  const move = planAbsoluteKeyframeTime(indexKeyframesForMove(source), {
    id: 'typed',
    timeMs: 1401,
    durationMs: 2000,
    spacingMs: 100,
  });
  expect(move).toMatchObject({
    status: 'valid',
    deltaMs: null,
    times: [{ id: 'typed', timestampMs: 1401 }],
  });
  const reordered = applyKeyframeMovePlan({ ...track(source), keyframes: source }, move);
  expect(reordered.keyframes.map((frame) => [frame.id, frame.timestampMs])).toEqual([
    ['first', 300],
    ['typed', 1401],
    ['last', 1200],
  ]);
  const fade = planAbsoluteKeyframeTime(indexKeyframesForMove([key('fade', 'left', 300, 250)]), {
    id: 'fade',
    timeMs: 249,
    durationMs: 2000,
    spacingMs: 0,
  });
  expect(fade.status).toBe('blocked');
});

requirement(
  'ED2-015 @unit invalid values and missing IDs are blocked without changing source',
  () => {
    const keys = [key('one', 'left', 500)];
    const index = indexKeyframesForMove(keys);
    for (const deltaMs of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.5]) {
      expect(
        planSharedKeyframeMove(index, { ids: ['one'], deltaMs, durationMs: 2000, spacingMs: 0 })
          .status
      ).toBe('blocked');
    }
    for (const ids of [['missing'], ['one', 'missing']]) {
      const plan = planSharedKeyframeMove(index, {
        ids,
        deltaMs: 20,
        durationMs: 2000,
        spacingMs: 0,
      });
      expect(plan.status).toBe('blocked');
      expect(applyKeyframeMovePlan({ keyframes: keys }, plan).keyframes).toBe(keys);
    }
    expect(
      planAbsoluteKeyframeTime(index, {
        id: 'one',
        timeMs: Number.NaN,
        durationMs: 2000,
        spacingMs: 0,
      }).status
    ).toBe('blocked');
    expect(
      planSharedKeyframeMove(index, { ids: [], deltaMs: 0, durationMs: 2000, spacingMs: 0 }).status
    ).toBe('no-op');
    expect(keys[0].timestampMs).toBe(500);
  }
);

requirement('ED2-015 @unit a reused index handles a large selected run from one snapshot', () => {
  const keys = Array.from({ length: 6000 }, (_, index) => key(`group-${index}`, 'left', index));
  const index = indexKeyframesForMove(keys);
  const ids = keys.map((frame) => frame.id);
  const first = planSharedKeyframeMove(index, {
    ids,
    deltaMs: 1,
    durationMs: 10_000,
    spacingMs: 0,
  });
  const second = planSharedKeyframeMove(index, {
    ids,
    deltaMs: 2,
    durationMs: 10_000,
    spacingMs: 0,
  });
  expect(index.keyframes).toBe(keys);
  expect(first.times).toHaveLength(keys.length);
  expect(first.times[0].timestampMs).toBe(1);
  expect(second.times[0].timestampMs).toBe(2);
  expect(keys[0].timestampMs).toBe(0);
});

requirement(
  'ED2-015 @unit small independent brute-force oracle agrees with shared-delta constraints',
  () => {
    const keys = [
      key('l0', 'left', 100),
      key('la', 'left', 400),
      key('lb', 'left', 500),
      key('l1', 'left', 900),
      key('ra', 'right', 450, 50),
      key('r1', 'right', 850),
    ];
    const ids = new Set(['la', 'lb', 'ra']);
    for (const spacing of [0, 100, 200, 1000]) {
      const requested = 350;
      const feasible = Array.from({ length: 2001 }, (_, index) => index - 1000).filter((delta) =>
        validSharedDelta(keys, ids, delta, spacing)
      );
      const expected = feasible.reduce((best, candidate) =>
        Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best
      );
      const actual = planSharedKeyframeMove(indexKeyframesForMove(keys), {
        ids: [...ids],
        deltaMs: requested,
        durationMs: 2000,
        spacingMs: spacing,
      });
      expect(actual.deltaMs).toBe(expected);
      expect(
        actual.times.every(
          (entry) =>
            entry.timestampMs === keys.find((k) => k.id === entry.id)!.timestampMs + expected
        )
      ).toBe(true);
    }
  }
);
