import path from 'node:path';

/** Docker-only standard-port endpoints: each bulb has its own IP, no published UDP.
 * @param {import('./scenario.mjs').Scenario} scenario @param {string} root
 */
export function udpServices(scenario, root) {
  const ports = { wiz: 38899, lifx: 56700, govee: 4003 };
  return Object.fromEntries(
    scenario.room.bulbs.flatMap((bulb, index) => {
      if (bulb.protocol === 'rest') return [];
      const port = ports[/** @type {keyof typeof ports} */ (bulb.protocol)];
      if (!port) throw new Error('Unsupported UDP protocol');
      return [
        [
          `udp-${index}`,
          {
            image: 'python:3.12-slim',
            entrypoint: ['python', '-u', '/udp-endpoint.py'],
            command: [String(port), 'simulator', String(bulb.port)],
            volumes: [
              `${path.join(root, 'scripts/fullstack/udp-endpoint.py')}:/udp-endpoint.py:ro`,
            ],
            networks: ['bulbs'],
            depends_on: ['simulator'],
            healthcheck: {
              test: ['CMD', 'test', '-f', '/tmp/ready'],
              interval: '1s',
              timeout: '1s',
              retries: 30,
            },
          },
        ],
      ];
    })
  );
}
