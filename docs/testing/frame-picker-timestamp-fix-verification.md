# Movie frame picker — diagnosed timing fix

## Scope and source identity

J1 Step 4 completion scope: `EDIT-001`–`EDIT-014`, `MEDIA-016`, `PROP-004`, `TIME-002`, `TIME-010`, `SAVE-003`, `ERR-003`, `PREV-007`, `PREV-008`.
Studio verification source: `fix/frame-picker-timestamp`, based on `e98044f`, including the changes published with this record.
Plugin verification source: `fix/frame-picker-timestamp`, based on `8088ad5`, including the paired plugin changes.
Simulator: `6137252`. Tests use synthetic media and the isolated lab only.
The owner authorized marking Step 4 complete and publishing the pair to `main`, plugin first. **No deployment or server restart is authorized or performed for this fix.**

## Reproduced cause

The previous [attempt](frame-picker-timestamp-verification.md) tested stale requests and middle-of-scene colors. It did not establish that the PNG depicted the paused movie frame. The pending-seek guard was subsequently reverted.

With the original product code, genuine Emby/plugin diagnostics reproduced the mismatch in Chromium and Firefox while the video was paused and `video.seeking` was false. At Chromium's 1.960-second position, the displayed proxy was black, with burned-in source timecode `00:00:01:22`; the picker returned the red `00:00:02:00` frame. Similar mismatches occurred at the red/green, green/blue and blue/white cuts. Firefox reproduced black versus red at its 1.989-second position.

Independent ffprobe inspection showed source frame 47 at 1.958333 seconds, but proxy frame 47 at 1.979736 seconds; frame 48 was at 2.000000 versus 2.021403 seconds. Fragmented-MP4 initialization shifted the video timestamps by about 21 ms after the first frame. Local Emby-ffmpeg experiments with `delay_moov` removed the shift while retaining AAC. Separately, `-ss`/accurate seek extracted the first source frame **after** the requested position, rather than the frame covering it.

The maintained cut regression failed against the unfixed product: expected picked Hex `000000`, received `fd0000`. It now passes without an exemption or changed color expectation.

## Changes

- Plugin proxy muxing includes `delay_moov`. Completion markers carry `source-timeline-v2`; an older `ok` marker no longer revives a misaligned proxy.
- The plugin scans source packet PTS from the preceding keyframe through the requested position, accounting for the source's nonzero time origin. It selects the covering frame, using timestamp order rather than packet/DTS order or a nominal FPS grid. The measured timestamp is floored before accurate extraction, so rounding cannot discard the selected frame.
- Proxy, packet probe and PNG extraction explicitly select the same real video stream. Source probing excludes attached cover art.
- The original-source PNG path retains the existing HDR Hable filters. `showinfo` now measures the first output frame's actual timestamp for the response header instead of echoing the request.
- Studio waits for an actual native seek only, reads the paused video's settled position, aborts stale captures and HTTP requests on navigation, and closes a frozen picker when playback resumes. The blocking pending-target guard is absent.
- Seek state distinguishes an applied native seek from a target still waiting for a growing proxy. Decoded data and seekable ranges are checked before dispatch. A growing fragment that clamps early retains its queued target; a completed resource's adjusted native seek reconciles the playhead instead of leaving a one-frame-distance latch stuck.
- The picker shows the measured source timestamp. At EOF, a request at 10.000 seconds correctly returns the last frame at 9.958 seconds and displays that actual time; it does not fabricate a zero-error header.

## Automated verification

- Studio unit/fixture: **143 passed**.
- Plugin xUnit under .NET 8 SDK/runtime: **130 passed**, none skipped.
- Svelte: **0 errors**, two existing ChannelManager warnings.
- Full browser suite: **288 passed**, Chromium and Firefox. The corrected Firefox duration-mismatch import check additionally passed **10 consecutive runs**.
- Full maintained Step 4 isolated-lab suite: **14 passed per browser**, fresh reset/build before each final run.
- Full Step 4 selected outcome-based traceability: **passed**, all 165 specification blocks validated and all requirements in the completion scope above gated. Inputs: `test-results/outcomes-unit.jsonl`, `outcomes-browser.jsonl`, `outcomes-picker-fix-chromium-final.jsonl`, `outcomes-picker-fix-firefox-final.jsonl`; generated report `test-results/traceability-picker-fix.json`.

