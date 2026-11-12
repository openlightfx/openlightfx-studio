# Testing Studio

The requirements in [requirements/studio-requirements.md](requirements/studio-requirements.md) are `approved`. Tests that describe behavior the app does not implement yet are listed in `tests/expected-failures.json`. Those failures do not fail CI. A listed test that starts passing fails CI until its id is removed from that file. `npm run test:report` writes pass, fail, and expected-fail per requirement id.

Shared fixtures for the plugin live in [../tests/fixtures/README.md](../tests/fixtures/README.md).

## Commands

From the repository root:

```bash
npm install
npx playwright install chromium firefox
```

| Tier | Command |
| --- | --- |
| Traceability (titles exist) | `npm run test:traceability` |
| Unit and fixture | `npm test` |
| Browser, Firefox and Chromium | `OLFX_OUTCOMES=test-results/outcomes-browser.jsonl npm run test:browser` |
| Synthetic media | `npm run media:generate` |
| Full stack | `npm run test:fullstack` |
| Real media, J5, not CI | `OLFX_REAL_MEDIA=~/Videos/John_Wick.mkv OLFX_REAL_TRACK=~/Videos/John_Wick.lightfx npm run test:realmedia` |
| Requirement report | `npm run test:report` |
| Report gate | `node docs/requirements/check-traceability.mjs --report test-results/traceability.json --allow-expected tests/expected-failures.json` |

`npm run test:browser` runs every `@browser` test in Firefox and in Chromium. `npm run test:fullstack` is the local Docker stack. It validates `docker-compose.fullstack.yml` and, when Docker, the .NET 8 SDK, and a clone of `openlightfx-simulator` are available, boots Emby, builds the plugin from `openlightfx-emby` branch `cursor/studio-host-api-18c1` with this Studio build embedded, starts `openlightfx-simulator --no-gui`, and runs the `@fullstack` tests against simulator NDJSON.

CI runs the traceability checker, the unit tests, the browser tests, media generation, and `docker compose config`. It does not boot Emby unless `SIMULATOR_TOKEN` is set, because the simulator repository is private and the plugin build needs the Emby SDK DLLs from the running server. The script still does that work locally.

J5 reads `OLFX_REAL_MEDIA` (default `~/Videos/John_Wick.mkv`) and `OLFX_REAL_TRACK` (default `~/Videos/John_Wick.lightfx`). The Playwright `realmedia` project is not part of CI. A `CI` environment skips those tests if the project is selected by mistake.

## What the unit tier is

`src/lib/domain` is the pure module the unit and fixture tests call: sampling, kelvin conversion, validation, protobuf round-trip, safety, snap, shortcuts, and the effect-renderer transcription. It is not wired into the Svelte editor. Browser and fullstack tests drive the product and are expected to fail until that editor and the plugin endpoints exist.

## Limits found while writing the tests

- `power_on` false is the proto3 default, so the wire format cannot show "unset" separately from false. Tests assert the decoded bool. FP-1 stays deferred.
- `KEY-011` follows `PlaybackSession` (black before the first keyframe). `InterpolationEngine.GetStateAtTime` still returns the channel default. Plugin tests of this fixture must not call `GetStateAtTime`.
- `effects.json` was transcribed from the C# renderers on `cursor/studio-host-api-18c1` because that checkout does not include the Emby SDK DLLs, so the renderers were not executed here. The dotnet test is the cross-check.
- This ffmpeg build cannot encode PGS. `scripts/media/pgs.mjs` writes a one-pixel SUP and the script fails if ffprobe does not see `hdmv_pgs_subtitle`.
- `PLUG-001` through `PLUG-005` are not implemented on the host-API branch yet, so the fullstack tests fail against that build.
- Frame-budget and real-title timings (`PERF-002`, J5) need the editor and the owner's media. The tests exist and do not run as a green path.
