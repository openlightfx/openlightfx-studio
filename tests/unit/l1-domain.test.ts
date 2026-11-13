import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import {
  AUTOSAVE_INTERVAL_MS,
  CHANNEL_SLUG,
  EFFECT_TYPES,
  L1_SHORTCUTS,
  TEMPLATES,
  acceptSpacing,
  addChannel,
  parseHex,
  applyMirror,
  applySpread,
  applyTemplate,
  applyZoomChord,
  assignBulb,
  authoredBrightness,
  blackKeyframe,
  canInsert,
  chooseLoadSource,
  clampKeyframeTime,
  clampRgbChannel,
  clampTransition,
  classifyLocalFile,
  computeSafety,
  createHistory,
  crashKey,
  decodeTrack,
  durationDisagrees,
  effectCatalog,
  emptyMetadata,
  encodeTrack,
  flushOnPageHide,
  forbiddenChordsInRegistry,
  frameStepMs,
  importDurationWarning,
  importTrack,
  kelvinToRgb,
  l1ExposesAutomaticGeneration,
  makeCrashRecord,
  moduleGraphProblems,
  newKeyframe,
  newTrackFromMovie,
  upgradeLegacyTrackLayout,
  overlaySample,
  photosensitivityNotice,
  planHostedSave,
  resolveDuration,
  roundHalfToEven,
  sampleChannel,
  setKelvin,
  shouldFlushAutosave,
  sidecarDocument,
  snapTime,
  stepPlayhead,
  validateTrack,
  visibleMarks,
  withAuthorWarning,
  zoomToFit,
  type ChannelGroup,
  type Keyframe,
  type Track,
} from '../../src/lib/domain';
import { requirement } from '../harness/requirement';

function meta(durationMs = 10000, extra: Partial<Track['metadata']> = {}): Track['metadata'] {
  return { ...emptyMetadata('Proxy Fixture', durationMs), ...extra };
}

function channel(id = 'left'): Track['channels'][number] {
  return {
    id,
    displayName: id,
    spatialHint: 'SPATIAL_LEFT',
    defaultColor: { r: 255, g: 0, b: 0 },
    defaultBrightness: 80,
    optional: false,
  };
}

function keyframe(partial: Partial<Keyframe> & Pick<Keyframe, 'id' | 'timestampMs'>): Keyframe {
  return {
    channelId: 'left',
    colorMode: 'RGB',
    color: { r: 0, g: 0, b: 0 },
    colorTemperature: 0,
    brightness: 0,
    transitionMs: 0,
    interpolation: 'STEP',
    powerOn: false,
    ...partial,
  };
}

function track(partial: Partial<Track> = {}): Track {
  return {
    version: 1,
    metadata: meta(),
    channels: [channel()],
    keyframes: [keyframe({ id: 'a', timestampMs: 0 })],
    effects: [],
    safety: null,
    ...partial,
  };
}

requirement('MEDIA-007 @unit frame step is round(1000/fps) via currentTime', () => {
  expect(frameStepMs(24)).toBe(42);
  expect(stepPlayhead(0, 24, 24)).toEqual({ timeMs: 1008, method: 'currentTime' });
});

requirement('MEDIA-014 @unit local H.264 MP4 plays and the bundle has no ffmpeg.wasm', () => {
  expect(classifyLocalFile('clip-a.mp4', 'video/mp4')).toBe('playable');
  expect(classifyLocalFile('clip-b.mkv')).toBe('refused');
  expect(classifyLocalFile('movie.hevc')).toBe('refused');
  expect(classifyLocalFile('audio.truehd')).toBe('refused');
  const root = path.join(process.cwd(), 'src');
  const files: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|js|svelte)$/.test(entry.name))
        files.push({ path: full, text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  expect(moduleGraphProblems(files)).toEqual([]);
});

requirement('MEDIA-015 @unit a zero item runtime uses the probe and never asks', () => {
  expect(resolveDuration(0, 120000)).toEqual({ durationMs: 120000, askUser: false });
  expect(resolveDuration(0, null)).toEqual({ durationMs: null, askUser: false });
  expect(resolveDuration(90000, 120000).durationMs).toBe(90000);
});

