# J1 legacy browser migration verification

Verified locally on `fix/j1-legacy-browser-coverage`, based on `f30a93f`, before publication.
This is browser acceptance evidence, not whole-J1 or integrated-lab acceptance.

## Final browser fixes

- Scope the unsaved-work Save action to its dialog, rather than matching both the dialog and the new toolbar button (`EDIT-005`).
- Replace retired built-in movie-picker visual tests with first-room setup (`FLOW-001`) and the current editor (`EDIT-001`). Retain screenshot comparisons and the existing 3% pixel-difference limit; replace the obsolete baselines with Chromium/Firefox J1 baselines.
- Keep native file-picker activation on the first mismatch import. After dismissing its confirmation, re-upload through the file input to exercise the same import validation without Firefox's native-dialog reactivation race (`TRACK-003`). Both Cancel preservation and Continue import assertions remain.

The main migrated suite uses Emby API fixtures and synthetic edit-proxy media, not local-video playback. Its 142 passing checks are included in the full browser result below. The revised five-channel, 10,000-keyframe `PERF-002` browser check is also included; Chromium asserts the actual animation-frame budget.

## Automated evidence

All commands were run serially, with a fresh preview server for browser runs.

| Check                                                                                                                                | Result                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `CI=1 npx playwright test --project=chromium --project=firefox`                                                                      | 278 passed, no failures or skips             |
| `CI=1 npx playwright test --project=firefox e2e/browser/j1-track.spec.ts --grep 'movie mismatch names both movies' --repeat-each=10` | 10 passed                                    |
| `npm test`                                                                                                                           | 136 unit/fixture tests passed                |
| `npm run check`                                                                                                                      | 0 errors; 2 existing ChannelManager warnings |
| `npx prettier --check .`                                                                                                             | Passed                                       |
| `git diff --check`                                                                                                                   | Passed                                       |

Browser outcomes: `test-results/outcomes-browser-legacy-all.jsonl` (local generated evidence; not committed).

## Remaining acceptance limits

The global traceability gate still fails on the same seven missing mappings:
`MODEL-003@unit`, `MODEL-005@unit`, `MODEL-006@unit`,
`MODEL-007@fixture`, `MODEL-007@fullstack`, `WATCH-002@fullstack`, and
`DONE-001@browser`. No exemptions were added.

The earlier editor implementation changes on this branch still need a fresh isolated Emby lab run before integrated acceptance. These browser results do not establish owner-media or physical-bulb certification. Publication and test-server deployment were subsequently authorized by the owner; neither replaces the outstanding integrated acceptance.
