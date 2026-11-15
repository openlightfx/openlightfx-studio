import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { decodeTrack, encodeTrack, newTrackFromMovie, validateTrack } from '../../src/lib/domain';
import { requirement } from '../harness/requirement';

const fixturePath = path.join(process.cwd(), 'tests/fixtures/routing/cases.json');

type RoutingCase = {
  name: string;
  channels: { id: string; spatialHint: string }[];
  bulbs: { id: string; position: string; follows?: string }[];
  channelBulbs: Record<string, string[]>;
  bulbSources: Record<string, string[]>;
};

function cases(): RoutingCase[] {
  return (JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as { cases: RoutingCase[] }).cases;
}

requirement('MODEL-001 @fixture every fixed layout matches its channel and hint fixture', () => {
  const layoutPath = path.join(process.cwd(), 'tests/fixtures/domain/layouts.json');
  const fixture = JSON.parse(fs.readFileSync(layoutPath, 'utf8')) as {
    version: number;
    layouts: {
      layout: 'LAYOUT_AMBIENT' | 'LAYOUT_2_0' | 'LAYOUT_3_0' | 'LAYOUT_5_0';
      channels: { id: string; spatialHint: string }[];
    }[];
  };
  expect(fixture.version).toBe(1);
  expect(fixture.layouts).toHaveLength(4);
  for (const entry of fixture.layouts) {
    const created = newTrackFromMovie('movie', 'Layout fixture', 10000, entry.layout);
    const decoded = decodeTrack(encodeTrack(created));
    expect(decoded.metadata.channelLayout).toBe(entry.layout);
    expect(decoded.channels.map(({ id, spatialHint }) => ({ id, spatialHint }))).toEqual(
      entry.channels
    );
    expect(validateTrack(decoded)).toEqual([]);
  }
});

requirement(
  'MODEL-003 @fixture shared route examples cover every track channel and room bulb',
  () => {
    for (const example of cases()) {
      expect(Object.keys(example.channelBulbs), example.name).toEqual(
        example.channels.map((channel) => channel.id)
      );
      expect(Object.keys(example.bulbSources), example.name).toEqual(
        example.bulbs.map((bulb) => bulb.id)
      );
      for (const channel of example.channels) {
        expect(example.channelBulbs[channel.id], `${example.name}: ${channel.id}`).not.toHaveLength(
          0
        );
        for (const bulbId of example.channelBulbs[channel.id])
          expect(example.bulbSources[bulbId], `${example.name}: ${bulbId}`).toContain(channel.id);
      }
      for (const bulb of example.bulbs)
        expect(example.bulbSources[bulb.id], `${example.name}: ${bulb.id}`).not.toHaveLength(0);
    }
  }
);

requirement('MODEL-004 @fixture routing cases are shared fixture data, not a Studio router', () => {
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    version: number;
    cases: RoutingCase[];
  };
  expect(parsed.version).toBe(1);
  expect(parsed.cases.map((example) => example.name)).toEqual([
    'Ambient lights every bulb',
    '2.0 fills center and surrounds in a 5.0 room',
    '3.0 center folds to left and right',
    '5.0 surround channels fold into front when missing',
    '5.0 track fills only-Ambient room',
    'Follows override changes a bulb to Ambient routing',
  ]);
});

requirement('MODEL-005 @fixture mixer examples include weighted RGB and off states', () => {
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    mixing: {
      name: string;
      sources: unknown[];
      expected: { r: number; g: number; b: number; brightness: number };
    }[];
  };
  expect(parsed.mixing).toHaveLength(2);
  expect(parsed.mixing[0].expected).toEqual({ r: 170, g: 0, b: 85, brightness: 100 });
  expect(parsed.mixing[1].expected).toEqual({ r: 0, g: 0, b: 0, brightness: 0 });
});
