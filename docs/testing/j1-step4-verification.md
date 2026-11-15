# J1 Step 4 — editor implementation verification

## Scope and result

The Step 4 implementation gaps reproduced in the audit are resolved. Passing outcome-based traceability covers `EDIT-001`–`EDIT-014`, plus `MEDIA-016`, `PROP-004`, `TIME-002`, `TIME-010`, `SAVE-003`, `ERR-003`, `PREV-007`, and `PREV-008`.

This is scoped implementation evidence, not a claim that project-wide CI or all J1 exit criteria pass. The named John Wick track is not present in these checkouts: effects preservation uses an independently constructed synthetic eight-effect track, not the owner's real media. Simulator REST restoration verifies the supported off fallback, not arbitrary physical-bulb snapshot recovery or hardware certification.

Source baseline: Studio `386b726`, with the working changes on `feat/j1-step4-completion`; plugin `8088ad5`; simulator `6137252`. No plugin changes were needed. This verification preceded the owner's separately authorized publication and hands-on deployment.

## What changed

- Full-resolution plugin PNG selection applies the original pixel, with keyboard selection, cancellation, letterbox handling, and errors. It never samples the video canvas.
- Ctrl/Command+wheel zoom preserves the playhead's viewport anchor; Fit observes viewport size. Ruler and lane widths/scroll positions stay aligned.
- Keyframe dragging cannot cross either neighbor, even with minimum spacing disabled. Inspector time changes keep protobuf keyframes sorted.
- File/navigation actions protect unsaved work. File import validates before replacement, checks size before reading, and confirms movie/runtime mismatches.
- Save shortcuts work while text fields are focused. Saves are serialized, retain edits made during an in-flight write, adopt the latest concurrency token, and retry failed sidecar writes. Rejection selects an identified offending keyframe. Conflict actions Reload and Save as new track are implemented.
- Save state is always Saved, Unsaved changes, or Saving. Effects have visible labels and a preservation explanation. Dialog focus is trapped; Escape closes dialogs; Help explains the workflow.
- Non-admin actions and unavailable Save/preview controls are disabled with reasons. Named preview failures turn Lights off without blocking authoring.
- Missing/building proxies are polled. Early seeks remain pending until usable media arrives, and the completed proxy is reopened once to give the browser a completed Range resource while preserving transport state.
- Scoped outcome reports now fail if a required full-stack tier is missing, rather than treating it as unavailable. A unit regression protects this; the default global gate remains unchanged.

## Automated results

| Check                                          | Result                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `npm test`                                     | 133 passed                                                 |
| `npm run check`                                | 0 errors; 2 existing ChannelManager accessibility warnings |
| Modern J1 browser suites, Chromium and Firefox | 132 passed                                                 |
| Step 4 isolated lab, Chromium                  | 11 passed                                                  |
| Step 4 isolated lab, Firefox                   | 11 passed                                                  |
| Selected outcome-based traceability            | Passed; all 165 requirement blocks validated               |
| Full browser suite with a fresh preview server | 132 passed; 164 failed                                     |

The 164 failing titles, including their duplicate browser counts, match `test-results/outcomes-browser-step3-all.jsonl` exactly. No tests were skipped, waived, or retagged to hide them. An interrupted run left an unusable preview-server lifecycle; a subsequent attempt produced connection-refused failures. The final run used `CI=1` to require a fresh preview server and recovered the verified baseline.

The unchanged global source gate reports seven missing mappings:

- `MODEL-003@unit`
- `MODEL-005@unit`
- `MODEL-006@unit`
- `MODEL-007@fixture`
- `MODEL-007@fullstack`
- `WATCH-002@fullstack`
- `DONE-001@browser`

## Isolated lab evidence

`e2e/fullstack/lab-j1-step4.spec.ts` runs serially against disposable Emby and simulator containers. It verifies:

1. A cold proxy plays while genuinely building; a past-horizon seek waits and eventually renders the requested frame while paused.
2. The sole ruler seeks and renders intermediate drag frames; transport steps, skips, plays and pauses the actual proxy.
3. A plugin PNG pixel matches independently generated synthetic-media center-pixel evidence, and persists in protobuf.
4. Exact inspector/settings values, track metadata, sidecar fields, and repeated saves with the latest token.
5. Native and folded routing labels from the plugin; no-room authoring and real API Save.
6. Fresh routed simulator command receipts, simultaneous rendered colors, and Stop returning every selected bulb to the supported off fallback.
7. Actual Emby controlled-session ownership: Cancel preserves its rendered lights; accepted takeover changes them to the editor's frame.
8. Every field of eight existing synthetic effects survives Open and Save.
9. A genuine non-admin Emby session can author/export but cannot Save, preview, or Watch.
10. Actual `V-004` rejection leaves the server bytes unchanged; external writes produce real conflicts; Reload adopts server data and Save as new preserves the original.

The scenario is `tests/fixtures/lab/model-006-follows.json`, used for three independent REST bulb inventories and rendered-state evidence. Tests explicitly set their room/positions instead of deriving expected routing from the implementation. No owner media or hands-on server was used.

Restricted artifacts remain local under `.emby-stack/labs/step4/artifacts/`:

- Chromium: `2026-11-14T23-55-16.529Z`
- Firefox: `2026-11-14T23-56-20.879Z`

Traces/logs/manifests can contain disposable credentials and must not be published. Earlier diagnostic failures remain restricted too: they established the cold-seek failure, caught a warm-cache precondition error, and corrected an invalid test assumption about which field the plugin rejects. The final suites require a reset before each browser.

## Reproduction

Run build/browser/lab commands serially.

```bash
npm test
npm run check
OLFX_OUTCOMES=test-results/outcomes-browser-step4-modern.jsonl \
  npx playwright test --project=chromium --project=firefox \
  e2e/browser/j1-library.spec.ts e2e/browser/j1-rooms.spec.ts \
  e2e/browser/j1-track.spec.ts e2e/browser/j1-editor.spec.ts

export OLFX_LAB_ID=step4 OLFX_LAB_PORT=18116 OLFX_LAB_CONTROL_PORT=19220
export OLFX_EMBY_REPO="$(realpath ../openlightfx-emby)"
export OLFX_LAB_SCENARIO="$PWD/tests/fixtures/lab/model-006-follows.json"
export OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step4.spec.ts"
export OLFX_LAB_PLAYBACK=editor
node scripts/fullstack/lab.mjs start
node scripts/fullstack/lab.mjs reset
node scripts/fullstack/lab.mjs run
cp test-results/outcomes-fullstack-lab-step4.jsonl test-results/outcomes-step4-chromium.jsonl
node scripts/fullstack/lab.mjs reset
OLFX_LAB_BROWSER=firefox node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

Build `test-results/traceability-step4.json` as `{ "tests": [...] }`, mapping each outcome's `title` to `name` and retaining `status`, from:

- `test-results/outcomes-unit.jsonl`
- `test-results/outcomes-browser-step4-modern.jsonl`
- `test-results/outcomes-step4-chromium.jsonl`
- `test-results/outcomes-fullstack-lab-step4.jsonl`

Then run:

```bash
node docs/requirements/check-traceability.mjs \
  --requirements EDIT-001,EDIT-002,EDIT-003,EDIT-004,EDIT-005,EDIT-006,EDIT-007,EDIT-008,EDIT-009,EDIT-010,EDIT-011,EDIT-012,EDIT-013,EDIT-014,MEDIA-016,PROP-004,TIME-002,TIME-010,SAVE-003,ERR-003,PREV-007,PREV-008 \
  --report test-results/traceability-step4.json
```
