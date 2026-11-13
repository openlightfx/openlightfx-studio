#!/usr/bin/env node
/**
 * Requirement traceability gate for docs/requirements/studio-requirements.md.
 *
 * Default (no --report):
 *   - Every requirement block is well-formed.
 *   - The counts table matches the requirements.
 *   - Every approved L1 requirement has a non-skipped test title containing its ID
 *     and, for each CI tier listed on the requirement, the tag @<tier>.
 *
 * With --report <unified.json>:
 *   - The same ID/tier match must be a test whose status is "passed",
 *     unless --allow-expected lists "ID@tier", in which case "failed" counts
 *     and "passed" fails the gate (remove the id from the list).
 *   - Skipped tests do not satisfy the gate.
 *
 * Proposed and deferred requirements never fail the gate.
 * The realmedia tier is on-demand and never fails CI.
 *
 * Unified report shape:
 *   { "tests": [ { "name": "MEDIA-003 @browser ...", "status": "passed" } ] }
 *
 * Exit 0 when the spec is consistent and every approved L1 requirement is covered.
 * Exit 1 with one line per problem.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SPEC = path.join(ROOT, 'docs/requirements/studio-requirements.md');
const CI_TIERS = ['unit', 'fixture', 'browser', 'fullstack'];
const ALL_TIERS = new Set([...CI_TIERS, 'realmedia']);
const LAYERS = new Set(['L1', 'L2', 'L3']);
const STATUSES = new Set(['proposed', 'approved', 'deferred']);
const AREAS = [
  ['App shell and navigation', 'SHELL'],
  ['Media loading and playback', 'MEDIA'],
  ['Timeline view', 'TIME'],
  ['Keyframe editing', 'KEY'],
  ['Effects', 'FX'],
  ['Channels and groups', 'CHAN'],
  ['Properties', 'PROP'],
  ['Undo and redo', 'UNDO'],
  ['Shortcuts', 'KEYB'],
  ['Save, load, and autosave', 'SAVE'],
  ['Import and export', 'IO'],
  ['Live preview', 'PREV'],
  ['Safety', 'SAFE'],
  ['Performance', 'PERF'],
  ['Accessibility and input', 'A11Y'],
  ['Error handling', 'ERR'],
  ['Plugin contract', 'PLUG'],
];

const problems = [];
function fail(message) {
  problems.push(message);
}

function parseArgs(argv) {
  const args = { report: null, printCounts: false, allowExpected: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report') args.report = argv[++i];
    else if (argv[i] === '--print-counts') args.printCounts = true;
    else if (argv[i] === '--allow-expected') args.allowExpected = argv[++i];
    else fail(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function parseRequirements(markdown) {
  const lines = markdown.split('\n');
  const reqs = [];
  let area = null;
  let current = null;

  const flush = () => {
    if (current) reqs.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const areaMatch = /^### ([A-Z].+)$/.exec(line);
    const reqMatch = /^#### ([A-Z][A-Z0-9]*-\d+) (.+)$/.exec(line);
    if (/^## /.test(line)) {
      flush();
      area = null;
      continue;
    }
    if (reqMatch) {
      flush();
      current = {
        id: reqMatch[1],
        title: reqMatch[2].trim(),
        prefix: reqMatch[1].split('-')[0],
        area,
        line: i + 1,
        body: [],
      };
      continue;
    }
    if (areaMatch && !line.startsWith('####')) {
      flush();
      area = areaMatch[1].trim();
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();
  return reqs;
}

function field(body, name) {
  const re = new RegExp(`^- \\*\\*${name}:\\*\\* (.+)$`);
  const line = body.find((entry) => re.test(entry));
  return line ? re.exec(line)[1].trim() : null;
}

function enrich(reqs) {
  return reqs.map((req) => {
    const layer = field(req.body, 'Layer');
    const status = field(req.body, 'Status');
    const testsRaw = field(req.body, 'Tests');
    const statement = field(req.body, 'Statement');
    const tests = testsRaw
      ? testsRaw
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean)
      : [];
    const text = req.body.join('\n');
    return { ...req, layer, status, tests, statement, text };
  });
}

function checkShape(reqs) {
  const seen = new Set();
  const knownAreas = new Set(AREAS.map(([name]) => name));
  for (const req of reqs) {
    if (seen.has(req.id)) fail(`${req.id} is duplicated (line ${req.line})`);
    seen.add(req.id);
    if (!knownAreas.has(req.area)) {
      fail(`${req.id} is outside a known area heading (line ${req.line}, area ${req.area})`);
    } else {
      const expected = AREAS.find(([name]) => name === req.area)[1];
      if (req.prefix !== expected) {
        fail(`${req.id} uses prefix ${req.prefix} under ${req.area}; expected ${expected}`);
      }
    }
    if (!LAYERS.has(req.layer)) fail(`${req.id} has invalid Layer ${req.layer}`);
    if (!STATUSES.has(req.status)) fail(`${req.id} has invalid Status ${req.status}`);
    if (req.tests.length === 0) fail(`${req.id} has no Tests`);
    for (const tier of req.tests) {
      if (!ALL_TIERS.has(tier)) fail(`${req.id} has unknown test tier ${tier}`);
    }
    if (!req.statement || !req.statement.endsWith('.')) {
      fail(`${req.id} Statement must be one sentence ending with a period`);
    }
    if (req.statement && req.statement.includes('. ')) {
      fail(`${req.id} Statement must be a single sentence`);
    }
    for (const word of ['Given', 'When', 'Then']) {
      if (!req.text.includes(word)) fail(`${req.id} acceptance is missing ${word}`);
    }
  }
}

function countsOf(reqs) {
  const rows = AREAS.map(([area, prefix]) => {
    const inArea = reqs.filter((req) => req.prefix === prefix);
    const row = { area, prefix, L1: 0, L2: 0, L3: 0, Total: inArea.length };
    for (const req of inArea) row[req.layer] += 1;
    return row;
  });
  const total = { area: 'Total', prefix: '', L1: 0, L2: 0, L3: 0, Total: reqs.length };
  for (const row of rows) {
    total.L1 += row.L1;
    total.L2 += row.L2;
    total.L3 += row.L3;
  }
  return { rows, total };
}

function parseCountsTable(markdown) {
  const section = markdown.split('## Requirement counts')[1];
  if (!section) {
    fail('Missing ## Requirement counts section');
    return [];
  }
  const untilNext = section.split(/\n## /)[0];
  const lines = untilNext.split('\n').filter((line) => line.startsWith('|'));
  return lines
    .filter((line) => !line.includes('---') && !line.includes('Prefix'))
    .map((line) => {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((_, index, all) => index < all.length);
      const clean = (value) =>
        String(value ?? '')
          .replace(/\*\*/g, '')
          .trim();
      const [area, prefix, l1, l2, l3, total] = cells.slice(1, 7).map(clean);
      return {
        area,
        prefix,
        L1: Number(l1),
        L2: Number(l2),
        L3: Number(l3),
        Total: Number(total),
      };
    });
}

