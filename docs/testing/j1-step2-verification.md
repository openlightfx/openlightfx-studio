# J1 Step 2 verification

**Status: complete — J1 Step 2**, with passing requirement-scoped automated coverage.

Scope: `LIB-001`, `LIB-002`, `LIB-003`, `LIB-004` (Library). This does not complete
other J1 steps, the legacy editor requirements, or project-wide CI.

## Maintained coverage

`e2e/fullstack/lab-j1-step2.spec.ts` creates three independently named/year-dated
movies and one series with one episode in the **disposable isolated lab only**.
It copies the generated H.264 clip into separate movie and TV library roots,
writes local NFO metadata and a real poster, and scans them through Emby. It
replaces only the lab's broad `/media` library using Emby's folder IDs. It never
uses the owner's media, mocks Studio APIs, or drives bulbs/plays video.

The serial regression verifies:

- Exactly three movie cards despite the scanned series/episode; correct titles
  and years; real pagination via `startIndex` and `limit`.
- Real saved tracks yielding `No track`, `1 track`, and the active
  `2 tracks · 1 plays in Emby` badge.
- A real poster which loads without credentials in its URL or image request;
  a title fallback when Emby has no poster.
- Server-side search and visible results within one second, no-match text, and
  Clear search restoring all three cards.
- Mouse and Enter navigation to the correct movie, and browser Back.
- All sort choices and persisted selection after reload, with independent
  expected orders anchored to fixture dates and saved track counts.
- No-room link, room creation and Next navigation through the real plugin, and
  removal of the no-room strip after the room is saved.
- Authentication from real Emby Web credentials with no `api_key` in Studio URLs.

`e2e/browser/j1-library.spec.ts` additionally covers pending/loading placeholders,
reduced-motion shimmer, missing/failed images, empty library/whitespace search,
debouncing and obsolete responses, plugin error/Retry without fake cards, and
Back/Forward. Unit tests cover pagination, deduplication and AbortSignal handling.

## Reproduction

Build and run suites **serially**, because browser and lab commands both build
Studio's Svelte output.

```bash
npm test
npm run check
npx prettier --check .
OLFX_OUTCOMES=test-results/outcomes-browser-step2.jsonl \
  npx playwright test --project=chromium --project=firefox e2e/browser/j1-library.spec.ts

export OLFX_LAB_ID=step2 OLFX_LAB_PORT=18112 OLFX_LAB_CONTROL_PORT=19216
export OLFX_EMBY_REPO="$(realpath ../openlightfx-emby)"
export OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step2.spec.ts"
export OLFX_LAB_PLAYBACK=library
# No scenario required: this suite seeds its movie/TV libraries, not bulbs.
node scripts/fullstack/lab.mjs start
node scripts/fullstack/lab.mjs run
cp test-results/outcomes-fullstack-lab-step2.jsonl test-results/outcomes-step2-chromium.jsonl
node scripts/fullstack/lab.mjs reset
OLFX_LAB_BROWSER=firefox node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

Use `reset` rather than `start` when refreshing an existing lab after product
changes. An explicit reset before each final browser run also removes saved tracks
and seeded library data from preceding runs.

## Results

- Unit/fixture: **128 passed**.
- Focused Library browser suite: **24 passed**, Chromium and Firefox.
- All modern J1 browser regressions (Library, Rooms, Movie, Editor): **82 passed**.
- Freshly rebuilt isolated lab: **5 passed in Chromium, 5 passed in Firefox**.
- Step 2 outcome-based traceability: **passed** for `LIB-001` through `LIB-004`.
- Svelte check: **0 errors, 2 existing ChannelManager accessibility warnings**.
- Whole-repository Prettier check: **passed**.

Restricted evidence (do not publish raw traces/logs):

- Chromium: `.emby-stack/labs/step2/artifacts/2026-11-14T22-24-23.573Z`
- Firefox: `.emby-stack/labs/step2/artifacts/2026-11-14T22-25-01.987Z`

Studio baseline: `70b235f` plus recorded worktree changes. The lab was stopped after
collection. Deployment health is not a substitute for these automated checks.

## Outcome traceability

Combine **fresh passing runs only** into an outcome report:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
const files = [
  'test-results/outcomes-browser-step2.jsonl',
  'test-results/outcomes-step2-chromium.jsonl',
  'test-results/outcomes-fullstack-lab-step2.jsonl',
];
const tests = files.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n')
  .filter(Boolean).map(line => {
    const result = JSON.parse(line);
    if (result.status !== 'passed') throw new Error(`Non-passing result: ${result.title}`);
    return { name: result.title, status: result.status };
  }));
fs.writeFileSync('test-results/traceability-step2.json', JSON.stringify({ tests }, null, 2));
JS
node docs/requirements/check-traceability.mjs \
  --requirements LIB-001,LIB-002,LIB-003,LIB-004 --report test-results/traceability-step2.json
npm run test:traceability
```

## Broader gates and baseline comparison

The entire Chromium/Firefox browser suite was run: **82 passed, 164 failed**.
A separate temporary detached worktree of the unchanged baseline `70b235f`, with
its own build and browser run, produced **68 passed, the same 164 failed**.
These are the legacy `j1-j4.spec.ts` assertions against retired editor/shell flows,
not introduced Library regressions. The temporary worktree was removed. None of
these failures were skipped, retagged or waived. The modern J1 suites are run
separately as additional regression evidence.

The unchanged project-wide traceability gate still reports the seven mappings:
`MODEL-003@unit`, `MODEL-005@unit`, `MODEL-006@unit`, `MODEL-007@fixture`,
`MODEL-007@fullstack`, `WATCH-002@fullstack`, `DONE-001@browser`.
Step 2's explicit requirement scope passing does not make these global gates green.

Plugin baseline: `8088ad5` (clean); simulator: `6137252` (clean). Restricted lab
manifests record the Studio baseline/worktree diffs, build identity and results.
Do not publish raw traces, session files or logs containing disposable credentials.
