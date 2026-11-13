# Format proposals

`.lightfx` stays at protobuf version 1 for the requirements in [studio-requirements.md](studio-requirements.md). Nothing in that spec needs a schema change. This file is the only place a change is proposed.

## FP-1 — Tri-state power (deferred, not in L1)

**Status:** deferred. OQ-1 keeps `power_on` as a proto3 bool. This proposal is not part of the approved requirements.

`Keyframe.power_on` is a proto3 bool. The comment says false turns the bulb off, and it also says an unset false leaves power unchanged. Those two states cannot be told apart. `PlaybackSession` never reads the field. Drivers turn the bulb on when they set a color. Brightness 0 is what actually reads as dark.

L1 round-trips the bool and does not let it change preview color. See `KEY-014` and conflict C9.

Proposed replacement, for a later version if the owner accepts open question OQ-1:

- Add `PowerState power = 11` on `Keyframe`.
- Values: `POWER_UNSPECIFIED = 0` (leave the bulb's power alone), `POWER_ON = 1`, `POWER_OFF = 2`.
- Keep field 10 in old files. Readers treat a missing `power` as `POWER_UNSPECIFIED`. They do not infer off from `power_on == false`.
- The plugin applies `POWER_OFF` with the driver's power command, and `POWER_ON` before a color command.
- Studio writes `power` and stops writing a meaningful `power_on` once version 2 is the authoring version.

FP-1 was the only proto change proposed for `studio-requirements.md`. FP-2 and FP-3 below come from the first-journey design.

## FP-2 — Channel layout on the track (proposed, J1)

**Status:** proposed in [J1 — First light](../journeys/J1-first-light.md#proposed-lightfx-format-changes). Not approved.

Add `string channel_layout = 14` to `TrackMetadata`, with values `LAYOUT_AMBIENT`, `LAYOUT_2_0`, `LAYOUT_3_0`, `LAYOUT_5_0`. It is a string, like `spatial_hint`, so a later layout needs no schema change. Empty means the track predates layouts and readers infer the layout from channel hints. New validation codes: V-012 (known value) and V-013 (exactly one channel per layout position, by `spatial_hint`). `version` stays 1 because the field is additive.

## FP-3 — Canonical position hints (proposed, J1, comment only)

**Status:** proposed in [J1 — First light](../journeys/J1-first-light.md#positions). Not approved.

For tracks with a layout, `spatial_hint` is one of `SPATIAL_LEFT`, `SPATIAL_CENTER`, `SPATIAL_RIGHT`, `SPATIAL_SURROUND_LEFT`, `SPATIAL_SURROUND_RIGHT`, `SPATIAL_AMBIENT`. `SPATIAL_BEHIND_SCREEN` is read as Center. `SPATIAL_CEILING` and `SPATIAL_FLOOR` are reserved for a later layout and are read as Ambient until then. Only the proto comment changes.

## Considered and rejected — editor state inside the track

Scene markers and channel groups are not playback data. The recommendation, and the requirement, is a JSON sidecar next to the track: `{movieDir}/lightfx/{trackId}.studio.json`, written by `PUT /OpenLightFX/Studio/Projects/{trackId}`. Reasons are in conflict C5. A proto field for them was considered and rejected because the player would have to carry editor documents, and the current parser would not use them.
