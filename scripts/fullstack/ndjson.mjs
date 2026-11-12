/** Parse openlightfx-simulator stdout. See docs/requirements T5. */

export function parseNdjson(text) {
  return text
    .split('\n')
    .map((line) => {
      const start = line.indexOf('{');
      return start >= 0 ? line.slice(start).trim() : '';
    })
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function colorCommands(events) {
  return events
    .filter((event) => event.event === 'command_received' && event.state_after)
    .map((event) => ({
      ts: event.ts,
      bulbId: event.bulb_id,
      protocol: event.protocol,
      r: event.state_after.r,
      g: event.state_after.g,
      b: event.state_after.b,
      brightness: event.state_after.brightness,
      power: event.state_after.power,
      transitionMs: event.state_after.transition_ms,
    }));
}

export function findColor(events, expected) {
  return colorCommands(events).find((command) => {
    if (expected.bulbId && command.bulbId !== expected.bulbId) return false;
    if (expected.r !== undefined && command.r !== expected.r) return false;
    if (expected.g !== undefined && command.g !== expected.g) return false;
    if (expected.b !== undefined && command.b !== expected.b) return false;
    if (expected.brightness !== undefined && Number(command.brightness) !== expected.brightness) return false;
    return true;
  });
}
