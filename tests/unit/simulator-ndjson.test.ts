import { expect, it } from 'vitest';
import { colorCommands, findColor, parseNdjson } from '../../scripts/fullstack/ndjson.mjs';

const sample = [
  '{"ts":"2026-11-12T00:00:00.000Z","event":"simulator_started","version":"0.1.0","config_file":"simulator.toml","bulbs":[{"id":"left","name":"Left","protocol":"rest","ip":""}]}',
  '{"ts":"2026-11-12T00:00:01.000Z","event":"command_received","bulb_id":"left","bulb_name":"Left","protocol":"rest","ip":"","command":"GET /api/light","params":{"r":255,"g":0,"b":0,"brightness":"100"},"state_after":{"r":1,"g":2,"b":3,"brightness":4,"power":true,"transition_ms":0}}',
].join('\n');

it('reads simulator command_received NDJSON by bulb_id and the sent color', () => {
  const events = parseNdjson(sample);
  expect(events).toHaveLength(2);
  expect(findColor(events, { bulbId: 'left', r: 255, g: 0, b: 0, brightness: 100 })?.power).toBe(
    true
  );
  expect(colorCommands(events)[0].transitionMs).toBe(0);
});
