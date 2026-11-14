# UDP lab verification

Scope: source-free lab protocol provisioning and J1 room-based playback
(`WATCH-002`, room placement under `ROOM-005`). This does not complete either
requirement's entire acceptance matrix or J1's traceability gate.

## Implementation

- Scenario bulbs support REST (default), WiZ, LIFX and Govee, including mixed rooms.
- Each UDP bulb has an isolated Docker IP/standard-port endpoint forwarding unchanged
  bytes to its own simulator listener. No published UDP ports or host networking.
- Protocol-aware receipts prove fresh RGB/intensity and power; every phase also
  checks simultaneous rendered state, unchanged bulbs, and Stop/off restoration.
- Scenario/script inputs remain temporary and excluded from collected evidence.
- Plugin regressions corrected: LIFX 36-byte wire headers/state parsing; LIFX/Govee
  power-on during nonzero playback; Govee playback does not await nonexistent turn
  ACKs and always sends initial brightness; WiZ zero-brightness channels stay off.
- Simulator regressions corrected: per-bulb UDP dispatch, LIFX sequence/state layout
  and single intensity scaling; Govee unicast state replies (not fabricated ACKs).

## Checks

- `npm test`: 123 passing unit/fixture tests.
- `npm run test:lab-network`: actual UDP relay bytes/order and independent replies
  for two simultaneous senders. Included in CI's unit job.
- `npm run check`: zero errors; two pre-existing ChannelManager accessibility warnings.
- Simulator `PYTHONPATH=src python -m unittest discover -s tests`: four passing tests;
  real UDP datagrams to two bulbs of each protocol, untouched neighbors, read replies,
  half-intensity rendering and malformed LIFX rejection.
- Plugin `dotnet test -c Release`: 122 passed, none skipped, on .NET 8.
- Formatting, shell syntax, Compose configuration and whitespace checks performed.

Initial validation found missing host aiohttp/.NET 8 runtime; use the existing
isolated Python test environment and an isolated .NET 8 SDK, not skips or weakened
runtime gates.

## Integrated evidence

Ephemeral mixed 5.0 case: LIFX blue at 80%, separate WiZ red/green at 60%/40%,
Govee cyan at 70%, REST magenta at 50%, staggered cues; unchanged lights asserted.
Both actual Emby Web and controlled real-session playback passed. Evidence is local
and restricted under `.emby-stack/labs/udp/artifacts/`; expected/observed JSON,
saved tracks, protocol receipts, relay/container logs and traces are retained, not
input scenario files. A wrong Govee brightness receipt failed even while the
expected rendered state was correct, confirming the command oracle is independent.

Build and runner source identities, including dirty hashes before commit, are in
those artifacts. The skill's earlier latency baseline is **REST-only**, not a UDP
latency measurement. Broadcast/multicast discovery, Identify, physical bulbs, and
all client/ownership workflows remain separate coverage.

## Outstanding gate

`npm run test:traceability` still fails these existing mappings: MODEL-003@unit,
MODEL-005@unit, MODEL-006@unit, MODEL-007@fixture/fullstack, ROOM-004@fullstack,
WATCH-002@fullstack, DONE-001@browser. None was skipped, relabeled merely to pass,
or added to expected failures. Broader legacy browser/live CI coverage was not
established by these focused checks.