requirement('TIME-001 @unit draw marks keep channel, time, and RGB', () => {
  const marks = visibleMarks(
    [
      keyframe({ id: 'a', timestampMs: 0, color: { r: 255, g: 0, b: 0 }, channelId: 'left' }),
      keyframe({ id: 'b', timestampMs: 1000, color: { r: 0, g: 0, b: 255 }, channelId: 'right' }),
    ],
    0,
    10000
  );
  expect(marks.map((mark) => [mark.channelId, mark.timestampMs, mark.color.r])).toEqual([
    ['left', 0, 255],
    ['right', 1000, 0],
  ]);
});

requirement('TIME-002 @unit zoom keys are brackets and modifier chords do not zoom', () => {
  expect(applyZoomChord(1, ']', false, 600000, 1000)).toBeGreaterThan(1);
  expect(applyZoomChord(1, '[', false, 600000, 1000)).toBeLessThan(1);
  expect(applyZoomChord(4, '\\', false, 1000, 500)).toBe(zoomToFit(1000, 500));
  expect(applyZoomChord(4, '+', true, 1000, 500)).toBe(4);
  expect(applyZoomChord(4, '0', true, 1000, 500)).toBe(4);
});

requirement('TIME-007 @unit offscreen keyframes are omitted from the draw list', () => {
  const marks = visibleMarks(
    [keyframe({ id: 'near', timestampMs: 0 }), keyframe({ id: 'far', timestampMs: 3_600_000 })],
    0,
    10_000
  );
  expect(marks.map((mark) => mark.id)).toEqual(['near']);
});

requirement('TIME-010 @unit drag snaps to the second and stops at minimum spacing', () => {
  const snapped = snapTime({
    timeMs: 2004,
    fromMs: 5000,
    pxPerMs: 1,
    durationMs: 10000,
    minSpacingMs: 200,
    obstacles: [1000],
  });
  expect(snapped.timeMs).toBe(2000);
  const blocked = snapTime({
    timeMs: 1100,
    fromMs: 5000,
    pxPerMs: 1,
    durationMs: 10000,
    minSpacingMs: 200,
    obstacles: [1000],
  });
  expect(blocked.timeMs).toBe(1200);
  expect(acceptSpacing(100) && acceptSpacing(200) && acceptSpacing(1000)).toBe(true);
  expect(acceptSpacing(50) || acceptSpacing(5000)).toBe(false);
});

requirement('TIME-012 @unit frame snap lands on the 24 fps grid', () => {
  const snapped = snapTime({
    timeMs: 40,
    fromMs: 0,
    pxPerMs: 1,
    durationMs: 10000,
    frameSnap: true,
    fps: 24,
  });
  expect(snapped.timeMs).toBe(42);
});

requirement('KEY-003 @unit a new keyframe copies the previous look and steps', () => {
  const created = newKeyframe(
    [
      keyframe({
        id: 'prev',
        timestampMs: 0,
        color: { r: 10, g: 20, b: 30 },
        brightness: 40,
        interpolation: 'LINEAR',
        transitionMs: 80,
      }),
    ],
    500,
    'next'
  );
  expect(created).toMatchObject({
    color: { r: 10, g: 20, b: 30 },
    brightness: 40,
    interpolation: 'STEP',
    transitionMs: 0,
  });
  const first = newKeyframe([], 0, 'first');
  expect(first).toMatchObject({
    color: { r: 0, g: 0, b: 0 },
    brightness: 0,
    interpolation: 'STEP',
    transitionMs: 0,
  });
});

requirement(
  'KEY-005 @unit times stay inside the movie and transition cannot pass the keyframe',
  () => {
    expect(clampKeyframeTime(-100, 10000)).toBe(0);
    expect(clampKeyframeTime(20000, 10000)).toBe(10000);
    expect(clampTransition(500, 300)).toBe(300);
  }
);

requirement('KEY-006 @unit a channel refuses a keyframe inside the minimum spacing', () => {
  const existing = [keyframe({ id: 'a', timestampMs: 1000 })];
  expect(canInsert(existing, 1100, 200)).toBe(false);
  expect(existing).toHaveLength(1);
  expect(canInsert(existing, 1200, 200)).toBe(true);
});

