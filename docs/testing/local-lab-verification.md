# Local lab implementation verification

This is recorded automated-test evidence for the covered J1 behavior; it is not evidence for uncovered requirements or physical hardware accuracy.

## Verified locally

- Local Studio and sibling plugin checkouts built and embedded into disposable Emby 4.9.3.0; isolated project `olfx-lab-agent` on loopback ports 18096/19202.
- Controlled-session golden path passed, including Studio UI room placement, track authoring, protobuf save verification, simultaneous rendered L/R states and restoration to off.
- Actual Emby Web golden path passed with advancing video, the same lighting assertions, and real Stop shortcut/restoration.
- Controlled → Web → controlled replay passed without resetting; final controlled and Web runs passed again.
- Simulator: 3 regression tests passed, including headless transitions with observation disabled, real intermediate/final fade state with observation enabled, reset cancellation and cursor validation.
- `npm test`: 84 unit/fixture tests passed, including negative rendered-state oracle tests.
- `npm run check`: zero errors, two existing `ChannelManager.svelte` accessibility warnings.
- Repository-wide Prettier, shell syntax and Compose configuration checks passed.

Latest final-run evidence is stored locally under:

- `.emby-stack/labs/agent/artifacts/2026-11-14T18-10-11.143Z` — controlled playback.
- `.emby-stack/labs/agent/artifacts/2026-11-14T18-10-19.148Z` — actual Emby Web playback.

Artifacts are gitignored and restricted. Logs/traces can contain disposable credentials and must not be published without redaction. Build manifests record dirty local source identity at build time; runner identity is recorded separately at run time.

## Checks that are not green

- `npm run test:traceability`: missing J1 requirement test titles across MODEL/FLOW/ROOM/TRACK/EDIT/WATCH/DONE. The traceability checker and expected-failure allowlist were not relaxed.
- `npm run test:browser`: all 164 legacy browser tests failed on the current editor/journey screens. These results are not covered by the new lab passes; no skips or expected failures were added.
- The complete legacy two-browser full-stack suite and remote CI job were not executed as part of this change. The live CI job needs the simulator observation commit published before cloning it from `main`.

## Remaining scope and exit status

Known REST bulbs are fixtures. This implementation does not validate UDP discovery, Identify, all protocol drivers, exhaustive routing/lifecycle scenarios, or physical bulbs/TV playback. These uncovered behaviors need appropriate automated coverage before the corresponding requirements/steps can exit. See [local-lab.md](local-lab.md) for the next coverage boundaries and safe extension rules. No hands-on test server was deployed or changed.
