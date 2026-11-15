import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { cleanupScenarioFiles } from '../../scripts/fullstack/scenario-cleanup.mjs';

it('cleans runner input copies idempotently without deleting evidence or caller input', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'olfx-cleanup-'));
  try {
    const work = path.join(directory, 'work');
    fs.mkdirSync(work);
    const staged = ['scenario.json', 'run-scenario.json', 'custom.spec.ts'];
    for (const name of staged) fs.writeFileSync(path.join(work, name), 'input');
    const caller = path.join(directory, 'caller-scenario.json');
    fs.writeFileSync(caller, 'caller owned');
    fs.writeFileSync(path.join(work, 'result.json'), 'evidence');
    cleanupScenarioFiles(work);
    cleanupScenarioFiles(work); // Cleanup is idempotent.
    for (const name of staged) expect(fs.existsSync(path.join(work, name))).toBe(false);
    expect(fs.readFileSync(caller, 'utf8')).toBe('caller owned');
    expect(fs.readFileSync(path.join(work, 'result.json'), 'utf8')).toBe('evidence');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps the concise agent skill aligned with current framework entry points and cleanup policy', () => {
  const skill = fs.readFileSync('.agents/skills/test-openlightfx-local/SKILL.md', 'utf8');
  const runner = fs.readFileSync('scripts/fullstack/lab.mjs', 'utf8');
  expect(skill.split(/\s+/).length).toBeLessThan(220);
  expect(skill).not.toContain('```');
  expect(skill).not.toMatch(/\/tmp\/|#[0-9a-f]{6}\b|\b\d{4,}\b|three-gray/);
  for (const flag of ['OLFX_LAB_SCENARIO', 'OLFX_LAB_TEST_FILE', 'OLFX_LAB_PLAYBACK']) {
    expect(skill).toContain(flag);
    expect(runner).toContain(flag);
  }
  expect(skill).toContain('scripts/fullstack/lab.mjs');
  expect(fs.existsSync('scripts/fullstack/lab.mjs')).toBe(true);
  expect(skill).toContain('remove agent-created temporary inputs/scripts');
  expect(skill).toContain('Never delete user-owned files');
  expect(skill).toContain('resupply inputs');
  expect(runner).toContain("if (action === 'run' || action === 'stop') cleanupScenarioFiles(work)");
  const collection = runner.slice(
    runner.indexOf('function collect()'),
    runner.indexOf('function composeCapture')
  );
  for (const name of ['scenario.json', 'run-scenario.json', 'custom.spec.ts'])
    expect(collection).not.toContain(name);
});