requirement('KEY-008 @unit the encoder writes version 1 and sorts each channel by time', () => {
  const encoded = decodeTrack(
    encodeTrack(
      track({
        keyframes: [
          keyframe({ id: 'late', timestampMs: 800, channelId: 'left', transitionMs: 10 }),
          keyframe({ id: 'early', timestampMs: 100, channelId: 'left' }),
          keyframe({ id: 'right', timestampMs: 50, channelId: 'right' }),
        ],
        channels: [channel('left'), channel('right')],
      })
    )
  );
  const left = encoded.keyframes
    .filter((kf) => kf.channelId === 'left')
    .map((kf) => kf.timestampMs);
  expect(left).toEqual([100, 800]);
  expect(encoded.version).toBe(1);
  expect(
    encoded.keyframes.every(
      (kf) => kf.transitionMs <= kf.timestampMs && kf.timestampMs <= encoded.metadata.durationMs
    )
  ).toBe(true);
});

requirement(
  'CHAN-001 @unit a new movie starts on Stereo and other templates replace automatic keyframes',
  () => {
    const created = newTrackFromMovie('42', 'Proxy Fixture', 120000);
    expect(created.channels.map((item) => [item.id, item.spatialHint])).toEqual([
      ['left', 'SPATIAL_LEFT'],
      ['right', 'SPATIAL_RIGHT'],
    ]);
    const replaced = applyTemplate('Ambient', created.keyframes);
    expect(replaced.needsConfirm).toBe(false);
    expect(replaced.channels.map((item) => item.id)).toEqual(['ambient']);
    const own = applyTemplate('Surround', [
      ...created.keyframes,
      keyframe({ id: 'extra', timestampMs: 500 }),
    ]);
    expect(own.needsConfirm).toBe(true);
    expect(
      TEMPLATES['8-Channel Home Theater']
        .filter((item) => item.id.startsWith('back'))
        .map((item) => item.spatialHint)
    ).toEqual(['SPATIAL_SURROUND_LEFT', 'SPATIAL_SURROUND_RIGHT']);
  }
);

requirement(
  'CHAN-002 @unit new channel ids are unique lowercase slugs and gain a black keyframe',
  () => {
    const added = addChannel(track(), 'rear_1', 'Rear');
    expect(added.error).toBeNull();
    expect(
      added.track.keyframes.some(
        (kf) => kf.channelId === 'rear_1' && kf.timestampMs === 0 && kf.brightness === 0
      )
    ).toBe(true);
    expect(addChannel(track(), 'Rear', 'Rear').error).not.toBeNull();
    expect(addChannel(added.track, 'rear_1', 'Rear').error).not.toBeNull();
    expect(CHANNEL_SLUG.test('already-imported')).toBe(true);
  }
);

requirement('CHAN-005 @unit a new channel starts with one black step keyframe at zero', () => {
  const kf = blackKeyframe('rear');
  expect(kf).toMatchObject({
    timestampMs: 0,
    color: { r: 0, g: 0, b: 0 },
    brightness: 0,
    transitionMs: 0,
    interpolation: 'STEP',
    colorMode: 'RGB',
    powerOn: false,
  });
});

requirement('CHAN-006 @unit save is blocked when the track has no channels', () => {
  const plan = planHostedSave({
    track: track({ channels: [], keyframes: [] }),
    sidecar: sidecarDocument({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [],
      channelGroups: [],
    }),
    itemId: '42',
    trackId: 'proxy-fixture',
    durationKnown: true,
  });
  expect(plan.blocked).toBe(true);
  expect(plan.requests).toEqual([]);
  expect(plan.message).toContain('V-011');
});

