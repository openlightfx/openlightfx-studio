# J1 Steps 1–2 — bulb inventory and room setup verification

## Status: implementation in progress; not accepted as complete

The Bulbs-first flow and named-bulb-only Rooms behavior are implemented and have passing browser and isolated-lab coverage. This is not a completion claim: the Govee changed-IP simulator regression listed in the journey/API design is still pending, physical Govee identity captures are unavailable, and the global traceability gate still reports outstanding requirements. J1 Step 6, Watch in Emby, remains deferred and incomplete.

## Changes verified

- Bulbs has its own first-run route for discovery, Identify, durable user names, and forgetting unassigned bulbs.
- Rooms exposes named inventory only; the plugin rejects unnamed assignments and preserves names and placement across rediscovery/identity upgrades.
- WiZ/LIFX use protocol-scoped normalized MAC identity. Govee's LAN `device` value is persisted as an opaque hardware identifier, not as a MAC; legacy IP records can be upgraded without losing the user name or room placement.
- The simulator already emulates Govee LAN discovery and UDP 4003 commands. The additional test-list item is to restart/reconfigure it with the same simulated Govee identity at a changed IP and verify identity/name/placement preservation plus IP refresh. No simulator protocol change has been made.
- Hue is not yet integrated into this inventory flow: Studio discovery currently excludes Hue. Its planned identity is bridge ID plus per-light ID, with bridge credentials kept server-side.

## Automated results

| Check                                                                                      | Result                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                            | 0 errors; 2 existing Svelte accessibility warnings in `ChannelManager.svelte`                                                                                  |
| `npx prettier --check .`                                                                   | Passed                                                                                                                                                         |
| `npm test`                                                                                 | 143 passed                                                                                                                                                     |
| `npm run test:browser`                                                                     | 292 passed across Chromium and Firefox                                                                                                                         |
| Plugin tests (`DOTNET_ROLL_FORWARD=Major dotnet test …`)                                   | 137 passed; .NET 10 is installed, so roll-forward was needed for the net8.0 test runner                                                                        |
| Scoped traceability for FLOW-001–004, BULB-001–004, changed ROOM requirements, and LIB-004 | Passed; 168 requirement blocks validated                                                                                                                       |
| Isolated J1 Step 1 lab (`lab-j1-step1.spec.ts`, Chromium)                                  | 11 passed: WiZ discovery, Identify, durable naming/Forget, and room setup                                                                                      |
| Global `npm run test:traceability`                                                         | Still fails on `MODEL-003@unit`, `MODEL-005@unit`, `MODEL-006@unit`, `MODEL-007@fixture`, `MODEL-007@fullstack`, `WATCH-002@fullstack`, and `DONE-001@browser` |

## Isolated-lab evidence

The isolated lab used the local Studio/plugin checkouts, the maintained four-WiZ fixture, Chromium, and `OLFX_LAB_PLAYBACK=room-setup`. Evidence was collected under the restricted local directory:

`.emby-stack/labs/j1-bulbs/artifacts/2026-11-15T04-24-39.532Z`

The lab was stopped after collection. This verifies the new setup path against WiZ and the simulator; it is not Govee identity or physical-hardware evidence.

## Remaining work

1. Add the planned Govee lab regression: keep the simulated `device` identity fixed, change its configured IP between discovery runs, and assert the stored ID, user name, and room placement remain stable while the IP updates. Extend lab orchestration if needed; the simulator already emits the required discovery response.
2. Validate real Govee scan identifiers across multiple devices, including same-SKU bulbs and an IP change. Until then, make no universal DHCP-stability claim for Govee.
3. Integrate Hue bridge pairing and per-light inventory into Studio before claiming the repository's Hue support is covered by the Bulbs-first journey; keep bridge credentials server-side.
4. Resolve the global traceability gaps without treating deferred Watch in Emby coverage as completed. Keep `WATCH-002` and isolated playback-routing coverage outstanding; their absence prevents whole-J1 acceptance.
