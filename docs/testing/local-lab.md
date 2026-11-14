# Isolated local Emby lab

The local lab builds the **current local Studio and plugin checkouts**, including dirty work, into disposable Docker Emby 4.9.3.0. It uses the real plugin and headless [OpenLightFX simulator](https://github.com/openlightfx/openlightfx-simulator), not mocked Studio APIs. Its automated scenarios and collected evidence are part of the exit criteria for integrated behavior; they do not claim physical hardware accuracy.

## Prerequisites

Linux, Node 22/npm dependencies, Docker Compose, .NET 8 SDK, Python 3, ffmpeg/ffprobe, zip, and Playwright Chromium (`npx playwright install chromium`). Clone the private simulator into `docker/simulator-src`; use a revision including the opt-in observation interface. Keep the plugin checkout at `../openlightfx-emby`, or set `OLFX_EMBY_REPO`. No remote server credentials are needed.

## Lifecycle

```bash
# Optional: select a different disposable lab and unused host ports.
export OLFX_LAB_ID=agent
export OLFX_LAB_PORT=18096
export OLFX_LAB_CONTROL_PORT=19202
export OLFX_EMBY_REPO="$(realpath ../openlightfx-emby)"

node scripts/fullstack/lab.mjs start
node scripts/fullstack/lab.mjs status
node scripts/fullstack/lab.mjs run
OLFX_LAB_PLAYBACK=web node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop

# Destructive refresh: only this lab's containers, volumes, and synthetic media.
node scripts/fullstack/lab.mjs reset
```

Host ports bind to `127.0.0.1`. The project is always `olfx-lab-<id>`, not Studio's existing default Compose project. Media, manifests and evidence live in `.emby-stack/labs/<id>/`; generated movies never use the owner's media directory. Missing prerequisites and failed builds/tests return nonzero. A lock prevents concurrent operations on the same lab. Different labs require different ports; simultaneous Studio builds are not supported.

`start` refuses to refresh an existing container. `reset` is the explicit rebuild after source changes. `stop` removes containers/network but retains data and evidence. The simulator test-control port is unauthenticated: it is opt-in, exposed only on loopback, and must not be published on an untrusted network. Emby's synthetic admin password is `openlightfx-test`; `session.json` holds restricted disposable tokens and is never copied into collected artifacts. Logs and Playwright traces can nevertheless contain those tokens, so evidence directories are restricted and must be redacted before sharing.

## Golden scenario and evidence

`tests/fixtures/lab/stereo.json` contains independently specified channel keyframes and expected bulb colors/brightness/power. `e2e/fullstack/lab.spec.ts`:

1. Registers a screen, removes this disposable lab's old rooms, and creates an L/R room through Studio's UI using known REST fixture bulbs.
2. Creates a 2.0 track through Studio, enters timed keyframes, clicks Watch in Emby, and verifies the saved protobuf values and Emby item tab.
3. Either reports a controlled session through real Emby APIs, or signs into Emby Web and proves an actual video element is playing.
4. Checks that **both bulbs simultaneously** reach red/blue, then green/blue, using resulting simulator state samples after a fresh cursor.
5. Stops playback and waits for both bulbs to restore to the off baseline before the next scenario; attaches the authored track and expected/observed samples. Emby Web uses its real Stop keyboard shortcut because merely closing a tab does not reliably report stopped playback.

`run` uses the dedicated serial `fullstack-lab` Playwright project. It accepts additional Playwright arguments, such as `run --grep 'LAB-'`. The legacy Chromium/Firefox full-stack suite remains separate. The lab collects a build identity manifest (revisions, dirty status, tracked diffs and hashes including untracked source files), build log when available, room configuration, saved tracks/sidecars, simulator NDJSON, bounded recent container logs plus Emby's runtime/plugin logs, result JSON with current runner identity, and Playwright screenshots/traces/attachments. Requirement outcomes go to `test-results/outcomes-fullstack-lab-<id>.jsonl`, separate from browser results and from other isolated lab IDs. Failed labs remain available for inspection. Artifacts record build-time sources: changing code afterward does not update the embedded DLL until reset.

## Source-free scenario variations

Agents must not edit repository source merely to encode a new test case. Supply a
temporary local JSON file instead, following the schema below. Do not add an
agent's one-off scenario to the repository. For example, after creating the input:

```bash
export OLFX_LAB_ID=three OLFX_LAB_PORT=18098 OLFX_LAB_CONTROL_PORT=19204
export OLFX_LAB_SCENARIO=/tmp/my-scenario.json
node scripts/fullstack/lab.mjs start
node scripts/fullstack/lab.mjs run
OLFX_LAB_PLAYBACK=controlled node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs stop
```

The configured room inventory is provisioned with independent REST or UDP bulbs.
Scenario labs automatically select `fullstack-lab-scenario`; playback defaults to
actual Emby Web video.

The strict schema in `scripts/fullstack/scenario.mjs` accepts:

- `name`, `movie` (exact name of a generated lab movie).
- `room`: `name` and 1–32 `bulbs`, each with a unique `id`, unique `name`,
  `position`, optional `follows`, and optional `protocol` (`rest`, the default;
  `wiz`, `lifx`, or `govee`). Positions/Follows are canonical position IDs.
  Listener ports are allocated automatically, reserving 9202 for observation. No
  pasted plugin settings or legacy channel-to-bulb mappings are used.
- `track`: `title`, `layout` (`Ambient`, `2.0`, `3.0`, `5.0`), and `keyframes` with
  `channel`, integer `timeMs`, `color` (`#RRGGBB`), `brightness` (0–100), optional
  `interpolation` (`STEP`/`LINEAR`) and `transitionMs`. Cues must fit the movie and
  respect Studio's current 200 ms minimum spacing on the same channel.
- `expectations`: ordered phases with `name`, bounded `withinMs`, and independent
  `bulbs` states for **every bulb**, including unchanged lights. Each state has
  `color`, `brightness`, and boolean `power`. Optional `holdMs` checks sustained
  state. Optional `minElapsedMs`/`maxElapsedMs` constrain observed video-relative
  timing (controlled mode uses the session-start clock). Do not invent timing
  allowances just to pass a failure.
- Each phase may include `commands`: expected `bulbId`, `color`, `brightness`,
  `power`, and optional elapsed bounds. These require fresh receipts after the
  previous phase, not a stale match from earlier playback. Command receipt alone
  never substitutes for the rendered-state check.

Unknown fields, missing bulbs, invalid colors/times/layouts, duplicate/too-close
cues, and malformed expectations fail rather than being silently ignored. The
runner temporarily stages the scenario, validates exact saved protobuf values,
records per-phase measurements, performs a negative oracle check, and waits for
all bulbs off after Stop. Expectations never call production routing/sampling.

With the same bulb inventory, vary layouts, cue values, timing, positions,
Follows, or expectations at **run time, without rebuilding or editing source**:

```bash
OLFX_LAB_SCENARIO=/tmp/my-scenario.json node scripts/fullstack/lab.mjs run
```

A changed bulb inventory **or protocol** requires a new lab or explicit `reset` with the new
scenario. That reprovisions isolated fixtures; it does not require source edits.
Results retain expected cues/states, observations, and built-source/current-runner
identity, **not scenario/script input files**. Runner-owned staging copies are
deleted in the run's final cleanup on success, failure, or collection errors, and
on Stop. Resupply `OLFX_LAB_SCENARIO` for each subsequent run after cleanup. The
manifest retains only fixture inventory needed to check compatibility.

Agents must delete their own temporary input files/scripts once results are
collected, including on failure; never delete caller-owned files without permission.
Durable fixtures belong only to deliberately maintained regression tests, not
one-off agent scenarios.

### UDP fixture isolation and assertions

WiZ, LIFX, and Govee use the real plugin UDP drivers. Each UDP bulb gets a
separate Docker-only endpoint IP on the lab's **internal** `bulbs` network. A
byte-preserving relay listens on the protocol's standard port and forwards to a
unique, bulb-scoped simulator listener. This avoids the old shared-listener
fallback that could send one unicast command to every same-protocol bulb.
Emby and simulator also use the lab's normal bridge for UI/control access.
**No UDP ports are published, no host networking is used, and scenarios cannot
supply LAN addresses or ports.** Endpoint readiness is checked and logs collected.
No additional simulator checkout or pasted plugin configuration is needed.

The room seed stores protocol-specific configs using only these dynamically
resolved isolated IPs. Studio still places bulbs by positions/Follows; neither the
seed nor the scenario contains channel-to-bulb mappings. UDP state-read replies
(`getPilot`, `GetColor`, `devStatus`) traverse the same endpoint back to the driver.

Command assertions inspect actual protocol fields, not REST-shaped assumptions:

- WiZ: fresh `setPilot`, RGB, mapped dimming and power; brightness allows only
  quantization error from integer dimming.
- LIFX: fresh standard `SetColor` HSBK packet plus current-playback `SetPower`
  evidence. Compare emitted RGB/intensity; brightness is applied once, not twice.
  Simulator state separates chroma from HSBK intensity: for example, gray may be
  represented as white at reduced brightness. Specify bulb expectations in that
  representation; exact authored RGB/brightness remain checked in the saved track.
- Govee: fresh color plus latest current-playback brightness/turn receipts. Split
  packets and unchanged brightness/power are retained as proof, not assumed.

Every phase still asserts all bulbs' rendered state, including unchanged
neighbors, and Stop/off restoration. Receipts are bounded by the observed sample;
wrong protocol, bulb, brightness, power, or stale playback evidence fails. Raw
packet-intent evidence is attached for diagnosis. The simulator's Python UDP
regression sends actual datagrams to two bulbs of each protocol, checks untouched
neighbors, state replies, LIFX layout/intensity, and malformed-packet rejection.

The generic playback scenarios provide **known-bulb unicast playback coverage**,
not discovery or hardware certification. The focused J1 Step 1 regression below
separately exercises Find bulbs. REST latency measurements do not apply to UDP.

For UDP labs, a short-lived `discovery-network` helper runs with `NET_ADMIN` in
only the disposable Emby container's network namespace after its final startup.
Docker's internal bridge drops limited broadcasts outside its subnet. The helper
routes `255.255.255.255` through the bulb interface and translates WiZ/LIFX discovery
destinations to that interface's directed broadcast. The private source address
and broadcast must both belong to the internal bulb subnet. It does not change
host routes/firewall rules, publish UDP, use host networking, or grant privileges
to the Emby process. Protocol bytes and simulator responses remain unchanged.

### J1 Step 1 regression

The maintained four-WiZ fixture and serial suite test actual discovery probes and
responses, metadata shown in Studio, one bulb already in Bedroom, Identify to only
the selected bulb, and the room lifecycle. It does not play a movie.

```bash
export OLFX_LAB_ID=j1-rooms OLFX_LAB_PORT=18110 OLFX_LAB_CONTROL_PORT=19214
export OLFX_LAB_SCENARIO="$PWD/tests/fixtures/lab/room-identify.json"
export OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step1.spec.ts"
export OLFX_LAB_PLAYBACK=room-setup
node scripts/fullstack/lab.mjs start
node scripts/fullstack/lab.mjs run
# A fresh inventory/room seed is required before repeating the ordered suite.
node scripts/fullstack/lab.mjs reset
OLFX_LAB_BROWSER=firefox node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

`OLFX_LAB_BROWSER` selects Chromium (default) or Firefox for this maintained suite.
See [Step 1 verification](j1-step1-verification.md) for its outcome-based gate.

### J1 Step 2 regression

`e2e/fullstack/lab-j1-step2.spec.ts` maintains a movie-picking regression with three
movies and one series/episode in separate disposable Emby libraries. It verifies
movies-only results, pagination, real poster delivery, saved/active track badges,
search, mouse/keyboard navigation, sorting persistence and the no-room link.
It requires no bulb scenario and does not play a movie or send lighting commands.

Run with `OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step2.spec.ts"` and
`OLFX_LAB_PLAYBACK=library`; `OLFX_LAB_BROWSER=firefox` selects its Firefox run.
Use a fresh lab or reset before each final run.

### J1 Step 3 regression

`e2e/fullstack/lab-j1-step3.spec.ts` verifies saved-track metadata/active selection,
opening, suggested-layout creation with no writes until Save, no-room creation,
room selection for editor preview, real file import/validation, and the marketplace
note. It reuses `model-006-follows.json` for its three-bulb inventory only, not
playback or rendered-light assertions. No bulb commands or video playback are
part of this room/track setup suite.

Run with that fixture as `OLFX_LAB_SCENARIO`,
`OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-step3.spec.ts"`, and
`OLFX_LAB_PLAYBACK=track-setup`. `OLFX_LAB_BROWSER=firefox` selects Firefox.
Reset before each final run because the serial suite creates saved tracks.
See the [Step 3 verification record](j1-step3-verification.md) for exact commands,
source identities, restricted evidence and the outcome-based traceability gate.

### Arbitrary test behavior without repository edits

For actions beyond declarative author/play/observe phases, provide an external
Playwright TypeScript file via `OLFX_LAB_TEST_FILE=/tmp/my-test.spec.ts`. The runner
temporarily copies it into the restricted lab directory, selects
`fullstack-lab-custom`, runs it serially, and deletes that copy after collecting
results. Custom traces do not embed test source files. It can use the normal Playwright APIs,
the lab environment, and reusable `runLabScenario` from `e2e/lab/scenario.ts`.
Imports resolve from `.emby-stack/labs/<id>/custom.spec.ts`; for example:

```ts
import { test, expect } from '@playwright/test';
import { runLabScenario } from '../../../e2e/lab/scenario';

test('external variation', async ({ page, request }, testInfo) => {
  await runLabScenario(page, request, testInfo);
  const response = await request.get(`${process.env.OLFX_SIMULATOR_CONTROL_URL}/state`);
  expect(response.ok()).toBeTruthy();
});
```

This escape hatch supports new pause/seek/ownership/other workflows without
patching the test framework for each variation. It does not automatically make
those workflows covered: the external test must explicitly exercise and assert
them. Framework/product bug fixes are separate from test-case data changes.
This interface and its passes establish evidence only for the behaviors explicitly exercised; they do not establish physical hardware accuracy.

## J1 routing and room regressions

`tests/fixtures/lab/model-006-follows.json` is a maintained routing regression fixture, and `e2e/fullstack/lab-j1-model-routing.spec.ts` uses it to verify the plugin's rendered mix for a Center bulb following Ambient, room deletion/unplacement and screen reuse, and persistence of a renamed bulb plus Follows after reload. Run it in a fresh isolated lab because bulb renames persist in the disposable plugin database:

```bash
export OLFX_LAB_ID=j1-routing OLFX_LAB_PORT=18100 OLFX_LAB_CONTROL_PORT=19206
export OLFX_LAB_SCENARIO="$PWD/tests/fixtures/lab/model-006-follows.json"
node scripts/fullstack/lab.mjs start
OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-model-routing.spec.ts" node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

The Follows case uses three independent REST simulator bulbs and asserts the exact brightness-weighted output for all three bulbs. The screen-reuse assertion saves a replacement room on the deleted room's device; the rename regression runs last because a bulb rename is retained by the disposable plugin store. The suite also checks `TRACK-002` against the room's suggested layout before creating a track.

For the genuinely empty, first-run state, use a fresh lab without a scenario (do not seed a room fixture):

```bash
export OLFX_LAB_ID=j1-first-run OLFX_LAB_PORT=18102 OLFX_LAB_CONTROL_PORT=19208
node scripts/fullstack/lab.mjs start
OLFX_LAB_TEST_FILE="$PWD/e2e/fullstack/lab-j1-first-run.spec.ts" node scripts/fullstack/lab.mjs run
node scripts/fullstack/lab.mjs collect
node scripts/fullstack/lab.mjs stop
```

## Observation contract

With simulator `control_port` enabled:

- `GET /health`: readiness and bulb inventory, only after protocol startup.
- `GET /state`: latest normalized RGB/brightness/power, effective displayed RGB, transition flag and timestamp.
- `POST /reset`: cancels transitions and sets every bulb black, brightness zero, power off; clears history and returns a new cursor.
- `GET /events?after=<event_id>`: 30 Hz state samples after a monotonically increasing cursor. History is bounded to 3,600 samples; an expired cursor returns 409 instead of silently missing evidence.

Headless mode advances transitions at 30 Hz even when this API is disabled. `state_sample` NDJSON uses the same state cursor. `command_received.params` is diagnostic **command intent**, not proof of illumination. The oracle in `scripts/fullstack/observations.mjs` rejects stale samples, missing/wrong bulbs and wrong colors; it checks brightness, power and optional displayed RGB with tolerances. Its negative unit tests intentionally assert impossible results.

## Boundaries and next coverage

The lab verifies room setup, UI authoring/save/activation, controlled playback and actual Emby Web playback with observed REST, WiZ, LIFX and Govee lights. It does **not** claim:

- discovery for every protocol: the focused Step 1 suite verifies WiZ broadcast discovery and selected-bulb Identify. Generic playback scenarios still use known seeded bulbs; LIFX/Govee discovery and physical hardware are not certified. Never use host networking that could discover or flash the owner's bulbs.
- exhaustive routing/fade/pause/seek/ownership coverage: use reviewed routing fixtures and add focused scenarios; the existing full-stack suite already exercises subsets, mostly at command level.
- physical hardware accuracy or TV clients.

Simulator protocol fidelity remains a separate concern. For example, brightness scales differ across WiZ/LIFX/Hue, so protocol tests should validate normalized rendered state with justified tolerances rather than copying REST expectations.

The [implementation verification record](local-lab-verification.md) lists the initial
passes, failed broader checks and remaining scope. The [UDP verification record](udp-lab-verification.md)
covers mixed protocols and companion driver fixes. `npm run test:lab-network`
checks relay byte preservation/order and independent replies; simulator regressions
below exercise actual protocol datagrams.

## Simulator regression tests

From its checkout, with Python and aiohttp installed:

```bash
PYTHONPATH=src python -m unittest discover -s tests
```

The tests launch real headless subprocesses with and without the opt-in API, send nonzero REST fades, check intermediate and final rendered state/brightness, require `transition_end`, and exercise baseline reset, transition cancellation, malformed cursors and expired observation windows.