function checkCounts(markdown, reqs) {
  const { rows, total } = countsOf(reqs);
  const parsed = parseCountsTable(markdown);
  const expected = [...rows, total];
  if (parsed.length !== expected.length) {
    fail(`Counts table has ${parsed.length} data rows; expected ${expected.length}`);
  }
  for (let i = 0; i < Math.min(parsed.length, expected.length); i++) {
    const got = parsed[i];
    const want = expected[i];
    const label = want.prefix || 'Total';
    if (
      got.area !== want.area ||
      got.L1 !== want.L1 ||
      got.L2 !== want.L2 ||
      got.L3 !== want.L3 ||
      got.Total !== want.Total
    ) {
      fail(
        `Counts row ${label} is ${got.area} ${got.L1}/${got.L2}/${got.L3}/${got.Total}; expected ${want.area} ${want.L1}/${want.L2}/${want.L3}/${want.Total}`
      );
    }
  }
}

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, found);
    } else if (/\.(test|spec)\.[jt]s$/.test(entry.name) || entry.name.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

function testTitlesFromSource() {
  const files = [
    ...walk(path.join(ROOT, 'tests')),
    ...walk(path.join(ROOT, 'e2e')),
    ...walk(path.join(ROOT, 'src')),
  ];
  const titles = [];
  const call =
    /(?:\bit|\btest|\bdescribe|\brequirement)\s*(?:\.\s*skip)?\s*\(\s*(['"`])([\s\S]*?)\1/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = call.exec(source))) {
      const skipped = match[0].includes('.skip');
      titles.push({ name: match[2], status: skipped ? 'skipped' : 'present', file });
    }
  }
  return titles;
}

function testTitlesFromReport(reportPath) {
  const absolute = path.isAbsolute(reportPath) ? reportPath : path.join(ROOT, reportPath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!Array.isArray(parsed.tests)) fail('Report must be { "tests": [ { "name", "status" } ] }');
  return parsed.tests.map((test) => ({
    name: String(test.name ?? ''),
    status: String(test.status ?? ''),
    file: String(test.file ?? ''),
  }));
}

function loadAllow(file) {
  if (!file) return new Set();
  const absolute = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.failures;
  if (!Array.isArray(list)) {
    fail('Expected-failure file must be { "failures": ["ID@tier"] }');
    return new Set();
  }
  return new Set(list);
}

function checkApproved(reqs, titles, useReport, allow) {
  const approved = reqs.filter((req) => req.status === 'approved' && req.layer === 'L1');
  let fullstackNotRun = false;
  for (const req of approved) {
    const ciTiers = req.tests.filter((tier) => CI_TIERS.includes(tier));
    if (ciTiers.length === 0) {
      fail(`${req.id} is approved L1 but lists no CI tier (unit, fixture, browser, fullstack)`);
      continue;
    }
    for (const tier of ciTiers) {
      const hits = titles.filter(
        (test) => test.name.includes(req.id) && test.name.includes(`@${tier}`)
      );
      const key = `${req.id}@${tier}`;
      if (useReport && tier === 'fullstack' && hits.length === 0) {
        fullstackNotRun = true;
        continue;
      }
      const good = hits.filter((test) => {
        if (!useReport) return test.status !== 'skipped';
        if (test.status === 'passed') return true;
        return test.status === 'failed' && allow.has(key);
      });
      if (
        useReport &&
        allow.has(key) &&
        hits.some((test) => test.status === 'passed') &&
        !hits.some((test) => test.status === 'failed')
      ) {
        fail(`${req.id} @${tier} passed but is still listed in the expected-failure file`);
      }
      if (good.length === 0) {
        const why = useReport ? 'no passing test' : 'no test title';
        fail(`${req.id} ${why} contains ${req.id} and @${tier}`);
      }
    }
  }
  if (fullstackNotRun) console.log('fullstack: not run');
}

function printCounts(reqs) {
  const { rows, total } = countsOf(reqs);
  console.log('| Area | Prefix | L1 | L2 | L3 | Total |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    console.log(
      `| ${row.area} | ${row.prefix} | ${row.L1} | ${row.L2} | ${row.L3} | ${row.Total} |`
    );
  }
  console.log(
    `| **Total** |  | **${total.L1}** | **${total.L2}** | **${total.L3}** | **${total.Total}** |`
  );
}

const args = parseArgs(process.argv.slice(2));
const markdown = fs.readFileSync(SPEC, 'utf8');
const reqs = enrich(parseRequirements(markdown));
if (reqs.length === 0) fail('No requirements found');
checkShape(reqs);
checkCounts(markdown, reqs);

if (args.printCounts) printCounts(reqs);

const titles = args.report ? testTitlesFromReport(args.report) : testTitlesFromSource();
checkApproved(reqs, titles, Boolean(args.report), loadAllow(args.allowExpected));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log(`traceability ok: ${reqs.length} requirements, approved L1 gated`);
