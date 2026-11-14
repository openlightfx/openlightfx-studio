import fs from 'node:fs';

/** @typedef {{id: string, name: string, position: string, follows?: string}} RoomBulb */
/** @typedef {{color: string, brightness: number, power: boolean}} State */
/** @typedef {{channel: string, timeMs: number, color: string, brightness: number, interpolation?: string, transitionMs?: number}} Cue */
/** @typedef {{bulbId: string, color: string, brightness: number, power: boolean, minElapsedMs?: number, maxElapsedMs?: number}} Command */
/** @typedef {{name: string, withinMs: number, holdMs?: number, minElapsedMs?: number, maxElapsedMs?: number, bulbs: Record<string, State>, commands?: Command[]}} Phase */
/** @typedef {{name: string, movie: string, room: {name: string, bulbs: RoomBulb[]}, track: {layout: string, title: string, keyframes: Cue[]}, expectations: Phase[]}} ScenarioInput */
/** @typedef {ReturnType<typeof normalizeScenario>} Scenario */
/** @type {Record<string, string[]>} */
export const layouts = {
  Ambient: ['ambient'],
  '2.0': ['left', 'right'],
  '3.0': ['left', 'center', 'right'],
  '5.0': ['left', 'center', 'right', 'surround-left', 'surround-right'],
};
const positions = ['left', 'center', 'right', 'surround-left', 'surround-right', 'ambient'];
/** @type {('minElapsedMs' | 'maxElapsedMs')[]} */
const elapsedKeys = ['minElapsedMs', 'maxElapsedMs'];
/** @param {string} message @returns {never} */
function fail(message) {
  throw new Error(`Invalid lab scenario: ${message}`);
}
/** @param {unknown} value @param {string[]} keys @param {string} label */
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) fail(`${label}: unknown field ${key}`);
}
/** @param {unknown} value @param {string} label @param {number} [max] */
function text(value, label, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(`${label} must be nonempty text (max ${max})`);
}
/** @param {unknown} value @param {string} label @param {number} max @param {number} [min] */
function number(value, label, max, min = 0) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    fail(`${label} must be an integer ${min}–${max}`);
}
/** @param {unknown} value */
function color(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail('color must be #RRGGBB');
  return value.toLowerCase();
}
/** @param {State} value */
function state(value) {
  object(value, ['color', 'brightness', 'power'], 'bulb state');
  number(value.brightness, 'brightness', 100);
  if (typeof value.power !== 'boolean') fail('power must be boolean');
  const hex = color(value.color);
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const scale = value.power ? value.brightness / 100 : 0;
  return {
    r,
    g,
    b,
    brightness: value.brightness,
    power: value.power,
    display_color: { r: Math.round(r * scale), g: Math.round(g * scale), b: Math.round(b * scale) },
  };
}
/** Strict, independent test expectations: never calls production routing/sampling.
 * @param {ScenarioInput} input
 */