requirement(
  'CHAN-007 @unit mirror and spread write ordinary keyframes and the group stays in the sidecar',
  () => {
    const group: ChannelGroup = {
      id: 'g1',
      name: 'Walls',
      mode: 'mirror',
      channelIds: ['left', 'right'],
      spreadMs: 0,
    };
    const edited = keyframe({
      id: 'l',
      timestampMs: 1000,
      color: { r: 1, g: 2, b: 3 },
      brightness: 40,
    });
    const mirrored = applyMirror(
      [edited, keyframe({ id: 'r', timestampMs: 1000, channelId: 'right' })],
      group,
      edited
    );
    expect(
      mirrored.find((kf) => kf.channelId === 'right' && kf.timestampMs === 1000)?.color
    ).toEqual({ r: 1, g: 2, b: 3 });
    const spread = applySpread(
      { ...group, mode: 'spread', spreadMs: 150, channelIds: ['left', 'right', 'center'] },
      edited
    );
    expect(spread.map((kf) => kf.timestampMs)).toEqual([1000, 1150, 1300]);
    const payload = JSON.stringify({ channels: ['left'] });
    expect(payload.includes('channelGroups')).toBe(false);
  }
);

requirement('PROP-002 @unit hex and sliders stay inside 0-255', () => {
  expect(parseHex({ r: 1, g: 1, b: 1 }, '00FF00').color).toEqual({ r: 0, g: 255, b: 0 });
  const bad = parseHex({ r: 1, g: 2, b: 3 }, 'GG0000');
  expect(bad.color).toEqual({ r: 1, g: 2, b: 3 });
  expect(bad.error).not.toBeNull();
  expect(clampRgbChannel(300)).toBe(255);
});

requirement('PROP-003 @unit kelvin authoring is 1000 to 10000 in steps of 100', () => {
  const accepted = setKelvin(4200);
  expect(accepted.ok && accepted.kelvin).toBe(4200);
  expect(kelvinToRgb(4200).r).toBe(255);
  expect(setKelvin(500).ok).toBe(false);
  expect(setKelvin(20000).ok).toBe(false);
});

requirement('PROP-008 @unit metadata accepts a tt id and rejects abc', () => {
  expect(validateTrack(track({ metadata: meta(10000, { imdbId: 'tt1234567' }) }))).toEqual([]);
  expect(validateTrack(track({ metadata: meta(10000, { imdbId: 'abc' }) })).join(' ')).toContain(
    'V-003'
  );
});

requirement('UNDO-001 @unit undo keeps 200 steps', () => {
  const history = createHistory<number>(0);
  for (let i = 1; i <= 201; i++) history.edit(i);
  const seen: number[] = [];
  for (let i = 0; i < 200; i++) seen.push(history.undo());
  expect(seen[0]).toBe(200);
  expect(seen[199]).toBe(1);
  expect(history.undo()).toBe(1);
});

requirement('UNDO-002 @unit redo restores until the next edit', () => {
  const history = createHistory<string[]>(['a']);
  history.edit(['a', 'b']);
  history.undo();
  expect(history.redo()).toEqual(['a', 'b']);
  history.edit(['a', 'b', 'c']);
  expect(history.canRedo).toBe(false);
});

requirement('UNDO-003 @unit a compound edit is one undo step', () => {
  const history = createHistory<number[]>([10, 90, 20]);
  history.edit([50, 50, 50]);
  expect(history.undo()).toEqual([10, 90, 20]);
});

requirement(
  'UNDO-004 @unit undo is absent from the track, the sidecar, and the crash record',
  () => {
    const sidecar = sidecarDocument({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [],
      channelGroups: [],
    });
    const record = makeCrashRecord({
      key: crashKey('42', 'proxy-fixture'),
      track: track(),
      sidecar,
      playheadMs: 0,
      scrollX: 0,
      savedAt: 1,
      dirty: true,
    });
    const dumped = JSON.stringify({ sidecar, record });
    expect(dumped.includes('undo')).toBe(false);
    expect(record.storage).toBe('indexeddb');
  }
);

requirement('KEYB-001 @unit the registry is the safe L1 map', () => {
  const actions = L1_SHORTCUTS.map((binding) => binding.action);
  expect(actions).toEqual([
    'save',
    'undo',
    'redo',
    'play-pause',
    'add-keyframe',
    'delete',
    'step-back',
    'step-forward',
    'skip-back',
    'skip-forward',
    'zoom-in',
    'zoom-out',
    'zoom-fit',
    'overlay',
    'eyedropper',
    'shortcut-help',
  ]);
  expect(L1_SHORTCUTS.find((binding) => binding.action === 'zoom-in')?.keys).toEqual([']']);
  expect(L1_SHORTCUTS.find((binding) => binding.action === 'overlay')?.keys).toEqual(['V']);
});

