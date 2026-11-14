import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
import { loadScenario } from './scenario.mjs';

const [file, compose, project] = process.argv.slice(2);
if (!file || !compose || !project)
  throw new Error('Scenario, Compose file and isolated project required');
const addresses = {};
for (const [index, bulb] of loadScenario(file).room.bulbs.entries()) {
  if (bulb.protocol === 'rest') continue;
  const container = execFileSync(
    'docker',
    ['compose', '-f', compose, '-p', project, 'ps', '-q', `udp-${index}`],
    { encoding: 'utf8' }
  ).trim();
  if (!container) throw new Error(`Missing UDP endpoint for ${bulb.id}`);
  const networks = JSON.parse(
    execFileSync(
      'docker',
      ['inspect', '--format', '{{json .NetworkSettings.Networks}}', container],
      { encoding: 'utf8' }
    )
  );
  const ip = networks[`${project}_bulbs`]?.IPAddress;
  if (isIP(ip ?? '') !== 4) throw new Error(`Missing isolated IPv4 endpoint for ${bulb.id}`);
  addresses[bulb.id] = ip;
}
console.log(JSON.stringify(addresses));
