#!/usr/bin/env node
/** Roll up requirement outcomes and write the traceability report. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'test-results');
fs.mkdirSync(dir, { recursive: true });

const files = fs.readdirSync(dir).filter((name) => name.startsWith('outcomes') && name.endsWith('.jsonl'));
const outcomes = [];
for (const name of files) {
  for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    outcomes.push(JSON.parse(line));
  }
}

const allow = new Set(
  JSON.parse(fs.readFileSync(path.join(root, 'tests/expected-failures.json'), 'utf8')).failures ?? []
);

const groups = new Map();
for (const outcome of outcomes) {
  const key = `${outcome.id}@${outcome.tier}`;
  const group = groups.get(key) ?? { id: outcome.id, tier: outcome.tier, passed: 0, failed: 0, titles: [] };
  group.titles.push(outcome.title);
  if (outcome.status === 'passed') group.passed += 1;
  else group.failed += 1;
  groups.set(key, group);
}

const rows = [...groups.values()].map((group) => {
  const key = `${group.id}@${group.tier}`;
  let status = 'passed';
  if (group.failed > 0 && allow.has(key)) status = 'expected-fail';
  else if (group.failed > 0) status = 'failed';
  return { ...group, status };
});
rows.sort((a, b) => a.id.localeCompare(b.id) || a.tier.localeCompare(b.tier));

const summary = {
  passed: rows.filter((row) => row.status === 'passed').length,
  expectedFail: rows.filter((row) => row.status === 'expected-fail').length,
  failed: rows.filter((row) => row.status === 'failed').length,
  rows,
};
fs.writeFileSync(path.join(dir, 'requirements-report.json'), JSON.stringify(summary, null, 2));

const lines = [
  '# Requirement results',
  '',
  `| Status | Count |`,
  `| --- | ---: |`,
  `| passed | ${summary.passed} |`,
  `| expected-fail | ${summary.expectedFail} |`,
  `| failed | ${summary.failed} |`,
  '',
  '| Requirement | Tier | Status | Passed | Failed |',
  '| --- | --- | --- | ---: | ---: |',
];
for (const row of rows) {
  lines.push(`| ${row.id} | ${row.tier} | ${row.status} | ${row.passed} | ${row.failed} |`);
}
fs.writeFileSync(path.join(dir, 'requirements-report.md'), lines.join('\n') + '\n');

fs.writeFileSync(
  path.join(dir, 'traceability.json'),
  JSON.stringify({ tests: outcomes.map((outcome) => ({ name: outcome.title, status: outcome.status })) }, null, 2)
);

console.log(`requirements: ${summary.passed} passed, ${summary.expectedFail} expected-fail, ${summary.failed} failed`);
if (summary.failed > 0) process.exit(1);
