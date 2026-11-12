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

- Without `--report`, each of those tiers needs a test title in `tests/`, `e2e/`, or `src/` that contains the id and `@tier`, and the title must not be a `.skip` call. A call named `requirement('ID @tier …')` counts the same as `test` or `it`.
- With `--report`, that title must appear with `"status": "passed"`, unless `--allow-expected tests/expected-failures.json` lists `ID@tier`. A listed tier may be `"failed"`. Skipped tests do not count. A listed tier that comes back `"passed"` fails the gate so the id is removed from the list.

`proposed` and `deferred` requirements do not fail the gate. Every requirement in the spec is now `approved`, so the gate looks for a test per L1 CI tier. Features that are not built yet stay on the expected-failure list. The requirements report still shows those as failed.

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

`.github/workflows/requirements-traceability.yml` runs the checker on every pull request and on pushes to `main` and `master`. It runs once with no `--report` (a missing test fails the job) and again with `--report` and `--allow-expected` after the unit, fixture, browser, and fullstack tests publish `test-results/traceability.json`. The workflow fails if this script exits 1. The realmedia tier is not part of that report.

Plugin tests live in `openlightfx-emby`. A dotnet test that covers a `PLUG` or `KEY` fixture uses the same id in its name. This repo's gate still requires the Studio test named on the `Tests` line. The plugin test is an extra copy of the same fixture, not a substitute for the Studio one.

## Counting

`node docs/requirements/check-traceability.mjs --print-counts` prints the counts table. Paste it over the table in the spec when requirements change. The checker fails if the table drifts.
