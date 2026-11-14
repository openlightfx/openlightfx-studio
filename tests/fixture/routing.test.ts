import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
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
  expect(
    fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/routing/SOURCE'), 'utf8')
  ).toContain('J1 MODEL-003/004/005/006/007');
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
