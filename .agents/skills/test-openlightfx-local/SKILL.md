---
name: test-openlightfx-local
description: Build local Studio and plugin checkouts into an isolated Docker Emby lab, author and play a track, validate rendered simulated light states, and collect evidence without deploying to the hands-on server.
---

# Test OpenLightFX locally

Use when asked to test or reproduce OpenLightFX behavior locally. This skill never authorizes a remote deployment or owner acceptance.

1. Read Studio `AGENTS.md`, the applicable J1 journey requirements, the selected plugin checkout's `AGENTS.md`, and `docs/testing/local-lab.md`. Inspect branch/status in Studio, plugin, and `docker/simulator-src`. Preserve all uncommitted work; do not reset, stash, switch branches, fetch over local changes, or commit unless separately authorized.
2. Confirm the plugin checkout. The default is `../openlightfx-emby`; set `OLFX_EMBY_REPO` for another checkout. The simulator is a private Git checkout at `docker/simulator-src` and must include `control.py`. Missing prerequisites are **blocked**, never passed.
3. Choose an isolated lab ID and unused loopback ports. Export these consistently for every command:

   ```bash
   export OLFX_LAB_ID=agent
   export OLFX_LAB_PORT=18096
   export OLFX_LAB_CONTROL_PORT=19202
   export OLFX_EMBY_REPO="$(realpath ../openlightfx-emby)"
   node scripts/fullstack/lab.mjs status
   ```

   A missing lab is expected before first start. A running lab may have an older build. Do not reset it without ensuring it is disposable and not in use. The CLI never operates on the existing default Compose stack or the hands-on server.

4. Run `node scripts/fullstack/lab.mjs start` for a new lab. `reset` destroys **only this lab's** containers, volumes, and generated media, then rebuilds it. It is the refresh operation after source changes. Read the reported `build.log` if building fails. Do not print `session.json`; it contains disposable authentication tokens.
5. Run the baseline checks:

   ```bash
   node scripts/fullstack/lab.mjs run
   OLFX_LAB_PLAYBACK=web node scripts/fullstack/lab.mjs run
   ```

   The first uses real Emby session APIs but not a video player. The second plays actual video in Emby Web. Both use Studio UI room placement, authoring, save and Watch in Emby, then assert simultaneous **rendered simulator states**. Known REST bulbs are test fixtures, not discovery coverage. Neither validates physical hardware.

6. For a requested regression, add a focused Playwright scenario and explicit expected bulb states. Follow `tests/fixtures/lab/stereo.json` and `e2e/fullstack/lab.spec.ts`. Use room positions/Follows, not retired mapping profiles. Do not generate expectations by calling production `RoomRouter`. Capture a fresh observer cursor, assert correct and unchanged bulbs together, include brightness/power, and use bounded polling. Test the oracle with a deliberately wrong color/bulb so it cannot pass on stale commands.
7. Select a focused scenario with `node scripts/fullstack/lab.mjs run --grep '<title>'`. Keep shared lighting sessions serial. On failure inspect the automatically collected manifest, saved tracks, expected/observed attachment, NDJSON, logs, screenshots and trace. Fix and rerun where authorized before asking the owner for manual testing. Do not weaken assertions, add skips, or list new expected failures.
8. Report **passed, failed, or blocked**, mode, source revisions/dirty state, scenario, artifact directory, and coverage gaps. Logs/traces may contain disposable lab credentials: keep artifacts local/restricted and redact before sharing. Do not present automated success as acceptance.
9. `node scripts/fullstack/lab.mjs stop` stops this lab while retaining volumes/evidence. Leave failures running only when useful for debugging, and say so. A stale `.lock` after an interrupted process must only be removed after verifying no lab command still owns it.
