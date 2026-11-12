import fs from 'node:fs';
import path from 'node:path';
import { encodeTrack, renderEffect } from '../../src/lib/domain/index';
import { effectCases } from '../../tests/fixtures/sampling/effect-cases';
import { roundTripTrack } from '../../tests/fixtures/sampling/roundtrip-track';

const dir = path.join(process.cwd(), 'tests/fixtures/sampling');
fs.writeFileSync(path.join(dir, 'roundtrip.lightfx'), encodeTrack(roundTripTrack()));
const cases = effectCases().map((item) => ({
  name: item.name,
  input: item.input,
  commands: renderEffect(item.input).map(({ offsetMs, r, g, b, brightness }) => ({
    offsetMs,
    r,
    g,
    b,
    brightness,
  })),
}));
fs.writeFileSync(
  path.join(dir, 'effects.json'),
  JSON.stringify(
    {
      source: 'TypeScript transcription of openlightfx-emby effect renderers at cursor/studio-host-api-18c1. Regenerate with npx vite-node scripts/fixtures/generate.ts and confirm with the plugin dotnet test.',
      cases,
    },
    null,
    2
  ) + '\n'
);
console.log(`wrote ${cases.length} effect cases and roundtrip.lightfx`);
