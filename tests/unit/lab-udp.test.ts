import { expect, it } from 'vitest';
import {
  normalizeScenario,
  sameInventory,
  simulatorConfig,
} from '../../scripts/fullstack/scenario.mjs';
import { udpServices } from '../../scripts/fullstack/udp-services.mjs';
import { findCommandReceipt } from '../../scripts/fullstack/command-receipts.mjs';

const input = () => ({
  name: 'Protocol test',
  movie: 'clip-a',
  room: {
    name: 'Room',
    bulbs: [
      { id: 'left', name: 'Left', position: 'left', protocol: 'wiz' },
      { id: 'right', name: 'Right', position: 'right', protocol: 'rest' },
    ],
  },
  track: {
    title: 'Protocol track',
    layout: '2.0',
    keyframes: [{ channel: 'left', timeMs: 2000, color: '#ff0000', brightness: 80 }],
  },
  expectations: [
    {
      name: 'Red',
      withinMs: 3000,
      bulbs: {
        left: { color: '#ff0000', brightness: 80, power: true },
        right: { color: '#000000', brightness: 0, power: false },
      },
    },
  ],
});

it('provisions isolated standard-port UDP endpoints, preserving REST defaults and scoped simulator listeners', () => {
  for (const [protocol, port] of [
    ['wiz', 38899],
    ['lifx', 56700],
    ['govee', 4003],
  ] as const) {
    const raw = input();
    raw.room.bulbs[0].protocol = protocol;
    const scenario = normalizeScenario(raw),
      services = udpServices(scenario, '/repository');
    expect(Object.keys(services)).toEqual(['udp-0']);
    expect(services['udp-0'].command).toEqual([String(port), 'simulator', '9200']);
    expect(services['udp-0'].networks).toEqual(['bulbs']);
    expect(services['udp-0']).not.toHaveProperty('ports');
    expect(services['udp-0']).not.toHaveProperty('network_mode');
    const config = simulatorConfig(scenario);
    expect(config).toContain(`protocol = "${protocol}"`);
    expect(config).toContain('ip = "0.0.0.0"');
    expect(config).toContain('protocol = "rest"');
    const changed = input();
    changed.room.bulbs[0].protocol = 'rest';
    expect(sameInventory(scenario, normalizeScenario(changed))).toBe(false);
  }
});
it('rejects unknown protocols and caller-chosen addresses/ports', () => {
  for (const change of [
    { protocol: 'hue' },
    { protocol: 'udp' },
    { ip: '192.168.1.1' },
    { port: 38899 },
  ]) {
    const raw = input();
    Object.assign(raw.room.bulbs[0], change);
    expect(() => normalizeScenario(raw)).toThrow();
  }
});

const expected = { bulbId: 'left', color: '#ff0000', brightness: 50, power: true };
const event = (
  protocol: string,
  command: string,
  params: Record<string, unknown>,
  time = 2000
) => ({ protocol, command, params, bulb_id: 'left', ts: new Date(time).toISOString() });
const window = (protocol: string) => ({
  protocol,
  since: 1900,
  playbackSince: 1000,
  through: 2500,
});
it('requires fresh WiZ RGB, correctly mapped brightness and power', () => {
  const events = [event('wiz', 'setPilot', { r: 255, g: 0, b: 0, dimming: 55, state: true })];
  expect(findCommandReceipt(events, expected, window('wiz'))).toBeTruthy();
  expect(
    findCommandReceipt(
      [event('wiz', 'setPilot', { r: 254, g: 0, b: 0, dimming: 55, state: true })],
      expected,
      window('wiz')
    )
  ).toBeUndefined();
  expect(
    findCommandReceipt(events, { ...expected, brightness: 80 }, window('wiz'))
  ).toBeUndefined();
  expect(findCommandReceipt(events, { ...expected, power: false }, window('wiz'))).toBeUndefined();
  expect(findCommandReceipt(events, expected, { ...window('wiz'), since: 2100 })).toBeUndefined();
});
it('checks LIFX HSBK intensity once and requires current-playback power evidence', () => {
  const color = event('lifx', 'SetColor', { hue: 0, saturation: 65535, brightness: 32768 });
  const power = event('lifx', 'SetPower', { level: 65535 }, 1100);
  expect(findCommandReceipt([power, color], expected, window('lifx'))?.evidence).toHaveLength(2);
  expect(findCommandReceipt([color], expected, window('lifx'))).toBeUndefined();
  expect(
    findCommandReceipt(
      [{ ...power, ts: new Date(900).toISOString() }, color],
      expected,
      window('lifx')
    )
  ).toBeUndefined();
  expect(
    findCommandReceipt([power, color], { ...expected, brightness: 100 }, window('lifx'))
  ).toBeUndefined();
});
it('requires Govee color plus brightness/power receipts, rejecting wrong or stale state', () => {
  const color = event('govee', 'colorwc', { r: 255, g: 0, b: 0 });
  const brightness = event('govee', 'brightness', { value: 50 }, 2010),
    power = event('govee', 'turn', { value: '1' }, 1100);
  expect(findCommandReceipt([power, color, brightness], expected, window('govee'))?.command).toBe(
    'brightness'
  );
  expect(findCommandReceipt([power, color], expected, window('govee'))).toBeUndefined();
  expect(
    findCommandReceipt(
      [power, color, brightness, event('govee', 'brightness', { value: 80 }, 2200)],
      expected,
      window('govee')
    )
  ).toBeUndefined();
  expect(
    findCommandReceipt(
      [power, { ...color, bulb_id: 'right' }, brightness],
      expected,
      window('govee')
    )
  ).toBeUndefined();
  expect(
    findCommandReceipt([power, color, brightness], expected, {
      ...window('govee'),
      playbackSince: 1500,
    })
  ).toBeUndefined();
});
