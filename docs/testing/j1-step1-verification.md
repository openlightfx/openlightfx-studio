# J1 Step 1 verification

**Status: complete — J1 Step 1**, with passing requirement-scoped automated coverage.
The project-wide gate gaps below remain open for other J1 work.

Scope: `FLOW-001`, `FLOW-003`, and `ROOM-001/002/003/004/005/006/008/009/012`.
Other J1 steps and physical hardware certification are not included.

## Maintained coverage

- `e2e/fullstack/lab-j1-step1.spec.ts` runs the discovery, Identify and room
  lifecycle regressions serially against the real embedded Studio/plugin.
- `tests/fixtures/lab/room-identify.json` provides four independent WiZ simulator
  endpoints, with no published UDP ports or LAN addresses.
- Discovery asserts fresh probes from all four bulbs, `foundCount: 4`, protocol,
  model and IP displayed in Studio, and the Bedroom bulb's disabled placement.
- Identify asserts the progress label and fresh red/green/blue receipts for only
  the selected simulator identity, even after discovery changes plugin bulb IDs.
- Room checks cover real Emby Web credentials without URL tokens, first run,
  required name/screen, all devices across two users sorted by activity, occupied
  screen rejection, drag/menu placement and removal, persisted rename/Follows,
  deletion/unplacement and screen reuse.
- `e2e/browser/j1-rooms.spec.ts` runs in Chromium and Firefox, including coverage
  updates, cancellation, discovery failure/retry and save-conflict preservation.

The old assigned-bulb-only full-stack check remains a regression, but no longer
claims to satisfy `ROOM-003` discovery by itself.

## Commands and results

From the Studio root, run builds/tests serially: several commands build the same
Svelte output directory and must not run concurrently.

```bash
npm test
npm run check
npx prettier --check .
npm run test:lab-network
OLFX_OUTCOMES=test-results/outcomes-browser-step1-final.jsonl \
  npx playwright test --project=chromium --project=firefox e2e/browser/j1-rooms.spec.ts

export OLFX_LAB_ID=roomidentify OLFX_LAB_PORT=18110 OLFX_LAB_CONTROL_PORT=19214
export OLFX_LAB_SCENARIO="$PWD/tests/fixtures/lab/room-identify.json"
export OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step1.spec.ts"
export OLFX_LAB_PLAYBACK=room-setup
node scripts/fullstack/lab.mjs reset
node scripts/fullstack/lab.mjs run
# Save Chromium outcomes before the next run resets this lab's outcome file.
cp test-results/outcomes-fullstack-lab-roomidentify.jsonl test-results/outcomes-step1-chromium.jsonl
node scripts/fullstack/lab.mjs reset
OLFX_LAB_BROWSER=firefox node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

Results: unit/fixture **126 passed**; focused browser **26 passed**;
`npm run check` **0 errors, 2 existing ChannelManager accessibility warnings**;
relay network regression **passed**; whole-repository Prettier check **passed**.
Freshly rebuilt isolated lab: **9 passed in Chromium, 9 passed in Firefox**.
Step 1 outcome traceability **passed** across both live browsers and the focused
browser suite.

Restricted evidence (do not publish raw traces/logs):

- Chromium: `.emby-stack/labs/roomidentify/artifacts/2026-11-14T21-56-03.400Z`
- Firefox: `.emby-stack/labs/roomidentify/artifacts/2026-11-14T21-57-03.140Z`

Simulator command receipts are the explicit Identify oracle required by
`ROOM-004`; these room-only tests do not claim playback/rendered-light coverage.

Source baselines: Studio `00468c4` plus recorded worktree changes; plugin `8088ad5`
(clean); simulator `6137252` (clean). Restricted build manifests contain exact
source hashes, diffs and test evidence. No credentials or raw lab evidence belong
in this document.

## Outcome traceability

Build a report from fresh runs only:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
const files = [
  'test-results/outcomes-browser-step1-final.jsonl',
  'test-results/outcomes-step1-chromium.jsonl',
  'test-results/outcomes-fullstack-lab-roomidentify.jsonl',
];
const tests = files.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n')
  .filter(Boolean).map(line => {
    const result = JSON.parse(line);
    if (result.status !== 'passed') throw new Error(`Non-passing result: ${result.title}`);
    return { name: result.title, status: result.status };
  }));
fs.writeFileSync('test-results/traceability-step1.json', JSON.stringify({ tests }, null, 2));
JS
node docs/requirements/check-traceability.mjs \
  --requirements FLOW-001,FLOW-003,ROOM-001,ROOM-002,ROOM-003,ROOM-004,ROOM-005,ROOM-006,ROOM-008,ROOM-009,ROOM-012 \
  --report test-results/traceability-step1.json
npm run test:traceability
```

The scoped outcome gate validates all 165 requirement blocks and requires passing
mapped tiers for the Step 1 selection. The **project-wide** gate remains failing
on seven mappings outside Step 1: `MODEL-003@unit`, `MODEL-005@unit`,
`MODEL-006@unit`, `MODEL-007@fixture`, `MODEL-007@fullstack`,
`WATCH-002@fullstack`, `DONE-001@browser`. They are not waived, relabeled or added
to expected failures. Passing Step 1's explicit scope does not imply the global
CI gate or the whole J1 journey passes.
