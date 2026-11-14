/**
 * State oracle: consumes rendered simulator samples, never outgoing commands or RoomRouter.
 * @typedef {Record<string, any>} BulbState
 * @typedef {{event_id: number, ts?: string, bulbs: Record<string, BulbState>}} Sample
 * @typedef {{after: number, bulbs: Record<string, BulbState>, tolerance?: number}} Expected
 */
/** @param {BulbState | undefined} actual @param {BulbState} expected */
export function matchesState(actual, expected, tolerance = 2) {
  if (!actual) return false;
  for (const key of ['r', 'g', 'b', 'brightness']) {
    if (
      expected[key] !== undefined &&
      (!Number.isFinite(actual[key]) || Math.abs(actual[key] - expected[key]) > tolerance)
    )
      return false;
  }
  if (expected.power !== undefined && actual.power !== expected.power) return false;
  if (expected.display_color) {
    for (const key of ['r', 'g', 'b'])
      if (
        !Number.isFinite(actual.display_color?.[key]) ||
        Math.abs(actual.display_color[key] - expected.display_color[key]) > tolerance
      )
        return false;
  }
  return true;
}

/** @param {Sample[]} samples @param {Expected} expected */
export function assertObservation(samples, { after, bulbs, tolerance = 2 }) {
  const window = samples.filter((sample) => sample.event_id > after);
  const match = window.find((sample) =>
    Object.entries(bulbs).every(([id, state]) => matchesState(sample.bulbs[id], state, tolerance))
  );
  if (!match)
    throw new Error(
      `Expected simultaneous bulb states after cursor ${after}: ${JSON.stringify(bulbs)}; last observed: ${JSON.stringify(window.at(-1))}`
    );
  return match;
}

/** @param {string} base @param {Expected} expected */
export async function waitForObservation(base, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/events?after=${expected.after}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok)
      throw new Error(`Observation API ${response.status}: ${await response.text()}`);
    try {
      return assertObservation(await response.json(), expected);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError ?? new Error('No simulator state samples');
}