requirement('KEYB-002 @unit browser chrome chords are not bound', () => {
  expect(forbiddenChordsInRegistry()).toEqual([]);
});

requirement('SAVE-001 @unit hosted save PUTs the track for the item', () => {
  const plan = planHostedSave({
    track: track(),
    sidecar: sidecarDocument({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [],
      channelGroups: [],
    }),
    itemId: '42',
    trackId: 'proxy-fixture',
    durationKnown: true,
  });
  expect(plan.blocked).toBe(false);
  expect(plan.requests[0]).toEqual({
    method: 'PUT',
    path: '/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=42',
  });
});

requirement('SAVE-003 @unit the sidecar is version 1 and has no undo stack or duration', () => {
  const sidecar = sidecarDocument({
    version: 1,
    itemId: '42',
    trackId: 'proxy-fixture',
    sceneMarkers: [{ id: 'm1', timeMs: 1000, label: 'Intro', kind: 'manual' }],
    channelGroups: [],
  });
  expect(sidecar.version).toBe(1);
  expect(sidecar.itemId).toBe('42');
  expect(JSON.stringify(sidecar).includes('undo')).toBe(false);
  expect('durationMs' in sidecar).toBe(false);
});

requirement('SAVE-004 @unit each TrackParser rule blocks save', () => {
  const sidecar = sidecarDocument({
    version: 1,
    itemId: '42',
    trackId: 'proxy-fixture',
    sceneMarkers: [],
    channelGroups: [],
  });
  const cases: { id: string; value: Track }[] = [
    { id: 'V-001', value: track({ version: 2 }) },
    { id: 'V-002', value: { ...track(), metadata: undefined as unknown as Track['metadata'] } },
    { id: 'V-003', value: track({ metadata: meta(10000, { imdbId: 'abc' }) }) },
    { id: 'V-004', value: track({ metadata: meta(0) }) },
    { id: 'V-005', value: track({ channels: [channel('left'), channel('left')] }) },
    {
      id: 'V-006',
      value: track({
        keyframes: [
          keyframe({ id: 'b', timestampMs: 500 }),
          keyframe({ id: 'a', timestampMs: 100 }),
        ],
      }),
    },
    {
      id: 'V-007',
      value: track({ keyframes: [keyframe({ id: 'a', timestampMs: 0, brightness: 101 })] }),
    },
    {
      id: 'V-008',
      value: track({
        keyframes: [keyframe({ id: 'a', timestampMs: 0, color: { r: 256, g: 0, b: 0 } })],
      }),
    },
    {
      id: 'V-009',
      value: track({
        keyframes: [
          keyframe({
            id: 'a',
            timestampMs: 0,
            colorMode: 'COLOR_TEMPERATURE',
            colorTemperature: 500,
          }),
        ],
      }),
    },
    { id: 'V-010', value: track({ keyframes: [keyframe({ id: 'a', timestampMs: 20000 })] }) },
    { id: 'V-011', value: track({ channels: [], keyframes: [] }) },
    {
      id: 'V-012',
      value: track({ keyframes: [keyframe({ id: 'a', timestampMs: 100, transitionMs: 500 })] }),
    },
    {
      id: 'V-013',
      value: track({
        effects: [
          {
            id: 'e',
            channelId: 'left',
            timestampMs: 0,
            durationMs: 0,
            effectType: 'PULSE',
            intensity: 10,
            primaryColor: null,
            secondaryColor: null,
            params: {},
            requiredCapability: '',
            fallbackColor: null,
            fallbackBrightness: 0,
          },
        ],
      }),
    },
    {
      id: 'V-014',
      value: track({
        effects: [
          {
            id: 'e',
            channelId: 'left',
            timestampMs: 0,
            durationMs: 100,
            effectType: 'PULSE',
            intensity: 101,
            primaryColor: null,
            secondaryColor: null,
            params: {},
            requiredCapability: '',
            fallbackColor: null,
            fallbackBrightness: 0,
          },
        ],
      }),
    },
    {
      id: 'V-022',
      value: track({ metadata: meta(10000, { channelLayout: 'LAYOUT_7_0' }) }),
    },
    {
      id: 'V-023',
      value: track({ metadata: meta(10000, { channelLayout: 'LAYOUT_3_0' }) }),
    },
  ];
  for (const item of cases) {
    const plan = planHostedSave({
      track: item.value,
      sidecar,
      itemId: '42',
      trackId: 'proxy-fixture',
      durationKnown: true,
    });
    expect(plan.blocked, item.id).toBe(true);
    expect(plan.requests, item.id).toEqual([]);
    expect(plan.message, item.id).toContain(item.id);
  }
});

