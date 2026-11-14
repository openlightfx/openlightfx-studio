/** Independent wire-intent matcher; never derives expected values from plugin drivers.
 * @typedef {{ts: string, bulb_id: string, protocol: string, command: string, params: Record<string, any>}} Event
 * @param {Event[]} events
 * @param {import('./scenario.mjs').Command} expected
 * @param {{since: number, playbackSince: number, through: number, protocol: string}} window
 */
export function findCommandReceipt(events, expected, window) {
  const all = events
    .filter(
      (e) =>
        e.bulb_id === expected.bulbId &&
        e.protocol === window.protocol &&
        Date.parse(e.ts) >= window.playbackSince &&
        Date.parse(e.ts) <= window.through
    )
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const rgb = [1, 3, 5].map((i) => parseInt(expected.color.slice(i, i + 2), 16));
  /** @param {unknown} a @param {number} b @param {number} [tolerance] */
  const close = (a, b, tolerance = 1.1) =>
    Number.isFinite(Number(a)) && Math.abs(Number(a) - b) <= tolerance;
  /** @param {Record<string, any>} p */
  const color = (p) => ['r', 'g', 'b'].every((k, i) => close(p[k], rgb[i], 0));
  /** @param {string} command */
  const latest = (command) => all.filter((e) => e.command === command).at(-1);
  for (const event of all.filter((e) => Date.parse(e.ts) >= window.since)) {
    const p = event.params;
    let proof = [event];
    let matches = false;
    if (window.protocol === 'rest')
      matches =
        color(p) &&
        close(p.brightness, expected.brightness, 0) &&
        String(p.power) === String(expected.power);
    else if (window.protocol === 'wiz')
      matches =
        event.command === 'setPilot' &&
        color(p) &&
        p.dimming != null &&
        close(((Number(p.dimming) - 10) * 100) / 90, expected.brightness) &&
        p.state === expected.power;
    else if (window.protocol === 'lifx' && event.command === 'SetColor') {
      const power = latest('SetPower');
      const actual = hsbkRgb(Number(p.hue), Number(p.saturation), Number(p.brightness));
      matches =
        actual.every((v, i) => close(v, (rgb[i] * expected.brightness) / 100)) &&
        !!power &&
        Number(power.params.level) >= 32768 === expected.power;
      if (power) proof.push(power);
    } else if (window.protocol === 'govee' && event.command === 'colorwc') {
      const brightness = latest('brightness'),
        power = latest('turn');
      matches =
        color(p) &&
        !!brightness &&
        close(brightness.params.value, expected.brightness, 0) &&
        !!power &&
        ['1', 'on', 'true'].includes(String(power.params.value)) === expected.power;
      if (brightness) proof.push(brightness);
      if (power) proof.push(power);
    }
    if (matches) {
      const receipt = proof.reduce((a, b) => (Date.parse(a.ts) > Date.parse(b.ts) ? a : b));
      return { ...receipt, evidence: proof };
    }
  }
  return undefined;
}

/** Standard HSBK to emitted RGB, independently of the production converter.
 * @param {number} hue @param {number} saturation @param {number} brightness
 */
function hsbkRgb(hue, saturation, brightness) {
  const h = (hue / 65535) * 6,
    s = saturation / 65535,
    v = (brightness / 65535) * 255;
  const i = Math.floor(h),
    f = h - i,
    p = v * (1 - s),
    q = v * (1 - s * f),
    t = v * (1 - s * (1 - f));
  return [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
}
