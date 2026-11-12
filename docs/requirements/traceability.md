# Traceability

This file is the rule for connecting a requirement in [studio-requirements.md](studio-requirements.md) to a test. The checker is `docs/requirements/check-traceability.mjs`.

## Names

A test title contains the requirement id and one tier tag:

```text
MEDIA-006 @browser proxy seek lands within one GOP
KEY-010 @fixture linear blend at 750 ms
SAVE-002 @fullstack playback uses the saved track
```

Tags are `@unit`, `@fixture`, `@browser`, `@fullstack`, and `@realmedia`.

The `Tests` line on the requirement lists the tiers that apply. That line is the map. There is no second matrix.

## What the checker enforces

Run from the repo root:

```bash
node docs/requirements/check-traceability.mjs
```

With a result file:

```bash
node docs/requirements/check-traceability.mjs --report test-results/traceability.json
```

The checker always checks that every requirement has a layer, a status, a statement of one sentence, Given/When/Then text, a known area, and a known tier. It also checks the counts table.

Status values are `proposed`, `approved`, and `deferred`.

For each **approved L1** requirement it looks at every CI tier on the `Tests` line. CI tiers are `unit`, `fixture`, `browser`, and `fullstack`. `realmedia` is on demand and never fails CI.

- Without `--report`, each of those tiers needs a test title in `tests/`, `e2e/`, or `src/` that contains the id and `@tier`, and the title must not be a `.skip` call.
- With `--report`, that title must appear with `"status": "passed"`. Skipped and failed tests do not count.

`proposed` and `deferred` requirements do not fail the gate. This review leaves every requirement `proposed`, so CI stays green until the owner approves an L1 item and the implementation adds its tests.

A `deferred` L1 requirement is how the owner removes an item from the gate without deleting the text.

## Report shape

CI reduces Vitest and Playwright output to:

```json
{
  "tests": [
    { "name": "MEDIA-006 @browser proxy seek lands within one GOP", "status": "passed" }
  ]
}
```

`status` is `passed`, `failed`, or `skipped`.

## When CI runs it

`.github/workflows/requirements-traceability.yml` runs the checker on every pull request and on pushes to `master`. It does not pass `--report` until a later change approves L1 requirements and publishes test results. That later change must pass `--report` after the unit, fixture, browser, and fullstack jobs, and it must fail the workflow if this script exits 1.

Plugin tests live in `openlightfx-emby`. A dotnet test that covers a `PLUG` or `KEY` fixture uses the same id in its name. This repo's gate still requires the Studio test named on the `Tests` line. The plugin test is an extra copy of the same fixture, not a substitute for the Studio one.

## Counting

`node docs/requirements/check-traceability.mjs --print-counts` prints the counts table. Paste it over the table in the spec when requirements change. The checker fails if the table drifts.
