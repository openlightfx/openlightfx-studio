# AGENTS.md — OpenLightFX Studio

Read this whole file before you change anything. Then read the journey spec for the step you are working on. If a task brief and this file disagree, stop and ask; do not guess.

The companion plugin repository is [openlightfx/openlightfx-emby](https://github.com/openlightfx/openlightfx-emby). Its `AGENTS.md` covers the C# side. Most Studio work touches both.

## 1. What OpenLightFX is for

A **track** (`.lightfx`) is lighting written once for one movie. A **room** is a real space with one screen and some smart bulbs. **Studio** (this repo) is where a person writes a track and previews it on their own bulbs. The **Emby plugin** plays the track in whichever room is watching the movie.

The person using Studio owns an Emby server, a TV, and some WiZ, LIFX, Hue, or Govee bulbs. They are not a developer. They should never paste JSON, never open the Emby plugin settings page, and never wire a channel to a bulb by hand.

## 2. Why this file exists

The previous rebuild had 158 green browser tests and was unusable: no way to add channels, a vanished File menu, an "Overview" bar duplicating the seek bar, a timeline that could not move the playhead, and buttons that did nothing. Two causes:

1. Screens were built before the journey through them was written down.
2. Agents worked from one-paragraph briefs, without this context, and treated "tests pass" as "done".

So: **the journey spec is the source of truth and screens follow it. A step is done when its required automated checks pass, including the isolated local Emby lab where applicable.**

## 3. The journey (J1 — First light)

Spec: [`docs/journeys/J1-first-light.md`](docs/journeys/J1-first-light.md). Wireframes: [`docs/journeys/wireframes/`](docs/journeys/wireframes/). Summary:

1. **Set up bulbs** (`#/bulbs`). Discover each light, Identify it, give it a durable user-chosen name, and keep it in the server's bulb inventory. Discovery, Identify, and naming live here.
2. **Set up a room** (`#/rooms`). Pick its screen from Emby devices and place named bulbs on the top-down room diagram. Unnamed bulbs cannot be placed; a room can be saved empty.
3. **Pick a movie** (`#/library`). Searchable poster grid of Emby movies. Movies only, no TV.
4. **Open or create a track** (`#/movie/{itemId}`). List the movie's tracks, or create one with a layout (suggested from the room). Open from a `.lightfx` file. Marketplace is a plain-text "coming later" note, never a control.
5. **Edit** (`#/edit/{itemId}/{trackId}`). One timeline whose ruler is the only scrubber. Click the ruler to move the playhead; click a lane to add a keyframe. Lanes are channels, labeled with the position and the room bulbs they reach. Room picker plus a Lights switch for live preview. File menu: New, Open, Open file, Save, Export, Close. Edit menu: Undo, Redo, Delete, Track settings.
6. **Watch in Emby.** This step is deferred and incomplete: it saves, makes the track active for the movie, and opens the movie in Emby, but `WATCH-001`, `WATCH-002`, and whole-J1 acceptance remain outstanding.

With no bulbs or rooms, steps 3–5 still work: the editor shows "Set up a room to preview on your lights" and the preview controls are disabled with a reason. Step 6 remains incomplete and its deferral is not acceptance.

Other journeys (effects authoring, marketplace, TV, settings) are **out of scope** until J1 is done and the owner says otherwise.

## 4. Domain model

| Term     | Meaning                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Room     | Name, exactly one screen, its bulbs. Stored by the plugin in `rooms.json`.                                                   |
| Screen   | An Emby playback device (`deviceId`). In at most one room.                                                                   |
| Bulb     | One light. In exactly one room (or none = not used), at one position, with an optional Follows override.                     |
| Position | Left, Center, Right, Surround Left, Surround Right, Ambient.                                                                 |
| Layout   | A fixed set of positions: Ambient, 2.0 (L R), 3.0 (L C R), 5.0 (L C R SL SR).                                                |
| Track    | A `.lightfx` file for one movie, with one layout. Its channels are exactly the layout's channels.                            |
| Channel  | One lane. Stands for a position, never a bulb. Ids: `left`, `center`, `right`, `surround-left`, `surround-right`, `ambient`. |

**Channels and bulbs are joined only by positions.** Routing (fold-down when a room lacks a position, fill when a track lacks one, mixing when a bulb gets several channels, and Follows overrides) is computed **by the plugin only** (`RoomRouter`). Studio asks `GET /OpenLightFX/Studio/Rooms/{roomId}/Routing` to label lanes and sends channel states to preview; it never contains a fold-down table. The tables live in the J1 spec § Routing and the shared fixture `tests/fixtures/routing/cases.json`.

There is no free-form "Add channel". Changing the layout adds or removes channels. Mapping profiles are retired.

## 5. Architecture

- **Studio is a static SvelteKit (Svelte 5) SPA**, built with `@sveltejs/adapter-static`, zipped, and embedded in the plugin DLL. The plugin serves it at `/emby/OpenLightFX/studio/`. There is no Studio server. Do not add one.
- **Auth:** The static SPA shell contains no user data and loads without a token. Studio reads the current Emby Web server credential from same-origin `servercredentials3` storage (or accepts `?api_key=` for compatibility), then calls `GET /OpenLightFX/Studio/Session`; the plugin validates that token or redeems a short-lived HttpOnly page ticket and returns the token with `Cache-Control: no-store`. Studio keeps it in memory and sends `X-Emby-Token` to API routes. Writes need the Emby Admin role. Edit-proxy media uses a separate scoped cookie ticket.
- **Plugin API** (all under `/emby`): today `/OpenLightFX/Studio/Items`, `Items/{id}/MediaInfo`, `Items/{id}/Proxy` and `Proxy/Media`, `Items/{id}/Frame`, `Tracks`, `Tracks/{id}` (GET/PUT with `If-Match`), `Projects/{id}` (sidecar), `Preview/Start|Frame|Stop`. J1 adds Setup, Rooms, Devices, Discover, Bulbs, Identify, Routing, ActiveTrack and changes Preview to take a room and channel states. Legacy pasted configuration and import APIs are removed. Design: openlightfx-emby `docs/design/rooms-api.md`.
- **Video:** Studio never plays the source file. The plugin builds an H.264 fragmented-MP4 **edit proxy** (GOP ≤ 500 ms, HTTP Range) per movie and Studio plays it while it is still encoding (`MediaInfo.proxy.state`: missing, building with `encodedThroughMs`, ready, failed with `reason`). `src/lib/studio/proxy-playback.ts` handles this. Keep it.
- **Preview:** Studio samples channel state at the playhead and POSTs coalesced frames to the plugin, which drives the bulbs through the same drivers as playback. Preview refuses while Emby playback owns the bulbs (409 `playback_active`) unless the person takes over.
- **Track format:** `proto/lightfx.proto` (protobuf, format version 1). It must stay byte-identical to the plugin's `src/OpenLightFX.Emby/Proto/lightfx.proto`. Proposed changes go in `docs/requirements/format-proposals.md` first (FP-2 adds `channel_layout`).
- **Save:** `PUT /OpenLightFX/Studio/Tracks/{trackId}` writes `{movieDir}/lightfx/{trackId}.lightfx` after the plugin validates it (V- codes); `PUT …/Projects/{trackId}` writes the `.studio.json` editor sidecar. Crash copies go to IndexedDB.

## 6. Repository layout

| Path                                             | What                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/journeys/`                                 | Journey specs (start here) and wireframes. `wireframes/render.mjs` renders `src/*.html` to PNG.                                                                                |
| `docs/requirements/studio-requirements.md`       | Approved cross-cutting requirements (IDs like `MEDIA-003`), journeys J1–J5 of the earlier spec, test strategy. J1-first-light lists which of these it keeps or supersedes.     |
| `docs/requirements/check-traceability.mjs`       | The traceability gate.                                                                                                                                                         |
| `docs/requirements/format-proposals.md`          | Proposed `.lightfx` changes.                                                                                                                                                   |
| `docs/testing.md`                                | Test tiers and commands in detail.                                                                                                                                             |
| `src/lib/domain/`                                | Pure logic: sampling, Kelvin, validation, protobuf round-trip, safety, snapping, shortcuts. Unit-tested. Keep.                                                                 |
| `src/lib/api/`                                   | Plugin client and types. `mock.ts` is for unit tests only.                                                                                                                     |
| `src/lib/studio/`                                | Proxy playback and session. Keep.                                                                                                                                              |
| `src/lib/components/`, `src/routes/`             | The current editor UI. **It is being replaced** by the J1 screens. Do not patch it to "fix" J1; build the J1 screen from the spec and wireframe, then delete what it replaces. |
| `src/lib/effects/`                               | TypeScript effect renderers transcribed from the plugin; tested against shared fixtures.                                                                                       |
| `proto/lightfx.proto`                            | Track format, mirror of the plugin's.                                                                                                                                          |
| `tests/unit`, `tests/fixture`, `tests/fixtures/` | Vitest tiers and shared fixtures (copied byte-for-byte into the plugin repo).                                                                                                  |
| `e2e/browser`, `e2e/fullstack`, `e2e/realmedia`  | Playwright tiers. `e2e/pages/` holds page objects. `e2e/harness/requirement.ts` wraps tests by requirement ID.                                                                 |
| `tests/expected-failures.json`                   | `"REQ-ID@tier"` entries allowed to fail until built. Currently empty. Keep it that way for real bugs.                                                                          |
| `scripts/fullstack/`                             | Full-stack runner and Emby first-run setup.                                                                                                                                    |
| `scripts/media/generate-clips.sh`                | Synthetic test movies.                                                                                                                                                         |
| `docker-compose.fullstack.yml`                   | Emby 4.9.3.0 + headless `openlightfx-simulator`.                                                                                                                               |

`electron:*` scripts and `docker-compose.{dev,prod,ci}.yml` are leftovers from an earlier design and are not used.

## 7. Verification and acceptance

Testing is the exit criterion for journey steps and user-visible changes. Run the required automated checks for the changed requirements, including the isolated local Emby lab for integrated Studio/plugin/playback behavior; use `docs/testing.md` and `docs/testing/local-lab.md` to select and run them. A step is complete only when its required tests and traceability checks pass and evidence is recorded. Do not substitute manual testing or owner sign-off for missing automated coverage. Manual hardware testing may provide additional evidence, but is not the acceptance gate.

## 8. Running things

Node 22. From the repo root:

```bash
npm ci
npx playwright install chromium firefox
npm run check                 # svelte-check, must be clean
npx prettier --check .        # formatting, CI-enforced
npm run test:traceability     # requirement gate
npm test                      # unit + fixture (Vitest)
npm run test:browser          # Playwright, Chromium and Firefox, against `vite preview`
npm run media:generate        # synthetic clips (ffmpeg)
OLFX_FULLSTACK_REQUIRE=1 npm run test:fullstack   # real Emby + plugin + simulator
node docs/journeys/wireframes/render.mjs           # re-render wireframe PNGs
```

**Full stack** (`scripts/fullstack/run.sh`) needs Docker, the .NET 8 SDK, ffmpeg, and the private `openlightfx-simulator` repo cloned into `docker/simulator-src` (a local clone of `openlightfx/openlightfx-simulator` can be copied there). It boots `emby/embyserver:4.9.3.0` on `localhost:8096`, builds the plugin from `openlightfx-emby` `main` (override with `OLFX_EMBY_BRANCH`, or put a checkout at `.emby-stack/emby/src`) with this Studio build embedded, ILRepacks it, installs it, runs Emby first-run setup, starts the simulator headless (`--no-gui`, NDJSON on stdout, `command_received` events), and runs `e2e/fullstack` in Chromium and Firefox. The Emby SDK DLLs come out of the container; the plugin repo's `scripts/fetch-sdk.sh` does the same for a standalone plugin build. Missing prerequisites now fail the runner rather than silently passing. For isolated agent-driven testing with explicit local checkouts, use `node scripts/fullstack/lab.mjs start|status|reset|run|collect|stop` and read `docs/testing/local-lab.md` and `.agents/skills/test-openlightfx-local/SKILL.md`. The default lab uses loopback ports 18096/19202 and never changes the existing default Compose stack or hands-on server. The full-stack harness seeds its simulator room into the disposable Docker room store; it must never use pasted bulb or mapping settings.

**Real media** (`npm run test:realmedia`, J5 of the old spec) runs only locally on the maintainer's machine with the real movie files, and only when the owner asks.

CI (`.github/workflows/requirements-traceability.yml`) runs traceability, `npm run check`, prettier, unit, browser (both browsers), media generation, and `docker compose config`. When `SIMULATOR_TOKEN` is available, a separate job provisions and runs the isolated Emby lab's controlled-session and actual Emby Web golden paths; otherwise live coverage is explicitly unavailable.

## 9. Workflow

- `main` is the only long-lived branch. Branch from it (`feat/…`, `fix/…`, `design/…`), open a PR to it. Keep PRs to one journey step or one fix.
- Plugin and Studio changes that depend on each other land as a pair of PRs that link each other; plugin first, since the full stack builds the plugin from `main`.
- Do not merge your own PR unless the owner has said to. Design PRs (`design/…`) are always merged by the owner.
- PR description: the requirement IDs, what a person will see, and anything you could not verify.
