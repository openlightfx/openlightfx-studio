---
name: test-openlightfx-local
description: Test local Studio/plugin checkouts in an isolated Emby lab with simulator command and rendered-state evidence.
---

# Local OpenLightFX testing

- Read repository instructions and `docs/testing/local-lab.md`; inspect all checkout states. Preserve existing work. Use only an isolated lab, never the hands-on server.
- Follow `scripts/fullstack/lab.mjs` lifecycle. Missing prerequisites block testing; rebuild stale product code explicitly.
- Define variations in temporary `OLFX_LAB_SCENARIO` inputs, not repository source. Use `OLFX_LAB_TEST_FILE` for custom workflows and `OLFX_LAB_PLAYBACK` to select playback mode. Follow the documented schema and inventory rules.
- Assert exact saved cues, fresh command receipts, rendered states and unchanged bulbs. Specify expectations independently; never weaken assertions to hide failures.
- Collect restricted results, then remove agent-created temporary inputs/scripts. The runner deletes its staging copies after runs, including failures; resupply inputs for subsequent runs. Never delete user-owned files. Stop the lab unless debugging requires it.
- REST latency baseline (Studio `9423f9c`; 24 runs/72 cues; mean±sample SD, cue-relative): Web command/rendered **392±184 / 658±185 ms**; controlled **226±102 / 489±102 ms**. Estimated video clock, not hardware or synchronization acceptance; remeasure after product changes.
- Report pass/fail/block, mode, source identity, evidence and gaps. Redact credentials before sharing. Tests do not establish owner acceptance. Commit, push or deploy only when authorized.