export function normalizeScenario(input) {
  object(input, ['name', 'movie', 'room', 'track', 'expectations'], 'scenario');
  text(input.name, 'name', 80);
  text(input.movie, 'movie');
  object(input.room, ['name', 'bulbs'], 'room');
  text(input.room.name, 'room name', 40);
  if (
    !Array.isArray(input.room.bulbs) ||
    input.room.bulbs.length < 1 ||
    input.room.bulbs.length > 32
  )
    fail('room needs 1–32 bulbs');
  const ids = new Set(),
    names = new Set();
  const bulbs = input.room.bulbs.map((bulb, index) => {
    object(bulb, ['id', 'name', 'position', 'follows'], 'room bulb');
    if (typeof bulb.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(bulb.id) || ids.has(bulb.id))
      fail('bulb IDs must be unique simple lowercase IDs');
    text(bulb.name, 'bulb name', 40);
    if (names.has(bulb.name)) fail('bulb names must be unique');
    ids.add(bulb.id);
    names.add(bulb.name);
    if (
      !positions.includes(bulb.position) ||
      (bulb.follows !== undefined && !positions.includes(bulb.follows))
    )
      fail('invalid room position/Follows');
    return { ...bulb, port: 9200 + index + (index >= 2 ? 1 : 0) };
  });
  object(input.track, ['layout', 'title', 'keyframes'], 'track');
  if (!Object.hasOwn(layouts, input.track.layout)) fail('unsupported track layout');
  text(input.track.title, 'track title');
  const minSpacingMs = 200; // Current Studio UI enforces this spacing.
  if (!Array.isArray(input.track.keyframes) || input.track.keyframes.length < 1)
    fail('track needs keyframes');
  /** @type {Map<string, number[]>} */
  const keys = new Map();
  const keyframes = input.track.keyframes.map((frame) => {
    object(
      frame,
      ['channel', 'timeMs', 'color', 'brightness', 'interpolation', 'transitionMs'],
      'keyframe'
    );
    if (!layouts[input.track.layout].includes(frame.channel))
      fail('keyframe channel is not in layout');
    number(frame.timeMs, 'timeMs', 24 * 3600000);
    number(frame.brightness, 'brightness', 100);
    const interpolation = frame.interpolation ?? 'STEP';
    if (!['STEP', 'LINEAR'].includes(interpolation)) fail('interpolation must be STEP or LINEAR');
    const transitionMs = frame.transitionMs ?? 0;
    number(transitionMs, 'transitionMs', 24 * 3600000);
    const previous = keys.get(frame.channel) ?? [];
    if (
      previous.some((time) => time === frame.timeMs || Math.abs(time - frame.timeMs) < minSpacingMs)
    )
      fail('duplicate/too-close keyframes');
    previous.push(frame.timeMs);
    keys.set(frame.channel, previous);
    return { ...frame, color: color(frame.color), interpolation, transitionMs };
  });
  if (!Array.isArray(input.expectations) || input.expectations.length < 1)
    fail('explicit expectations are required');
  const expectations = input.expectations.map((phase) => {
    object(
      phase,
      ['name', 'withinMs', 'holdMs', 'minElapsedMs', 'maxElapsedMs', 'bulbs', 'commands'],
      'expectation'
    );
    text(phase.name, 'expectation name');
    number(phase.withinMs, 'withinMs', 90000, 1);
    const holdMs = phase.holdMs ?? 0;
    number(holdMs, 'holdMs', 60000);
    for (const key of elapsedKeys)
      if (phase[key] !== undefined) number(phase[key], key, 24 * 3600000);
    if (
      phase.minElapsedMs !== undefined &&
      phase.maxElapsedMs !== undefined &&
      phase.minElapsedMs > phase.maxElapsedMs
    )
      fail('invalid elapsed window');
    if (!phase.bulbs || Object.keys(phase.bulbs).sort().join(',') !== [...ids].sort().join(','))
      fail('each expectation must specify every bulb, including unchanged bulbs');
    const expected = Object.fromEntries(
      Object.entries(phase.bulbs).map(([id, value]) => [id, state(value)])
    );
    const commands = (phase.commands ?? []).map((command) => {
      object(
        command,
        ['bulbId', 'color', 'brightness', 'power', 'minElapsedMs', 'maxElapsedMs'],
        'command'
      );
      if (!ids.has(command.bulbId)) fail('command refers to unknown bulb');
      state({ color: command.color, brightness: command.brightness, power: command.power });
      for (const key of elapsedKeys)
        if (command[key] !== undefined) number(command[key], key, 24 * 3600000);
      if (
        command.minElapsedMs !== undefined &&
        command.maxElapsedMs !== undefined &&
        command.minElapsedMs > command.maxElapsedMs
      )
        fail('invalid command window');
      return { ...command, color: color(command.color) };
    });
    return { ...phase, holdMs, bulbs: expected, commands };
  });
  return {
    ...input,
    room: { ...input.room, bulbs },
    track: { ...input.track, minSpacingMs, keyframes },
    expectations,
  };
}
/** @param {Scenario} a @param {Scenario} b */
export function sameInventory(a, b) {
  /** @param {Scenario} scenario */
  const inventory = (scenario) =>
    scenario.room.bulbs.map(({ id, name, port }) => ({ id, name, port }));
  return JSON.stringify(inventory(a)) === JSON.stringify(inventory(b));
}
/** @param {string} file */
export function loadScenario(file) {
  return normalizeScenario(JSON.parse(fs.readFileSync(file, 'utf8')));
}
/** @param {Scenario} scenario */
export function simulatorConfig(scenario) {
  return (
    '[simulator]\nlog_level = "info"\nhue_bridge_port = 8080\ncontrol_host = "0.0.0.0"\ncontrol_port = 9202\n' +
    scenario.room.bulbs
      .map(
        (bulb) => `
[[bulbs]]
id = ${JSON.stringify(bulb.id)}
name = ${JSON.stringify(bulb.name)}
protocol = "rest"
port = ${bulb.port}
method = "GET"
path = "/api/light"
min_transition_ms = 0
[bulbs.param_map]
r = "r"
g = "g"
b = "b"
brightness = "brightness"
transition_ms = "transition_ms"
power = "power"
`
      )
      .join('')
  );
}