The frame-identity regression checks before, at and after each synthetic scene cut and at EOF: independently specified native scene, exact original PNG RGB, actual source timestamp, and saved protobuf color. Other lab checks retain cold/building playback and queued seeks, ruler scrubbing/transport, menus/save/sidecars/conflicts, server routing, rendered preview receipts, takeover, non-admin permissions and eight-effect preservation.

New unit cases cover fractional/VFR PTS, reordered packets, nonzero source origins, missing timestamps, explicit stream selection, old cache rejection, paused/adjusted native positions, aborts and resource replacement. No application code samples a video canvas; browser video canvases are independent test oracles only.

Intermediate failures were retained and corrected:

- Firefox's cold-proxy run exposed an early-clamped seek; dispatch/range handling was fixed, then both full lab suites were rerun.
- Full-browser runs exposed the existing repeated native file-chooser focus race after Cancel in the duration-mismatch test. As already done for title mismatch, the first upload still verifies native activation; follow-up invalid-file uploads use the same file input. All validation assertions remain. The final full browser run passed.
- The host originally had only .NET 10; the default net8 test host aborted. A local .NET 8 SDK/runtime was installed under `/tmp/olfx-dotnet8`; the final 130-test run used it, as did the final lab builds.

Commands:

```sh
npm test
npm run check
PATH="/tmp/olfx-dotnet8:$PATH" DOTNET_ROOT=/tmp/olfx-dotnet8 dotnet test ../openlightfx-emby -c Release
CI=1 npm run test:browser
node docs/requirements/check-traceability.mjs --requirements EDIT-001,EDIT-002,EDIT-003,EDIT-004,EDIT-005,EDIT-006,EDIT-007,EDIT-008,EDIT-009,EDIT-010,EDIT-011,EDIT-012,EDIT-013,EDIT-014,MEDIA-016,PROP-004,TIME-002,TIME-010,SAVE-003,ERR-003,PREV-007,PREV-008 --report test-results/traceability-picker-fix.json
```

Lab configuration: `OLFX_LAB_ID=picker`, loopback ports 18120/19224, `OLFX_LAB_SCENARIO=tests/fixtures/lab/model-006-follows.json`, `OLFX_LAB_TEST_FILE=e2e/fullstack/lab-j1-step4.spec.ts`, `OLFX_LAB_PLAYBACK=editor`, local plugin checkout. Lifecycle: `reset`, `run`, reset again, `OLFX_LAB_BROWSER=firefox ... run`, `collect`, `stop`.

Final restricted evidence (do not publish raw traces/logs or credentials):

- Chromium: `.emby-stack/labs/picker/artifacts/2026-11-15T02-47-03.526Z`
- Firefox: `.emby-stack/labs/picker/artifacts/2026-11-15T02-48-14.745Z`
- Original diagnostics: `.emby-stack/labs/diagnose/artifacts/2026-11-15T02-04-55.258Z` and `2026-11-15T02-07-36.641Z`.
- Recorded Chromium Studio walkthrough: `.emby-stack/labs/picker/artifacts/2026-11-15T02-53-21.512Z`. The 2.04-second video was reviewed using an 8-fps contact sheet spanning the recording: before-cut black PNG, forward blue PNG, exact picked values and Save. Both labs were collected and stopped; temporary agent scripts were removed.

## Limits

This is scoped J1 Step 4 completion evidence, not whole-J1 acceptance, owner-media testing or hardware certification. The seven project-wide traceability gaps are unchanged (`MODEL-003@unit`, `MODEL-005@unit`, `MODEL-006@unit`, `MODEL-007@fixture`, `MODEL-007@fullstack`, `WATCH-002@fullstack`, `DONE-001@browser`). No owner real-media tier was run. The existing effects and REST restoration limits remain: synthetic eight-effect fixture, supported off fallback. No blanket 40-ms/HDR/owner-movie timing certification is claimed; the actual final-frame timestamp is exposed rather than disguised.
