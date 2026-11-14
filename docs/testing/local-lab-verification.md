# Local lab implementation verification

This is recorded automated-test evidence for the covered J1 behavior; it is not evidence for uncovered requirements or physical hardware accuracy.

## Verified locally

- Local Studio and sibling plugin checkouts built and embedded into disposable Emby 4.9.3.0; isolated project `olfx-lab-agent` on loopback ports 18096/19202.
- Controlled-session golden path passed, including Studio UI room placement, track authoring, protobuf save verification, simultaneous rendered L/R states and restoration to off.
- Actual Emby Web golden path passed with advancing video, the same lighting assertions, and real Stop shortcut/restoration.
- Controlled → Web → controlled replay passed without resetting; final controlled and Web runs passed again.
- Simulator: 3 regression tests passed, including headless transitions with observation disabled, real intermediate/final fade state with observation enabled, reset cancellation and cursor validation.
- `npm test`: 118 unit/fixture tests passed, including the fixed-layout fixture regression.
- Focused J1 Playwright browser suites: 62 tests passed across Chromium and Firefox, including Library loading/posters, rooms, tracks and editor paths.
- `npm run check`: zero errors, two existing `ChannelManager.svelte` accessibility warnings.
- The MODEL-006/ROOM-008/ROOM-009/TRACK-002 custom lab suite passed all four tests with rendered-state and post-save API/UI assertions. The FLOW-001 fresh-room-state lab test passed separately.

Latest J1 lab evidence is stored locally under:

- `.emby-stack/labs/j1r3/artifacts/2026-11-14T19-56-17.912Z` — MODEL-006, TRACK-002, ROOM-009, and ROOM-008.
- `.emby-stack/labs/flow1/artifacts/2026-11-14T19-55-04.547Z` — FLOW-001 first-run setup.

Artifacts are gitignored and restricted. Logs/traces can contain disposable credentials and must not be published without redaction. Build manifests record dirty local source identity at build time; runner identity is recorded separately at run time.

## Checks that are not green

- `npm run test:traceability` still reports eight missing requirement/tier pairs: MODEL-003 @unit, MODEL-005 @unit, MODEL-006 @unit, MODEL-007 @fixture, MODEL-007 @fullstack, ROOM-004 @fullstack, WATCH-002 @fullstack, and DONE-001 @browser. The checker and expected-failure allowlist were not relaxed.
- The full `npm run test:browser` run produced 62 passes and 164 failures. Most failures are in the older browser suite expecting the removed “Proxy Fixture” local-dev UI; the dedicated J1 browser files pass. The full requirements report has 83 failed requirement/tier rows, including earlier full-stack LIB-001, LIB-002, and MEDIA-016 failures. No failures were hidden or allowlisted.
- The complete legacy two-browser full-stack suite and remote CI job were not executed as part of this change. The live CI job needs the simulator observation commit published before cloning it from `main`.

## Remaining scope and exit status

Known REST bulbs are fixtures. The isolated simulator's REST profile does not validate the UDP-backed Identify flow; WATCH-002 still lacks the no-room-device playback assertion; MODEL-007's approved fixture is not present in this checkout; and the broad DONE-001 control audit remains uncovered. MODEL-003/005/006 unit-tier ownership also needs alignment with the plugin-only routing/mixing architecture. These uncovered behaviors need appropriate automated coverage or an owner-approved test-tier/fixture decision before the corresponding requirements/steps can exit. See [local-lab.md](local-lab.md) for the next coverage boundaries and safe extension rules. No hands-on test server was deployed or changed.
