/** Parse openlightfx-simulator stdout. See docs/requirements T5. */

/**
 * @typedef {{
 *   event?: string,
 *   ts?: string,
 *   bulb_id?: string,
 *   protocol?: string,
 *   params?: Record<string, unknown>,
 *   state_after?: Record<string, unknown>
 * }} NdjsonEvent
 */

/** @param {string} text */
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

/** @param {NdjsonEvent[]} events */
export function colorCommands(events) {
  return events
    .filter((event) => event.event === 'command_received' && (event.params || event.state_after))
    .map((event) => {
      const sent = event.params ?? {};
      const after = event.state_after ?? {};
      const color = event.params ? sent : after;
      return {
        ts: event.ts,
        bulbId: event.bulb_id,
        protocol: event.protocol,
        r: Number(color.r),
        g: Number(color.g),
        b: Number(color.b),
        brightness: Number(color.brightness),
        power: after.power ?? sent.power,
        transitionMs: Number(color.transition_ms ?? color.transitionMs ?? after.transition_ms ?? 0),
      };
    });
}

/**
 * @param {NdjsonEvent[]} events
 * @param {{ bulbId?: string, r?: number, g?: number, b?: number, brightness?: number }} expected
 */
export function findColor(events, expected) {
  return colorCommands(events).find((command) => {
    if (expected.bulbId && command.bulbId !== expected.bulbId) return false;
    if (expected.r !== undefined && command.r !== expected.r) return false;
    if (expected.g !== undefined && command.g !== expected.g) return false;
    if (expected.b !== undefined && command.b !== expected.b) return false;
    if (expected.brightness !== undefined && Number(command.brightness) !== expected.brightness)
      return false;
    return true;
  });
}
