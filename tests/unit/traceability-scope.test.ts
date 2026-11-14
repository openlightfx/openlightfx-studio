import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const gate = (...args: string[]) =>
  spawnSync(process.execPath, ['docs/requirements/check-traceability.mjs', ...args], {
    encoding: 'utf8',
  });
describe('requirement-scoped traceability', () => {
  it('checks selected approved requirements without altering the global gate', () => {
    const result = gate('--requirements', 'ROOM-001,ROOM-003,ROOM-004');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('selected approved L1 gated (ROOM-001,ROOM-003,ROOM-004)');
  });
  it('rejects empty and unknown selections', () => {
    expect(gate('--requirements').status).toBe(1);
    expect(gate('--requirements', 'ROOM-999').status).toBe(1);
  });
  it('requires passing outcomes in the report, not merely existing test titles', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olfx-traceability-'));
    const report = path.join(dir, 'report.json');
    try {
      fs.writeFileSync(
        report,
        JSON.stringify({ tests: [{ name: 'ROOM-004 @fullstack Identify', status: 'failed' }] })
      );
      expect(gate('--requirements', 'ROOM-004', '--report', report).status).toBe(1);
      fs.writeFileSync(
        report,
        JSON.stringify({ tests: [{ name: 'ROOM-004 @fullstack Identify', status: 'passed' }] })
      );
      expect(gate('--requirements', 'ROOM-004', '--report', report).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
