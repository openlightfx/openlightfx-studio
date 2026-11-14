import fs from 'node:fs';
import path from 'node:path';

/** Delete only runner-owned input copies; preserve caller files and result evidence.
 * @param {string} work
 */
export function cleanupScenarioFiles(work) {
  for (const name of ['scenario.json', 'run-scenario.json', 'custom.spec.ts']) {
    fs.rmSync(path.join(work, name), { force: true });
  }
}