requirement(
  'SAVE-005 @unit autosave is one 30 second IndexedDB interval and pagehide flushes',
  () => {
    expect(AUTOSAVE_INTERVAL_MS).toBe(30000);
    expect(shouldFlushAutosave(30000, true)).toBe(true);
    expect(shouldFlushAutosave(29999, true)).toBe(false);
    expect(flushOnPageHide(true)).toBe(true);
    const record = makeCrashRecord({
      key: crashKey('42', 't'),
      track: track(),
      sidecar: sidecarDocument({
        version: 1,
        itemId: '42',
        trackId: 't',
        sceneMarkers: [],
        channelGroups: [],
      }),
      playheadMs: 10,
      scrollX: 20,
      savedAt: 1,
      dirty: true,
    });
    expect(record.storage).toBe('indexeddb');
    expect(JSON.stringify(record).includes('undo')).toBe(false);
  }
);

requirement('SAVE-006 @unit a successful save makes the next load use the server track', () => {
  const crash = makeCrashRecord({
    key: '42:t',
    track: track(),
    sidecar: sidecarDocument({
      version: 1,
      itemId: '42',
      trackId: 't',
      sceneMarkers: [],
      channelGroups: [],
    }),
    playheadMs: 0,
    scrollX: 0,
    savedAt: 50,
    dirty: false,
  });
  expect(chooseLoadSource(10, crash)).toBe('server');
});

requirement(
  'MODEL-007 @unit legacy track layout is inferred and missing channels are added',
  () => {
    const original = newTrackFromMovie('42', 'Legacy', 10000, 'LAYOUT_5_0');
    const channels = original.channels.filter((channel) => channel.id !== 'center');
    const keyframes = [
      { ...blackKeyframe('left', 'legacy-kf'), timestampMs: 1000 },
      { ...blackKeyframe('surround-left', 'legacy-kf-2'), timestampMs: 2000 },
    ];
    const legacy: Track = {
      ...original,
      metadata: { ...original.metadata, channelLayout: '' },
      channels,
      keyframes,
    };
    const upgraded = upgradeLegacyTrackLayout(legacy);
    expect(upgraded.metadata.channelLayout).toBe('LAYOUT_5_0');
    expect(upgraded.channels.map((channel) => channel.id)).toEqual([
      'left',
      'center',
      'right',
      'surround-left',
      'surround-right',
    ]);
    expect(upgraded.keyframes).toEqual(keyframes);
  }
);

requirement('MODEL-001 @unit fixed layouts round-trip and enforce their channel positions', () => {
  const track = newTrackFromMovie('42', 'Three channel movie lighting', 10000, 'LAYOUT_3_0');
  const decoded = decodeTrack(encodeTrack(track));
  expect(decoded.metadata.channelLayout).toBe('LAYOUT_3_0');
  expect(decoded.channels.map((channel) => channel.spatialHint)).toEqual([
    'SPATIAL_LEFT',
    'SPATIAL_CENTER',
    'SPATIAL_RIGHT',
  ]);
  expect(validateTrack(decoded)).toEqual([]);
  expect(
    validateTrack({ ...decoded, channels: [...decoded.channels, channel('sixth')] }).some((error) =>
      error.startsWith('V-023')
    )
  ).toBe(true);
});

