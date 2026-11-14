# J1 Step 3 verification

**Status: complete — J1 Step 3**, with passing requirement-scoped automated coverage.

Scope: `TRACK-001`, `TRACK-002`, `TRACK-003`, `TRACK-004` (Movie/open/create).
This does not complete other J1 steps or project-wide CI.

## Maintained coverage

`e2e/fullstack/lab-j1-step3.spec.ts` is an ordered, serial regression against real
embedded Studio and the plugin. It uses the existing
`tests/fixtures/lab/model-006-follows.json` **only for the three independent REST
bulb inventory**. This room/track-only suite does not run that fixture's playback
scenario, claim rendered-light coverage, or access the owner's media/bulbs.
It creates its rooms through the real API and signs into Emby Web without URL tokens.

The regression checks:

- Two saved tracks, distinct titles/layouts, author and last-saved metadata, and
  exactly one active badge. Open loads the selected persisted track's five lanes;
  File → Save preserves its metadata and exact cues.
- L/C/R room preselects 3.0 and its suggestion; Create opens the editor with three
  lanes, and no track is written before Save. Saved protobuf independently proves
  version, title, movie metadata/duration, layout/channel order, dark defaults,
  and absence of cues/effects.
- No-room creation defaults to 2.0 and stays unsaved.
- Selecting a second room changes the suggested layout and the editor's first
  preview room. Coverage comes from actual plugin Routing responses, never a
  Studio fold-down table.
- File mismatch names both movies, Cancel preserves the Movie screen, and
  Continue opens the imported track. No write occurs until Save; saved channels,
  keyframes and effects equal the independently provided file.
- PNG rejection stays on the Movie screen; marketplace is plain text, with
  functional Library navigation.

`e2e/browser/j1-track.spec.ts` additionally tests semantic validation/no Open,
malformed protobuf, duration mismatch/two-percent tolerance, Windows active-track
paths, no-track focus, custom title, unknown
runtime/probe, current server metadata instead of stale cache, missing movie
errors, and room switching. Layout cards include decorative top-down diagrams.
The file input is cleared after selection so cancellation can be retried with
the same file. Short-runtime warnings show distinct seconds rather than rounding
both movie durations to zero minutes.

## Reproduction

Run builds/tests **serially**:

```bash
npm test
npm run check
npx prettier --check .
OLFX_OUTCOMES=test-results/outcomes-browser-step3-modern.jsonl \
  npx playwright test --project=chromium --project=firefox \
  e2e/browser/j1-library.spec.ts e2e/browser/j1-rooms.spec.ts \
  e2e/browser/j1-track.spec.ts e2e/browser/j1-editor.spec.ts

export OLFX_LAB_ID=step3 OLFX_LAB_PORT=18114 OLFX_LAB_CONTROL_PORT=19218
export OLFX_EMBY_REPO="$(realpath ../openlightfx-emby)"
export OLFX_LAB_SCENARIO="$PWD/tests/fixtures/lab/model-006-follows.json"
export OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step3.spec.ts"
export OLFX_LAB_PLAYBACK=track-setup
node scripts/fullstack/lab.mjs start
node scripts/fullstack/lab.mjs run
cp test-results/outcomes-fullstack-lab-step3.jsonl test-results/outcomes-step3-chromium.jsonl
node scripts/fullstack/lab.mjs reset
OLFX_LAB_BROWSER=firefox node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

Use `reset` to rebuild an existing lab. Each final run starts fresh, because the
ordered regression saves tracks; a repeated first test must not inherit those
additional tracks. Dialog tests wait for the actual prompt to be handled before
asserting cancellation or selecting the same file again.

## Results

- Unit/fixture: **128 passed**.
- Movie screen browser coverage: **26 passed**, Chromium and Firefox.
- All modern J1 browser regressions: **100 passed**.
- Freshly rebuilt isolated lab: **7 passed in Chromium, 7 passed in Firefox**.
- Step 3 outcome-based traceability: **passed** for `TRACK-001` through `TRACK-004`.
- Svelte check: **0 errors, 2 existing ChannelManager accessibility warnings**.
- Whole-repository Prettier check: **passed**.

The entire browser suite was also run: **100 passed, 164 failed**. The 164 failed
test identities were compared against Step 2's previously baseline-verified
outcome file and are identical. This does not make the global browser suite green.
No additional legacy failures were introduced by Step 3.

Restricted evidence (do not publish raw traces/logs):

- Chromium: `.emby-stack/labs/step3/artifacts/2026-11-14T22-55-07.439Z`
- Firefox: `.emby-stack/labs/step3/artifacts/2026-11-14T22-55-47.099Z`

The lab was stopped after collection. Deployment health is not a substitute for
these automated checks.

## Outcome traceability

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
const files = [
  'test-results/outcomes-browser-step3-modern.jsonl',
  'test-results/outcomes-step3-chromium.jsonl',
  'test-results/outcomes-fullstack-lab-step3.jsonl',
];
const tests = files.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n')
  .filter(Boolean).map(line => {
    const result = JSON.parse(line);
    if (result.status !== 'passed') throw new Error(`Non-passing result: ${result.title}`);
    return { name: result.title, status: result.status };
  }));
fs.writeFileSync('test-results/traceability-step3.json', JSON.stringify({ tests }, null, 2));
JS
node docs/requirements/check-traceability.mjs \
  --requirements TRACK-001,TRACK-002,TRACK-003,TRACK-004 --report test-results/traceability-step3.json
npm run test:traceability
```

The project-wide gate's seven mappings remain open:
`MODEL-003@unit`, `MODEL-005@unit`, `MODEL-006@unit`, `MODEL-007@fixture`,
`MODEL-007@fullstack`, `WATCH-002@fullstack`, `DONE-001@browser`.
No failures are skipped, retagged or waived. The previously baseline-confirmed
legacy browser failures are separate from the modern J1 regression coverage; see
[Step 2's baseline comparison](j1-step2-verification.md#broader-gates-and-baseline-comparison).

Source baselines: Studio `9cde1d4` plus recorded worktree changes; plugin `8088ad5`
and simulator `6137252` (clean). Restricted manifests retain source/build identity
and evidence; never publish raw traces or logs containing disposable credentials.
