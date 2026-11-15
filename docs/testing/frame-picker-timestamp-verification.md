# Superseded frame picker attempt — historical results only

**This attempt did not resolve the reported frame mismatch.** Its pending-seek guard was reverted after it blocked picking on a paused movie. The mid-scene checks below missed frame identity errors at scene cuts. Do not cite these passing results as acceptance of the fix. See [the replacement verification record](frame-picker-timestamp-fix-verification.md).

The patch was briefly deployed, then rolled back; the deployment/rollback wording below describes the state when this record was first written, not the current server or checkout. No further deployment is authorized.

## Historical record

Verified on `fix/frame-picker-timestamp`, based on `e98044f`, with local Studio changes and unchanged plugin `8088ad5`. Requirement: `PROP-004`.

## Reproduction and fix

Browser regressions reproduced stale frames in both browsers: a source PNG remained open after forward navigation, and a delayed PNG response could cover the movie after a subsequent scrub. The old request was associated with the old position but was not invalidated by seeking.

`StudioSession.seek()` now invalidates the old PNG/request, including ruler scrubbing, stepping and skipping. Starting playback also closes the frozen picker. The picker is disabled with an explicit reason while a seek is pending, so it cannot extract a target-position PNG over a preview that has not reached that position. The session method also enforces this guard.

The three maintained browser cases cover delayed responses, already-open frames followed by forward navigation/new requests, and a seek queued beyond the encoding horizon. Requests must match the displayed ruler timestamp exactly; pointer placement is checked within the existing one-frame allowance.

## Automated results

- Full Chromium/Firefox browser suite: **284 passed**.
- Unit/fixture: **136 passed**.
- Svelte check: **0 errors**, two existing ChannelManager warnings.
- Repository formatting and diff checks: passed.
- Scoped outcome gate: `PROP-004` passed its required unit/browser/fullstack tiers using `test-results/traceability-picker.json` (local generated evidence).

The isolated lab `picker` used loopback ports 18120/19224, `model-006-follows.json`, and the maintained Step 4 suite filtered to `PROP-004`. Reset before each final browser run. **Two lab checks passed per browser**, covering the original PNG/protobuf assertion and forward scrubs at 3, 5 and 7 seconds. Each forward request matches the ruler timestamp, the preview displays the independently specified red/green/blue scene, and picked PNG RGB and saved protobuf match the independently generated source-pixel fixture exactly.

The browser video scene check deliberately does not require RGB-byte equality with the PNG: video color/range conversion differs from PNG decoding. Exact source PNG/protobuf assertions remain. A cold proxy is allowed to finish the pending seek before extraction starts; the normal frame-request timeout is unchanged.

Restricted evidence (never publish raw traces/logs):

- Chromium: `.emby-stack/labs/picker/artifacts/2026-11-15T01-44-45.020Z`
- Firefox: `.emby-stack/labs/picker/artifacts/2026-11-15T01-45-30.709Z`

Lab evidence was collected and the lab stopped. No owner movie files or hands-on server were used. Only these focused integrated checks ran, not the entire Step 4 lab suite; this is not whole-J1 acceptance. The fix has not been committed, pushed or deployed.