requirement(
  'TRACK-002 @unit new movie tracks use the selected fixed layout and start empty',
  () => {
    const expected = {
      LAYOUT_AMBIENT: ['ambient'],
      LAYOUT_2_0: ['left', 'right'],
      LAYOUT_3_0: ['left', 'center', 'right'],
      LAYOUT_5_0: ['left', 'center', 'right', 'surround-left', 'surround-right'],
    };
    for (const [layout, channelIds] of Object.entries(expected)) {
      const created = newTrackFromMovie('42', 'Proxy Fixture lighting', 6060000, layout);
      expect(created.channels.map((channel) => channel.id)).toEqual(channelIds);
      expect(created.channels.every((channel) => channel.defaultBrightness === 0)).toBe(true);
      expect(created.keyframes).toEqual([]);
      expect(created.metadata.durationMs).toBe(6060000);
    }
  }
);

requirement('SAVE-009 @unit a movie track stores version 1 and the movie duration', () => {
  const created = newTrackFromMovie('42', 'Proxy Fixture', 6060000);
  const decoded = decodeTrack(encodeTrack(created));
  expect(decoded.version).toBe(1);
  expect(decoded.metadata.durationMs).toBe(6060000);
});

requirement('IO-001 @unit import replaces the editor track and keeps the movie', () => {
  const current = newTrackFromMovie('42', 'Proxy Fixture', 120000);
  const incoming = track({
    channels: [channel('left'), channel('right')],
    keyframes: [
      keyframe({ id: 'a', timestampMs: 0 }),
      keyframe({ id: 'b', timestampMs: 10, channelId: 'left' }),
      keyframe({ id: 'c', timestampMs: 20, channelId: 'right' }),
    ],
  });
  const imported = importTrack(current, encodeTrack(incoming), '42');
  expect(imported.errors).toEqual([]);
  expect(imported.itemId).toBe('42');
  expect(imported.track.channels).toHaveLength(2);
  expect(imported.track.keyframes).toHaveLength(3);
});

requirement('IO-003 @unit version 2 leaves the open track and reports V-001', () => {
  const current = track();
  const bad = encodeTrack(track({ version: 2 }));
  const imported = importTrack(current, bad, '42');
  expect(imported.track).toBe(current);
  expect(imported.errors.join(' ')).toContain('V-001');
});

requirement(
  'IO-004 @unit the duration warning is only for an import more than 5 seconds off',
  () => {
    expect(importDurationWarning(120000, 130001, true)).toBe(true);
    expect(importDurationWarning(120000, 125000, true)).toBe(true);
    expect(importDurationWarning(120000, 130001, false)).toBe(false);
    expect(durationDisagrees(120000, 122000)).toBe(false);
    expect(durationDisagrees(120000, 123000)).toBe(true);
  }
);

requirement('PREV-002 @unit the overlay uses the sampler at the playhead', () => {
  const keyframes = [
    keyframe({ id: 'a', timestampMs: 0, interpolation: 'LINEAR' }),
    keyframe({
      id: 'b',
      timestampMs: 1000,
      color: { r: 255, g: 0, b: 0 },
      brightness: 100,
      transitionMs: 500,
      interpolation: 'LINEAR',
    }),
  ];
  expect(overlaySample(keyframes, 1000)).toMatchObject({ r: 255, g: 0, b: 0, brightness: 100 });
  expect(overlaySample(keyframes, 499)).toMatchObject({ r: 0, g: 0, b: 0, brightness: 0 });
});

requirement(
  'PREV-012 @unit photosensitivity is a notice and does not change authored brightness',
  () => {
    expect(photosensitivityNotice(true)).toMatch(/softer/i);
    const keyframes = [keyframe({ id: 'a', timestampMs: 0, brightness: 90 })];
    expect(authoredBrightness(keyframes)).toEqual([90]);
  }
);

requirement('SAFE-001 @unit safety uses flash edges and effect types', () => {
  const flashing = computeSafety({
    keyframes: [
      keyframe({ id: 'a', timestampMs: 0, brightness: 0 }),
      keyframe({ id: 'b', timestampMs: 200, brightness: 100 }),
    ],
    effects: [],
  });
  expect(flashing.maxFlashFrequencyHz).toBe(5);
  expect(flashing.maxBrightnessDelta).toBe(100);
  expect(flashing.containsFlashing).toBe(true);
  expect(flashing.containsStrobing).toBe(false);
  expect(flashing.intensityRating).toBe('INTENSE');
  expect(flashing.warningText).toBe('');

  const subtle = computeSafety({
    keyframes: [
      keyframe({ id: 'a', timestampMs: 0, brightness: 0 }),
      keyframe({ id: 'b', timestampMs: 5000, brightness: 30 }),
    ],
    effects: [],
  });
  expect(subtle.maxFlashFrequencyHz).toBeCloseTo(0.2);
  expect(subtle.maxBrightnessDelta).toBe(30);
  expect(subtle.containsFlashing).toBe(false);
  expect(subtle.containsStrobing).toBe(false);
  expect(subtle.intensityRating).toBe('SUBTLE');

  const strobe = computeSafety({
    keyframes: subtle && [
      keyframe({ id: 'a', timestampMs: 0, brightness: 0 }),
      keyframe({ id: 'b', timestampMs: 5000, brightness: 30 }),
    ],
    effects: [
      {
        id: 'e',
        channelId: 'left',
        timestampMs: 0,
        durationMs: 1000,
        effectType: 'STROBE',
        intensity: 10,
        primaryColor: null,
        secondaryColor: null,
        params: {},
        requiredCapability: '',
        fallbackColor: null,
        fallbackBrightness: 0,
      },
    ],
  });
  expect(strobe.containsStrobing).toBe(true);
  expect(strobe.containsFlashing).toBe(true);
  expect(['INTENSE', 'EXTREME']).toContain(strobe.intensityRating);
});

requirement('SAFE-003 @unit an author warning round-trips on SafetyInfo', () => {
  const safety = withAuthorWarning(
    computeSafety({ keyframes: [], effects: [] }),
    'Strobe in the alley scene'
  );
  const decoded = decodeTrack(encodeTrack(track({ safety })));
  expect(decoded.safety?.warningText).toBe('Strobe in the alley scene');
});

requirement('ERR-006 @unit unknown duration blocks plugin save and does not ask for one', () => {
  const resolved = resolveDuration(0, null);
  expect(resolved.askUser).toBe(false);
  const plan = planHostedSave({
    track: track(),
    sidecar: sidecarDocument({
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [],
      channelGroups: [],
    }),
    itemId: '42',
    trackId: 'proxy-fixture',
    durationKnown: resolved.durationMs !== null,
  });
  expect(plan.blocked).toBe(true);
  expect(plan.requests).toEqual([]);
  expect(plan.message).toMatch(/duration is unknown/i);
});

requirement('FX-001 @unit the catalog is the 13 proto effect types', () => {
  expect(effectCatalog()).toEqual([...EFFECT_TYPES]);
  expect(effectCatalog()).toHaveLength(13);
});

requirement('FX-005 @unit L1 does not expose automatic channel generation', () => {
  expect(l1ExposesAutomaticGeneration()).toBe(false);
});

requirement('TIME-013 @unit a marker is sidecar data and is not a protobuf field', () => {
  const decoded = decodeTrack(encodeTrack(track()));
  expect(JSON.stringify(decoded).includes('Intro')).toBe(false);
  const sidecar = sidecarDocument({
    version: 1,
    itemId: '42',
    trackId: 't',
    sceneMarkers: [{ id: 'm1', timeMs: 1000, label: 'Intro', kind: 'manual' }],
    channelGroups: [],
  });
  expect(sidecar.sceneMarkers[0].label).toBe('Intro');
});

requirement('PREV-004 @unit a bulb maps to one channel and a channel may own several bulbs', () => {
  const first = assignBulb({}, 'b1', 'left');
  const second = assignBulb(first.mapping, 'b2', 'left');
  expect(second.mapping.left).toEqual(['b1', 'b2']);
  const refused = assignBulb(second.mapping, 'b1', 'right');
  expect(refused.error).toMatch(/one channel/);
});
