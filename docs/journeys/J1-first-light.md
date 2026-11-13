# J1 — First light

**Status:** draft for owner review. Nothing in this document is approved, and no code is written against it until it is.

**Wireframes:** [docs/journeys/wireframes/](wireframes/). **Plugin API:** [openlightfx-emby `docs/design/rooms-api.md`](https://github.com/openlightfx/openlightfx-emby/blob/main/docs/design/rooms-api.md). **Agent guide:** [AGENTS.md](../../AGENTS.md).

## Why this document exists

The previous Studio rebuild passed 158 browser tests and was still unusable: there was no clear way to add a channel, the File menu vanished, an "Overview" bar duplicated the video seek bar, the timeline could not move the playhead, and most buttons below the timeline did nothing. The screens were built before anyone wrote down the path a person takes through them, and "all tests pass" was treated as "ready".

This document is that path, written first. It covers one journey end to end. Every screen, control, empty state, and error in it exists because a step of the journey needs it. Anything not needed by this journey is listed under [Out of scope](#out-of-scope) and is not built.

## What OpenLightFX is for

A **track** is lighting written once for one movie. A **room** is a real space with one screen and some smart bulbs around it. **Studio** is where you write a track and see it on your own bulbs while you work. The **Emby plugin** plays that track in whichever room is watching the movie.

The person on this journey owns an Emby server, a TV or projector, and a handful of WiZ, LIFX, Hue, or Govee bulbs. Today they paste bulb JSON from openlightfx.com/config into the Emby plugin settings page. After this journey they never open that page and never paste JSON.

## The journey

| Step | The person wants to…                          | Screen                                           | Done when…                                                                      |
| ---- | --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1    | Tell OpenLightFX about the room they watch in | [Rooms](#step-1--set-up-a-room)                  | A saved room has a name, a screen, and at least one placed bulb                 |
| 2    | Pick the movie to light                       | [Library](#step-2--pick-a-movie)                 | A movie is chosen                                                               |
| 3    | Open the movie's track, or start one          | [Movie](#step-3--open-or-create-a-track)         | A track is open in the editor                                                   |
| 4    | Write the lighting and see it on the bulbs    | [Editor](#step-4--edit)                          | The track is saved                                                              |
| 5    | Watch the movie with the lighting             | [Editor → Watch in Emby](#step-5--watch-in-emby) | Emby plays the movie on the room's screen and the room's bulbs follow the track |

A person can leave and come back at any step. Steps 2–4 work with no room at all: you can write a track without bulbs, you just cannot preview it on them.

## Domain model

### Terms

| Term         | What it is                                                                                                                                                   | Where it lives                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Room**     | A real space. Has a name, exactly one screen, and its bulbs.                                                                                                 | Plugin, `rooms.json` ([API](#plugin-api-summary))         |
| **Screen**   | The Emby playback device in the room, such as "Living Room TV · Emby for Android TV". Identified by Emby `deviceId`. One screen belongs to at most one room. | A field of the room                                       |
| **Bulb**     | One physical light the plugin can drive. Belongs to exactly one room, at one **position** in it. A discovered bulb that is not in a room is not used.        | Plugin, `rooms.json`                                      |
| **Position** | Where a bulb sits relative to the screen: Left, Center, Right, Surround Left, Surround Right, or Ambient.                                                    | A field of the bulb                                       |
| **Track**    | A `.lightfx` file for one movie. Declares one **layout**. Has one channel per position of that layout, plus keyframes and effects.                           | `{movieDir}/lightfx/{trackId}.lightfx`, unchanged         |
| **Layout**   | A fixed set of positions, like a speaker layout: 2.0, 3.0, 5.0, or Ambient.                                                                                  | Track metadata ([FP-2](#proposed-lightfx-format-changes)) |
| **Channel**  | One lane of the track. Stands for a position, never for a particular bulb.                                                                                   | The track                                                 |

Channels and bulbs stay separate on purpose. A track has to play in rooms its author has never seen. The track says "left wall goes red"; the room says "these two bulbs are the left wall". Positions join them. Nobody wires a channel to a bulb by hand. Mapping profiles, `ActiveProfileName`, and `DeviceProfileOverridesJson` are retired.

The one exception is a per-bulb **Follows** override in the room: a bulb normally follows the channel for its position ("Auto"), and can instead be told to follow a different position, for example a bias light placed Center that you want to follow the Ambient mix. It is a room setting, so it applies to every track.

### Positions

| Position       | Channel id       | `spatial_hint`           | Where the bulb is                                                          |
| -------------- | ---------------- | ------------------------ | -------------------------------------------------------------------------- |
| Left           | `left`           | `SPATIAL_LEFT`           | Left of the screen, front half of the room                                 |
| Center         | `center`         | `SPATIAL_CENTER`         | Behind or directly around the screen                                       |
| Right          | `right`          | `SPATIAL_RIGHT`          | Right of the screen, front half of the room                                |
| Surround Left  | `surround-left`  | `SPATIAL_SURROUND_LEFT`  | Left side or back-left of the seating                                      |
| Surround Right | `surround-right` | `SPATIAL_SURROUND_RIGHT` | Right side or back-right of the seating                                    |
| Ambient        | `ambient`        | `SPATIAL_AMBIENT`        | Anywhere: a ceiling light, a lamp across the room, a strip under the couch |

Channel ids are the lowercase ids already used by the March channel templates. `SPATIAL_BEHIND_SCREEN` in existing tracks is read as Center. `SPATIAL_CEILING` and `SPATIAL_FLOOR` are deferred: an existing channel with either hint is read as Ambient.

### Layouts

| Layout  | Channels, in lane order                                      | A room "covers" it when it has bulbs at |
| ------- | ------------------------------------------------------------ | --------------------------------------- |
| Ambient | `ambient`                                                    | Any position                            |
| 2.0     | `left`, `right`                                              | Left and Right                          |
| 3.0     | `left`, `center`, `right`                                    | Left, Center, Right                     |
| 5.0     | `left`, `center`, `right`, `surround-left`, `surround-right` | All five front and surround positions   |

The channels of a track are exactly the channels of its layout. There is no free-form "Add channel" in J1: to get more channels you change the layout ([EDIT-014](#edit-014-change-the-layout)). This is the answer to "how do I add a channel".

**Suggested layout for a room** is the smallest layout that has a channel for every non-Ambient position the room uses. A room with only Ambient bulbs suggests Ambient. A room with Left, Right, Surround Left, and Surround Right suggests 5.0, because no smaller layout has the surround channels; its missing Center folds into Left and Right.

### Routing: fold-down and fill

Every bulb in a room receives light from the track. Routing is computed by the plugin from three things: the track's channels, the room's bulb positions, and any Follows overrides. Studio never computes it; it asks the plugin ([API-ROUTE](#plugin-api-summary)), so preview and Emby playback cannot disagree.

**Fold-down** applies when a track has a channel for a position where the room has no bulb. The channel's light goes to the first destination in its row that has bulbs:

| Track channel  | 1st choice               | 2nd choice    | 3rd choice    | Last resort            |
| -------------- | ------------------------ | ------------- | ------------- | ---------------------- |
| Surround Left  | Left bulbs               | Center bulbs  | Ambient bulbs | Every bulb in the room |
| Surround Right | Right bulbs              | Center bulbs  | Ambient bulbs | Every bulb in the room |
| Center         | Left **and** Right bulbs | Ambient bulbs | —             | Every bulb in the room |
| Left           | Center bulbs             | Ambient bulbs | —             | Every bulb in the room |
| Right          | Center bulbs             | Ambient bulbs | —             | Every bulb in the room |
| Ambient        | Every bulb in the room   | —             | —             | —                      |

**Fill** applies when a room has a bulb at a position the track has no channel for. Without fill, a 2.0 track would leave a 5.0 room's surround bulbs dark:

| Bulb position  | Follows, when the track has no channel for its position |
| -------------- | ------------------------------------------------------- |
| Center         | Mix of Left and Right                                   |
| Surround Left  | Left; if the track has no Left, the Ambient mix         |
| Surround Right | Right; if the track has no Right, the Ambient mix       |
| Left, Right    | Center; if the track has no Center, the Ambient mix     |
| Ambient        | Mix of every channel in the track                       |

**Mixing** happens when one bulb receives more than one channel. The proposal: brightness is the highest of the sources, and color is the brightness-weighted average of the source colors. Color-temperature keyframes are converted to RGB with the plugin's existing Kelvin conversion before mixing. For effects, the bulb's own position wins: a folded-in effect plays only while the bulb's own channel has no effect running. See [OQ-J1-3](#open-questions).

**Worked examples** (rows are track layouts; cells say what each bulb follows):

| Track ↓ / Room → | Room with L, R                                | Room with L, C, R                 | Room with L, R, SL, SR (no C)                                    | Room with only Ambient bulbs |
| ---------------- | --------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| Ambient          | every bulb: `ambient`                         | every bulb: `ambient`             | every bulb: `ambient`                                            | every bulb: `ambient`        |
| 2.0              | L: `left`, R: `right`                         | L, R native; C: mix of L+R (fill) | L, R native; SL: `left`, SR: `right` (fill)                      | mix of `left`+`right`        |
| 3.0              | L: `left`+`center`, R: `right`+`center`       | all native                        | L: `left`+`center`, R: `right`+`center`, SL: `left`, SR: `right` | mix of all three             |
| 5.0              | L: `left`+`center`+`surround-left`, R: mirror | L, C, R native; SL→L, SR→R        | L, R, SL, SR native; C folds into L and R                        | mix of all five              |

These four columns are the shared routing fixture both repos test against ([MODEL-004](#model-004-routing-has-one-implementation-and-one-fixture)).

### Tracks that predate layouts

Existing tracks have no layout field and often use UUID channel ids. The owner's `John_Wick.lightfx` has four channels with UUID ids and the hints `SPATIAL_LEFT`, `SPATIAL_RIGHT`, `SPATIAL_SURROUND_LEFT`, and `SPATIAL_SURROUND_RIGHT`, 168 keyframes, and 8 effects. A track without a layout is read like this:

1. Each channel's position comes from its `spatial_hint`. If the hint is empty, from its id or display name when either is a position name ("left", "Surround Right"). Otherwise the channel has no position.
2. The layout is the smallest layout containing every position found. John Wick reads as 5.0 with no Center channel.
3. A channel with no position plays on Ambient bulbs only, and the editor labels its lane "No position" with a Fix button that opens a position picker.
4. Channel ids are never rewritten, so keyframes keep their `channel_id`. On first save from Studio the track gains the layout field, and Studio adds any missing layout channel (John Wick gains an empty Center lane, which fills from Left and Right until it has keyframes).

## Screens and navigation

Studio is one page at `/emby/OpenLightFX/studio/`. Screens are hash routes so the plugin's static host needs no fallback rules and the `?api_key=` query (how the plugin authenticates Studio today) survives every navigation and reload.

| Route                                  | Screen                       | Wireframe                                                              |
| -------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `#/rooms`, `#/rooms/{roomId}`          | Rooms (first run lands here) | [01](wireframes/01-first-run.png), [02](wireframes/02-room-setup.png)  |
| `#/library`                            | Library                      | [03](wireframes/03-library.png)                                        |
| `#/movie/{itemId}`                     | Movie: open or create track  | [04](wireframes/04-track-open-create.png)                              |
| `#/edit/{itemId}/{trackId}`            | Editor                       | [05](wireframes/05-editor.png), [06](wireframes/06-editor-no-room.png) |
| Emby dashboard → Plugins → OpenLightFX | Plugin settings, reduced     | [07](wireframes/07-plugin-settings.png)                                |

**Header**, on every Studio screen: the OpenLightFX Studio name, then **Rooms** and **Library** links (the current one is marked), then on the right the server name and a **Help** link to this journey's user-facing help. In the editor the header is replaced by the editor's menu bar ([Step 4](#step-4--edit)). Browser Back and Forward move between screens; the editor asks before leaving with unsaved changes.

**Where Studio opens:** with no rooms and no legacy config, `#/rooms` in first-run mode. With no rooms but legacy config, `#/rooms` with the import card on top. Otherwise the last route the person used, else `#/library`.

## Step 1 — Set up a room

**Goal:** tell OpenLightFX which screen the room has and where its bulbs are, in a few minutes, without JSON, and with confidence that "Lamp 2" really is the lamp on the left.

**Screen:** [01-first-run.png](wireframes/01-first-run.png) (no rooms yet) and [02-room-setup.png](wireframes/02-room-setup.png) (editing a room).

### Layout

- **Left column, "Your rooms":** one row per room with its name, screen name, bulb count, and the layout it suggests ("3.0"). **+ New room** at the bottom.
- **Main area, the room editor:**
  - **Name** field and **Screen** picker in a row at the top.
  - **Room diagram:** a top-down rectangle. The screen is a bar at the top, labeled with the chosen screen's name. Six drop zones: Left and Right flank the screen, Center sits on the screen, Surround Left and Surround Right are the rear corners, and Ambient is a band along the bottom labeled "Ambient — anywhere in the room". Each zone lists its bulbs as chips.
  - **Bulbs not in a room**, to the right of the diagram: the discovery list with **Find bulbs**, one row per bulb that is not yet in this or any room.
  - **Coverage line** under the diagram: "This room plays 3.0 tracks natively. 5.0 surround channels fold into Left and Right." Updated live as bulbs move.
  - **Footer:** **Delete room** on the left. **Save room** and, once the room is saved, **Next: pick a movie →** on the right.

### Controls

| Control                                 | Where               | What it does                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **+ New room**                          | Rooms column        | Opens an empty room editor named "Room N". Unsaved until **Save room**.                                                                                                                                                                       |
| Room row                                | Rooms column        | Opens that room in the editor. If the current room has unsaved changes, asks Save, Discard, or Cancel.                                                                                                                                        |
| **Name**                                | Room editor         | Room name, 1–40 characters, unique (case-insensitive). Errors show under the field.                                                                                                                                                           |
| **Screen** picker                       | Room editor         | Lists Emby devices the server has seen, newest activity first: device name, app, last user, "last seen 2 h ago". A device already used by another room shows "In Bedroom" and picking it asks to move it. **Refresh** reloads the list.       |
| **Find bulbs**                          | Unplaced list       | Runs discovery on every protocol (about 7 s, with a progress bar and **Cancel**). New bulbs appear in the list; bulbs already in a room are not listed again, but their IP is refreshed.                                                      |
| Bulb row: name                          | Unplaced list, chip | Click to rename (1–40 characters). The protocol, model, and IP show under the name.                                                                                                                                                           |
| Bulb row: **Identify**                  | Unplaced list, chip | Flashes that bulb red, green, blue (about 1.5 s) so the person can see which one it is. The row shows "Flashing…" while it runs. Disabled for 2 s afterwards.                                                                                 |
| Drag a bulb onto a zone                 | Diagram             | Places it at that position in this room. Dragging a chip between zones changes its position.                                                                                                                                                  |
| Bulb row: **Place ▾**                   | Unplaced list, chip | The keyboard and touch alternative to dragging: a menu of the six positions plus "Not in this room".                                                                                                                                          |
| Chip: **×**                             | Diagram             | Takes the bulb out of this room. It returns to the unplaced list.                                                                                                                                                                             |
| Chip: **Follows ▾**                     | Diagram, chip menu  | Auto (by position), or one of the six positions. A chip with an override shows "→ Ambient".                                                                                                                                                   |
| **Pair Hue bridge**                     | Unplaced list       | Shown when discovery finds a Hue bridge that is not paired. Says "Press the round button on the bridge, then click Pair". On success the bridge's lights join the list. The bridge key is stored by the plugin and never sent to the browser. |
| **Save room**                           | Footer              | Validates and saves the room and the position of every bulb in it. Disabled until there is a name and a screen. A room with no bulbs saves with a warning: "No bulbs yet. Tracks will not light this room."                                   |
| **Delete room**                         | Footer              | Asks "Delete Living Room? Its 4 bulbs become unplaced." Then deletes the room.                                                                                                                                                                |
| **Next: pick a movie →**                | Footer              | Goes to the Library.                                                                                                                                                                                                                          |
| **Import my existing setup**            | Import card         | See [import](#importing-the-old-pasted-setup).                                                                                                                                                                                                |
| **Skip — write a track without lights** | First-run card      | Goes to the Library. Studio stays usable; the editor shows the no-room banner.                                                                                                                                                                |

### First run

With no rooms, the main area starts with a short welcome card above the room editor: "OpenLightFX lights your room in time with a movie. First, tell it about the room you watch in: its screen and its bulbs." The room editor below it is already open with "Living Room" as the name. The card holds **Skip — write a track without lights**.

### Importing the old pasted setup

When the plugin still has `BulbConfigJson` or `MappingProfilesJson` and no rooms exist, an import card sits above everything: "We found your previous setup: 6 bulbs, 2 mapping profiles, 1 device assignment." It lists what will be created before anything changes:

- One room per mapping profile, named after the profile.
- Each bulb goes into the first profile, in profile order, that maps it. Its position comes from its `spatialPosition` (both "Left" and "SPATIAL_LEFT" spellings), else from the channel name it is mapped to when that is a position name, else it is left unplaced in that room's list.
- Each room's screen comes from `DeviceProfileOverridesJson` (deviceId → profile name). Where several devices point at one profile, the one Emby saw most recently wins and the others are listed as "not imported".
- Bulbs mapped by no profile are imported as unplaced bulbs.
- Everything that cannot be carried over is listed with the reason, for example "Profile 'Bedroom' maps channel `fx-1`, which is not a position".

**Import** applies it. **Not now** hides the card for this browser session. Import does not delete the old settings; the plugin stops reading them once rooms exist. After import, each room opens so the person can check positions with **Identify**.

### Empty and error states

| Situation                                     | What the person sees                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Emby devices seen yet                      | Screen picker reads "No devices yet. Open Emby on the room's TV once, then click Refresh." Save stays disabled.                                                                  |
| Discovery finds nothing                       | "No bulbs answered. Check the bulbs are powered and on the same network as the Emby server. If Emby runs in Docker, it needs host networking for discovery." with **Try again**. |
| Discovery fails (plugin error)                | The server's message and **Try again**. The list keeps what it had.                                                                                                              |
| Identify fails or the bulb does not answer    | The row shows "Didn't answer at 192.168.1.40" for 10 s. The bulb is not removed.                                                                                                 |
| Hue link button not pressed                   | "The bridge says the button wasn't pressed. Press it and click Pair within 30 seconds."                                                                                          |
| Save conflict (someone else changed the room) | "This room changed in another tab. Reload it?" with **Reload** (loses local changes) and **Keep mine** (overwrites).                                                             |
| Not an Emby admin                             | The Rooms screen is read-only with "Only an Emby administrator can change rooms." Studio's API calls for writing already require the Admin role.                                 |
| Plugin unreachable                            | The full-page error from ERR-002: "Studio can't reach the OpenLightFX plugin." with **Retry**. No fake rooms.                                                                    |

### Data

Reads `GET /OpenLightFX/Studio/Setup`, `GET …/Rooms`, `GET …/Devices`, `POST …/Discover`. Writes `POST`/`PUT`/`DELETE …/Rooms`, `PUT …/Bulbs/{bulbId}`, `POST …/Bulbs/{bulbId}/Identify`, `POST …/Import/Legacy`, and the existing Hue pairing routes. See the [API summary](#plugin-api-summary).

## Step 2 — Pick a movie

**Goal:** find the movie to light in a few seconds, by poster and title, from the Emby library. Movies only.

**Screen:** [03-library.png](wireframes/03-library.png).

### Layout

The header, then a **Search** field and a **Sort** menu in one row, then a grid of poster cards. Each card shows the Emby poster, the title, the year, and a badge: "No track", "1 track", or "2 tracks · 1 plays in Emby". A strip above the grid, shown only when no room exists, reads "No room set up. You can still write tracks. **Set up a room**".

### Controls

| Control           | What it does                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search**        | Filters by title as you type (250 ms debounce), server-side through `GET /OpenLightFX/Studio/Items?search=`. Clearing it shows every movie. |
| **Sort ▾**        | Title A–Z (default), Recently added, Has a track first. Remembered for the browser.                                                         |
| Poster card       | Opens [Step 3](#step-3--open-or-create-a-track) for that movie. Keyboard: Tab to the card, Enter.                                           |
| **Set up a room** | Goes to Rooms. Only present on the no-room strip.                                                                                           |

### Empty and error states

| Situation                   | What the person sees                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Library still loading       | Grey poster placeholders, not a spinner over a blank page.                               |
| Emby has no movies          | "Emby has no movies yet. Add a movie library in Emby, then come back."                   |
| Search matches nothing      | "No movies match "wick". Check the spelling or clear the search." with **Clear search**. |
| Movie has no poster in Emby | A grey card with the title in large type. Never a broken image icon.                     |
| Plugin unreachable          | The ERR-002 full-page error.                                                             |

### Data

Reads `GET /OpenLightFX/Studio/Items?search=` (title, year, runtime, poster URL without an access token) plus a track count and the active-track flag per movie, added to that response ([API](#plugin-api-summary)).

## Step 3 — Open or create a track

**Goal:** get from "this movie" to an open track in one click, whether the movie already has tracks or not.

**Screen:** [04-track-open-create.png](wireframes/04-track-open-create.png).

### Layout

- **Movie header:** poster, title, year, runtime, and a **← Library** link.
- **Tracks for this movie:** one row per `.lightfx` file the plugin finds for the movie (`GET /OpenLightFX/Studio/Tracks?itemId=`): title, layout, author, last saved, and a **Plays in Emby** badge on the active one. Each row has **Open**.
- **New track** panel:
  - **Title**, defaulting to "{Movie title} lighting".
  - **Layout** as four cards, each with a small top-down drawing: Ambient, 2.0, 3.0, 5.0. The suggested layout for the chosen room is preselected and labeled "Suggested for Living Room". With no rooms, 2.0 is preselected and no suggestion is shown.
  - **For room ▾**, shown only with two or more rooms: which room the suggestion and the first preview use.
  - **Create track**.
- **Other ways to start:** **Open a .lightfx file…** and a short note "Marketplace: browse tracks others have made — coming later". The note is plain text, not a control.

### Controls

| Control                   | What it does                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Open** (track row)      | Opens the editor on that track: `#/edit/{itemId}/{trackId}`.                                                                                                                                                                                                    |
| Layout card               | Selects that layout. Each card lists its channels ("Left · Center · Right") and what the chosen room does with it ("All 3 positions have bulbs" or "Surround folds into Left and Right").                                                                       |
| **For room ▾**            | Changes which room the suggestion and coverage text refer to.                                                                                                                                                                                                   |
| **Create track**          | Creates an unsaved track: version 1, the movie's IMDb id, title, year, and runtime from Emby, `duration_ms` from the movie, the layout's channels (dark, brightness 0), no keyframes. Opens the editor. The file is written on first Save.                      |
| **Open a .lightfx file…** | Browser file picker. The file is decoded and validated (IO-001, IO-003). If its IMDb id differs from this movie's, or its duration differs by more than 2 %, Studio says so and asks to continue (IO-004). Opens the editor as an unsaved track for this movie. |
| **← Library**             | Back to the Library.                                                                                                                                                                                                                                            |

### Empty and error states

| Situation                         | What the person sees                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| No tracks yet                     | The list reads "No tracks for this movie yet." and the New track panel has focus.                                                   |
| A track file fails validation     | Its row shows "Can't open: V-004 keyframe references unknown channel" (the plugin's validation code and text), with no Open button. |
| File picker gets a non-track file | "That file isn't a .lightfx track." Nothing opens.                                                                                  |
| Movie runtime unknown             | MEDIA-015 probes it. Until then Create track says "Reading the movie's length…" and is disabled.                                    |

## Step 4 — Edit

**Goal:** play the movie, put light changes at the right moments on the right positions, see them on screen and on the room's bulbs, and save.

**Screens:** [05-editor.png](wireframes/05-editor.png) (a room exists) and [06-editor-no-room.png](wireframes/06-editor-no-room.png) (no room).

### Layout

From top to bottom:

1. **Menu bar:** **File**, **Edit**, **Help** menus on the left. The track title and save state ("Saved 2 min ago", "Unsaved changes", "Saving…") in the middle. On the right: **Preview on ▾** (room picker), the **Lights** switch, and **Watch in Emby**.
2. **No-room banner**, only when no room exists: "Set up a room to preview on your lights. **Set up a room**".
3. **Video** on the left, about two thirds of the width, with the transport directly under it: **⏮ −5 s**, **◀ frame**, **▶ Play / ❚❚ Pause**, **frame ▶**, **+5 s ⏭**, and the time "0:42:17.250 / 1:41:04". There is no seek bar here; the timeline ruler is the only scrubber.
4. **Inspector** on the right, beside the video. It shows the selected keyframe, else the selected channel, else a short "Click a lane to add a keyframe at that time" hint.
5. **Timeline** across the full width at the bottom: a **layout chip** ("5.0 ▾") and zoom controls (**−**, **+**, **Fit**) in its header row, then the **ruler**, then one **lane** per channel. Each lane header shows the position and the bulbs it reaches in the preview room, for example "Left — Desk lamp, Shelf strip (+ Center folded in)". The lane body shows keyframes as diamonds over a strip of the channel's color across time, and effects as labeled blocks.

There is no Overview bar, no minimap, and no second seek bar.

### Menus

| Menu | Item                      | Shortcut       | What it does                                                                                                                                            |
| ---- | ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File | **New track…**            | —              | Goes to this movie's Step 3 screen, asking first if there are unsaved changes.                                                                          |
| File | **Open…**                 | —              | Same as New track: the Step 3 list of this movie's tracks.                                                                                              |
| File | **Open a .lightfx file…** | —              | The Step 3 file picker, for this movie.                                                                                                                 |
| File | **Save**                  | Ctrl/⌘ S       | Validates, writes the track and its project sidecar through the plugin (SAVE-001, SAVE-003). Shows "Saved". Errors show the plugin's message (ERR-003). |
| File | **Export .lightfx…**      | —              | Downloads the current track as `{title}.lightfx` (SAVE-008). Does not save to the server.                                                               |
| File | **Close**                 | —              | Back to this movie's Step 3 screen, asking first if there are unsaved changes.                                                                          |
| Edit | **Undo**                  | Ctrl/⌘ Z       | Undoes the last edit (UNDO-001). Greyed with nothing to undo, with the reason in its tooltip.                                                           |
| Edit | **Redo**                  | Ctrl/⌘ Shift Z | Redoes (UNDO-002).                                                                                                                                      |
| Edit | **Delete keyframe**       | Delete         | Deletes the selected keyframes (KEY-004).                                                                                                               |
| Edit | **Track settings…**       | —              | Title, author, description, start, end, and credits behavior, preshow (PROP-008).                                                                       |
| Help | **Keyboard shortcuts**    | ?              | The shortcut list (A11Y-003).                                                                                                                           |
| Help | **How Studio works**      | —              | A one-page summary of this journey.                                                                                                                     |

A menu item that cannot run right now is greyed and says why on hover. No menu item is ever present but inert.

### Controls

| Control                         | What it does                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play / Pause**, Space         | Plays or pauses the edit proxy (MEDIA-004, MEDIA-005, MEDIA-009).                                                                                                                                                                |
| **◀ frame / frame ▶**, ← / →    | Steps one frame (MEDIA-007).                                                                                                                                                                                                     |
| **−5 s / +5 s**, Shift ← / →    | Skips 5 seconds (MEDIA-008).                                                                                                                                                                                                     |
| Click or drag on the **ruler**  | Moves the playhead and the video to that time. Dragging scrubs. This is the only way to seek by pointer.                                                                                                                         |
| Click empty space in a **lane** | Adds a keyframe on that channel at the clicked time, snapped to the frame grid, and selects it. Its color and brightness are the channel's current value at that time, so adding does not change what you see until you edit it. |
| Click a **keyframe**            | Selects it and opens it in the inspector. Shift-click adds to the selection.                                                                                                                                                     |
| Drag a **keyframe**             | Moves it in time, snapping to frames and the playhead (TIME-010). Cannot cross another keyframe on the same lane (KEY-006).                                                                                                      |
| **K**                           | Adds a keyframe at the playhead on the selected lane (KEY-002).                                                                                                                                                                  |
| Lane header                     | Selects the channel; the inspector shows its default color, brightness, and the bulbs it reaches.                                                                                                                                |
| Lane header **S** / **M**       | Solo and mute in the preview (CHAN-004). Never written to the file.                                                                                                                                                              |
| **Zoom − / + / Fit**            | Zooms the timeline around the playhead; Fit shows the whole movie (TIME-002, TIME-011). Ctrl/⌘ + wheel zooms; wheel scrolls lanes; Shift + wheel pans.                                                                           |
| **Layout chip ▾**               | Changes the track's layout ([EDIT-014](#edit-014-change-the-layout)).                                                                                                                                                            |
| Inspector: **Color**            | Swatch, hex, and RGB fields (PROP-001, PROP-002), Kelvin mode (PROP-003), and the eyedropper (PROP-004).                                                                                                                         |
| Inspector: **Brightness**       | 0–100 slider and number.                                                                                                                                                                                                         |
| Inspector: **Fade**             | Step (instant) or Linear, and the fade length in ms (KEY-009, KEY-010).                                                                                                                                                          |
| Inspector: **Time**             | The keyframe time, editable as `h:mm:ss.mmm`.                                                                                                                                                                                    |
| Inspector: **Delete**           | Deletes the keyframe.                                                                                                                                                                                                            |
| **Preview on ▾**                | Picks which room previews. Lists rooms by name. Changing it updates every lane's "reaches" label. Disabled with no rooms.                                                                                                        |
| **Lights** switch               | Starts or stops live preview on the chosen room's bulbs (PREV-006, PREV-007). If Emby is playing a movie with lighting, asks before taking over (PREV-008). Disabled with no rooms, with the reason in its tooltip.              |
| **Watch in Emby**               | [Step 5](#step-5--watch-in-emby).                                                                                                                                                                                                |

Effects already in a track are drawn as labeled blocks and are kept on save (FX-004). Placing and editing effects is not part of J1 (see [Out of scope](#out-of-scope)); clicking an effect block selects it and the inspector says "Effect editing comes in a later version. This effect is kept as is."

### With no room

The editor works the same, with three differences: the no-room banner shows, **Preview on** and **Lights** are disabled with the tooltip "Set up a room first", and lane headers show only the position ("Left") with no bulb names. The on-screen color strip in each lane still shows the authored light.

### Empty and error states

| Situation                       | What the person sees                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| New track, no keyframes yet     | Each lane shows "Click to add a keyframe" in its body until the first keyframe is added anywhere.                                |
| Edit proxy still encoding       | Playback starts from what is ready (MEDIA-016). Seeking past it shows "Encoded up to 0:12:40" on the video and waits.            |
| Edit proxy failed               | The video area shows the plugin's reason and **Retry** (ERR-001). The timeline still works.                                      |
| Preview room bulbs don't answer | The Lights switch turns off and the bar says "Living Room's bulbs didn't answer: Desk lamp, Shelf strip". Editing continues.     |
| Emby is playing with lighting   | The takeover prompt (PREV-008).                                                                                                  |
| Save rejected by validation     | The plugin's V- code and text, and the keyframe at fault is selected (SAVE-004).                                                 |
| Save conflict                   | ERR-003: the server text and **Reload** / **Save as new track**.                                                                 |
| Not an Emby admin               | Save, Lights, and Watch in Emby are disabled with "Only an Emby administrator can…". **Export .lightfx…** still works (ERR-004). |
| Leaving with unsaved changes    | "Save changes to John Wick lighting?" **Save**, **Don't save**, **Cancel**. Autosave keeps a crash copy (SAVE-005).              |

## Step 5 — Watch in Emby

**Goal:** go from the editor to watching the movie on the room's TV with the lights, without hunting through settings.

**Control:** **Watch in Emby** in the editor's menu bar.

1. If there are unsaved changes, it saves first. If saving fails, it stops and shows why.
2. It makes this track the one Emby plays for this movie (`POST /OpenLightFX/Studio/Items/{itemId}/ActiveTrack`). That sets the plugin's movie-wide selection and clears any older per-device selection for this movie, so every room plays it.
3. It opens the movie's Emby page in a new browser tab: `/web/index.html#!/item?id={itemId}&serverId={serverId}`.
4. A confirmation stays in the editor: "Plays in Emby. Start John Wick on Living Room TV and the lights will follow." With no room: "Plays in Emby. Set up a room so the lights follow." with **Set up a room**.

When Emby starts the movie on a device, the plugin finds the room whose screen is that device, routes the track to that room's bulbs, and plays it. A device that belongs to no room plays the movie with no lighting, and Studio's Rooms screen lists it under the Screen picker as "Played John Wick 3 min ago, not in a room" so the person can see why.

## Requirements

Format: ID, title, layer (all L1), status (all `proposed`), a one-line statement, Given/When/Then acceptance, and the test tiers. Tiers are the ones in [studio-requirements.md § Test strategy](../requirements/studio-requirements.md#test-strategy): `unit`, `fixture`, `browser`, `fullstack`, plus `walkthrough`, which is the recorded Playwright run of the whole step that a person watches ([Definition of done](#definition-of-done-for-each-step)). When approved, these move into `studio-requirements.md` and the traceability gate starts enforcing them.

### Model and routing

#### MODEL-001 Layouts are fixed sets of positions

- **Statement:** A track's channels are exactly the channels of its layout, with the ids and hints in [Positions](#positions).
- **Acceptance:** Given a new 3.0 track, then it has channels `left` (`SPATIAL_LEFT`), `center` (`SPATIAL_CENTER`), `right` (`SPATIAL_RIGHT`) in that order and `channel_layout` is `LAYOUT_3_0`. Given a 5.0 track, then validation rejects a sixth channel.
- **Tests:** unit, fixture

#### MODEL-002 Suggested layout for a room

- **Statement:** The suggested layout is the smallest layout with a channel for every non-Ambient position the room uses.
- **Acceptance:** Given rooms with positions {Ambient}, {L,R}, {L,C,R}, {L,R,SL,SR}, {L}, then the suggestions are Ambient, 2.0, 3.0, 5.0, 2.0.
- **Tests:** unit

#### MODEL-003 Every bulb in a room is lit by every track

- **Statement:** Fold-down and fill route every track channel to at least one bulb and give every bulb at least one source.
- **Acceptance:** Given any of the four layouts and any non-empty room, when routing is computed, then no bulb has zero sources and no channel reaches zero bulbs.
- **Tests:** unit, fixture

#### MODEL-004 Routing has one implementation and one fixture

- **Statement:** The plugin computes routing; Studio only displays it; both repos test the same fixture.
- **Acceptance:** Given `tests/fixtures/routing/cases.json` (the worked-example table as data), when the plugin's routing tests and Studio's lane-label tests run, then both match every case. Given Studio, then it contains no fold-down table of its own.
- **Tests:** fixture, fullstack

#### MODEL-005 Mixing

- **Statement:** A bulb with several sources takes the highest brightness and the brightness-weighted average color.
- **Acceptance:** Given `left` red at 100 and `center` blue at 50 folded onto one bulb, then the bulb is brightness 100, color (170, 0, 85). Given both at 0, then the bulb is off.
- **Tests:** unit, fixture

#### MODEL-006 Follows override

- **Statement:** A bulb's Follows override replaces its position for routing in every track.
- **Acceptance:** Given a Center bulb set to follow Ambient and a 3.0 track, then that bulb receives the mix of all three channels and `center` folds to Left and Right as if no Center bulb existed.
- **Tests:** unit, fullstack

#### MODEL-007 Tracks without a layout

- **Statement:** A track without `channel_layout` is read by [Tracks that predate layouts](#tracks-that-predate-layouts) without rewriting channel ids.
- **Acceptance:** Given the fixture copy of John Wick's channel list (UUID ids, L/R/SL/SR hints), then it reads as 5.0 with no `center`, routing matches the "L, R, SL, SR" column, and on save the file gains `LAYOUT_5_0` and an empty `center` channel while every keyframe keeps its `channel_id`.
- **Tests:** unit, fixture, fullstack

### Navigation

#### FLOW-001 First run lands on room setup

- **Statement:** With no rooms, Studio opens on `#/rooms` with the welcome card.
- **Acceptance:** Given a plugin with no rooms and no legacy config, when Studio loads, then the URL is `#/rooms`, the welcome card and an open room editor named "Living Room" are visible, and **Skip — write a track without lights** goes to `#/library`.
- **Tests:** browser, fullstack, walkthrough

#### FLOW-002 Returning users land where they were

- **Statement:** With rooms, Studio opens on the last route used, else the Library.
- **Acceptance:** Given one room and a last route `#/edit/m1/t1`, when Studio loads, then the editor for `m1`/`t1` is open.
- **Tests:** browser

#### FLOW-003 Routes keep the API key and survive reload

- **Statement:** Every screen is a hash route that keeps the `?api_key=` query and restores on reload.
- **Acceptance:** Given `…/studio/?api_key=K#/movie/m1`, when the page reloads or Back is pressed, then the query is unchanged and the screen matches the route.
- **Tests:** browser

#### FLOW-004 Header navigation

- **Statement:** Rooms and Library are one click from every screen except the editor, which reaches them through File → Close.
- **Acceptance:** Given the Library, when Rooms is clicked, then `#/rooms` shows and the Rooms link is marked current.
- **Tests:** browser

### Step 1 — Rooms

#### ROOM-001 Create and save a room

- **Statement:** A room saves with a unique name and a screen; Save is disabled without both.
- **Acceptance:** Given the room editor with name "Living Room" and no screen, then Save is disabled. When a screen is picked and Save clicked, then `GET …/Rooms` returns the room with that `deviceId`, and the Rooms column shows it.
- **Tests:** browser, fullstack, walkthrough

#### ROOM-002 Screen picker lists Emby devices

- **Statement:** The screen picker lists every device Emby has seen, newest first, and marks devices other rooms use.
- **Acceptance:** Given Emby has seen devices A (1 h ago) and B (1 day ago, used by Bedroom), then the picker lists A then B, and B reads "In Bedroom". Picking B asks to move it; confirming saves B in this room and removes it from Bedroom.
- **Tests:** browser, fullstack

#### ROOM-003 Discover bulbs

- **Statement:** Find bulbs runs discovery and lists bulbs not already in a room.
- **Acceptance:** Given the simulator emulating 4 bulbs, one already in Bedroom, when Find bulbs is clicked, then within 10 s the list shows the other 3 with protocol, model, and IP, and a progress bar shows while it runs.
- **Tests:** fullstack, walkthrough

#### ROOM-004 Identify flashes the right bulb

- **Statement:** Identify flashes exactly the chosen bulb.
- **Acceptance:** Given bulbs b1 and b2 in the simulator, when Identify is clicked on b1, then simulator NDJSON shows red, green, blue commands to b1 only, and b1's row reads "Flashing…" until it finishes.
- **Tests:** fullstack, walkthrough

#### ROOM-005 Place bulbs by drag or menu

- **Statement:** Dragging a bulb onto a zone or choosing a position from Place ▾ puts it at that position; × takes it out.
- **Acceptance:** Given an unplaced bulb, when it is dragged to Left, then its chip is in the Left zone; when Place ▾ → Surround Right is used instead, the same result in that zone. After Save, `GET …/Rooms/{id}` lists the bulb with that position. When × is clicked and saved, it is unplaced again.
- **Tests:** browser, fullstack, walkthrough

#### ROOM-006 Coverage line

- **Statement:** The coverage line states the suggested layout and what folds, and updates as bulbs move.
- **Acceptance:** Given bulbs at L and R, then it reads "This room plays 2.0 tracks natively…". When a bulb is added at Center, it reads 3.0 without a reload.
- **Tests:** browser

#### ROOM-007 A bulb is in one room

- **Statement:** Placing a bulb that is in another room moves it, after confirmation.
- **Acceptance:** Given b1 in Bedroom, when b1 is placed in Living Room and confirmed, then after Save it is only in Living Room.
- **Tests:** unit, fullstack

#### ROOM-008 Rename and Follows

- **Statement:** Bulb names and Follows overrides save with the room.
- **Acceptance:** Given b1 renamed "Desk lamp" and set to follow Ambient, after Save and reload, then the chip reads "Desk lamp → Ambient".
- **Tests:** browser, fullstack

#### ROOM-009 Delete a room

- **Statement:** Deleting a room unplaces its bulbs and frees its screen.
- **Acceptance:** Given Living Room with 2 bulbs, when Delete room is confirmed, then the room is gone and both bulbs are listed as unplaced.
- **Tests:** browser, fullstack

#### ROOM-010 Hue pairing

- **Statement:** A discovered Hue bridge pairs from the Rooms screen and its lights join the list.
- **Acceptance:** Given the simulator's Hue bridge, when Pair is clicked after its link button is pressed, then its lights appear as bulbs, and no response to the browser contains the bridge key.
- **Tests:** fullstack

#### ROOM-011 Import the old pasted setup

- **Statement:** Legacy bulb and profile JSON imports into rooms with a preview first.
- **Acceptance:** Given the fixture `tests/fixtures/legacy/config.json` (6 bulbs, profiles "Living Room" and "Bedroom", one device override), when Studio loads, then the import card lists 2 rooms with their bulbs, positions, and screen, plus every item not imported and why. When Import is clicked, then `GET …/Rooms` matches the fixture's expected rooms, and the legacy settings are unchanged.
- **Tests:** unit, fixture, fullstack

#### ROOM-012 Room errors are specific

- **Statement:** Each Step 1 error state shows the text in [Step 1 errors](#empty-and-error-states) and keeps what the person entered.
- **Acceptance:** Given discovery that finds nothing, then the "No bulbs answered…" text and Try again show. Given a 409 on save, then the conflict prompt shows and the edited name is still in the field.
- **Tests:** browser

### Step 2 — Library

#### LIB-001 Poster grid of Emby movies

- **Statement:** The Library shows every Emby movie as a poster card with title, year, and track badge; no TV episodes.
- **Acceptance:** Given Emby with 3 movies and 1 series, then 3 cards show, each with title and year, and the one with a saved track says "1 track".
- **Tests:** browser, fullstack, walkthrough

#### LIB-002 Search

- **Statement:** Typing filters by title through the plugin.
- **Acceptance:** Given movies "Clip Short" and "Clip Long", when "long" is typed, then only "Clip Long" shows within 1 s. Given "zzz", the no-match text and Clear search show.
- **Tests:** browser, fullstack

#### LIB-003 Open a movie

- **Statement:** Clicking a card or pressing Enter on it opens `#/movie/{itemId}`.
- **Acceptance:** Given the grid, when the first card is clicked, then the Movie screen for that item shows its title.
- **Tests:** browser, walkthrough

#### LIB-004 No-room strip

- **Statement:** With no rooms the Library shows the no-room strip with a working Set up a room link.
- **Acceptance:** Given no rooms, then the strip shows; clicking its link opens `#/rooms`. Given a room, then the strip is absent.
- **Tests:** browser

### Step 3 — Open or create

#### TRACK-001 List a movie's tracks

- **Statement:** The Movie screen lists every track the plugin finds for the movie with title, layout, author, last saved, and the Plays in Emby badge.
- **Acceptance:** Given a movie with two tracks, one active, then two rows show and only the active one has the badge.
- **Tests:** browser, fullstack, walkthrough

#### TRACK-002 Create with a suggested layout

- **Statement:** Create track makes an unsaved track with the selected layout, preselecting the room's suggestion.
- **Acceptance:** Given one room with L, C, R bulbs, then the 3.0 card is preselected and says "Suggested for Living Room". When Create track is clicked, then the editor opens with lanes Left, Center, Right and the movie's duration, and the server has no new file until Save.
- **Tests:** browser, fullstack, walkthrough

#### TRACK-003 Open from file

- **Statement:** Open a .lightfx file imports a valid track for this movie and warns on movie or duration mismatch.
- **Acceptance:** Given a valid track for another IMDb id, then a warning names both movies and Continue opens it. Given a PNG, then "That file isn't a .lightfx track." shows and nothing opens.
- **Tests:** browser

#### TRACK-004 Marketplace is a note, not a control

- **Statement:** The marketplace is mentioned as plain text and has no button, link, or disabled control.
- **Acceptance:** Given the Movie screen, then no element with role button or link contains "Marketplace".
- **Tests:** browser

### Step 4 — Editor

#### EDIT-001 One scrubber

- **Statement:** The ruler is the only pointer seek control. There is no overview bar, minimap, or video seek bar.
- **Acceptance:** Given the editor, then exactly one element has role `slider` for time, and it is the ruler. When the ruler is clicked at 25 % of its width at Fit zoom, then the playhead and `video.currentTime` are at 25 % of the duration within one frame.
- **Tests:** browser, fullstack, walkthrough

#### EDIT-002 Drag to scrub

- **Statement:** Dragging along the ruler scrubs the video continuously.
- **Acceptance:** Given the editor paused, when the ruler is dragged from 10 % to 20 %, then the shown frame changes during the drag and ends at 20 %.
- **Tests:** browser, fullstack

#### EDIT-003 Click a lane to add a keyframe

- **Statement:** A single click on empty lane space adds and selects a keyframe at that time with the channel's current value.
- **Acceptance:** Given an empty Left lane, when it is clicked at 0:10, then one keyframe exists on `left` at 0:10 (frame-snapped), it is selected in the inspector, and the preview color at 0:10 is unchanged. Undo removes it.
- **Tests:** browser, walkthrough

#### EDIT-004 Lanes name their bulbs

- **Statement:** Each lane header shows its position and the preview room's bulbs it reaches, including folded channels.
- **Acceptance:** Given a 5.0 track and Living Room with L, C, R bulbs, then the Left lane reads "Left — Desk lamp (+ Surround Left)" and the Surround Left lane reads "Surround Left → folds into Left". With no room, the Left lane reads "Left".
- **Tests:** browser, fullstack

#### EDIT-005 File menu

- **Statement:** The File menu has New track, Open, Open a .lightfx file, Save, Export .lightfx, and Close, each doing what [Menus](#menus) says.
- **Acceptance:** Given a changed track, when File → Close is chosen, then the unsaved prompt shows; Don't save returns to `#/movie/{itemId}`. When File → Export is chosen, then a `.lightfx` download starts that decodes to the current track.
- **Tests:** browser, walkthrough

#### EDIT-006 Edit menu

- **Statement:** Edit has Undo, Redo, Delete keyframe, and Track settings, with their shortcuts.
- **Acceptance:** Given one added keyframe, when Edit → Undo is chosen, then it is gone; Edit → Redo restores it; with nothing to undo, Undo is greyed and its tooltip says "Nothing to undo".
- **Tests:** browser

#### EDIT-007 Transport

- **Statement:** The transport under the video plays, pauses, frame-steps, and skips 5 s, and shows the time.
- **Acceptance:** Existing MEDIA-004 to MEDIA-009, run against the new layout.
- **Tests:** browser, fullstack

#### EDIT-008 Inspector edits the keyframe

- **Statement:** The inspector edits the selected keyframe's time, color, brightness, fade type, and fade length.
- **Acceptance:** Given a selected keyframe, when brightness is set to 40 and fade to Linear 500 ms, then the encoded track has those values and the lane's color strip changes from that time.
- **Tests:** browser, unit

#### EDIT-009 Preview room and Lights

- **Statement:** Lights starts preview on the picked room; the bulbs follow the playhead using the plugin's routing.
- **Acceptance:** Given Living Room in the simulator and a keyframe `left` red at 0:05, when Lights is switched on and the playhead moved to 0:06, then NDJSON shows red at the Left bulbs and, per routing, the Surround Left bulbs; when switched off, bulbs restore (PREV-007).
- **Tests:** fullstack, walkthrough

#### EDIT-010 No-room editor

- **Statement:** With no rooms the editor authors and saves normally, shows the banner, and disables Preview on and Lights with a reason.
- **Acceptance:** Given no rooms, then the banner shows with a working Set up a room link, Lights is disabled with the tooltip "Set up a room first", and adding a keyframe and saving succeed.
- **Tests:** browser, fullstack, walkthrough

#### EDIT-011 Save state is always visible

- **Statement:** The menu bar shows Saved, Unsaved changes, or Saving…, and leaving with unsaved changes asks first.
- **Acceptance:** Given a saved track, when a keyframe is added, then the bar reads "Unsaved changes"; after Ctrl/⌘ S it reads "Saved".
- **Tests:** browser

#### EDIT-012 Effects are kept

- **Statement:** Existing effect keyframes are drawn and kept on save, and their inspector says editing comes later.
- **Acceptance:** Given the John Wick fixture with 8 effects, when it is opened and saved, then the saved file has the same 8 effects byte-for-byte in their fields.
- **Tests:** unit, fullstack

#### EDIT-013 Admin-only actions say so

- **Statement:** For a non-admin, Save, Lights, and Watch in Emby are disabled with a reason, and Export works.
- **Acceptance:** Given a non-admin Emby token, then those three are disabled with "Only an Emby administrator can…" and Export downloads the track.
- **Tests:** fullstack

#### EDIT-014 Change the layout

- **Statement:** The layout chip changes the track's layout, adding new channels dark and removing channels only after confirmation if they have keyframes.
- **Acceptance:** Given a 2.0 track, when 3.0 is chosen, then a Center lane appears between Left and Right with no keyframes. Given a 3.0 track whose Center has 4 keyframes, when 2.0 is chosen, then "Remove Center and its 4 keyframes?" shows; Cancel changes nothing.
- **Tests:** browser, unit

### Step 5 — Watch in Emby

#### WATCH-001 Watch in Emby makes the track active

- **Statement:** Watch in Emby saves if needed, makes this track the movie's active track for every room, and opens the movie in Emby.
- **Acceptance:** Given an unsaved track, when Watch in Emby is clicked, then the track is saved, `GET /OpenLightFX/Tracks/ByItem` reports it selected with no device-scoped selection left for the movie, a new tab opens the Emby item page, and the confirmation names the room's screen.
- **Tests:** browser, fullstack, walkthrough

#### WATCH-002 Emby playback uses the room

- **Statement:** When Emby plays the movie on a room's screen, that room's bulbs follow the active track through routing.
- **Acceptance:** Given Living Room's screen is device D and a 5.0 track with `surround-left` blue at 0:03, when Emby playback on D reaches 0:04, then NDJSON shows blue at the Left bulbs (fold-down). Given playback on a device in no room, then no bulb receives a command and the Rooms screen lists that device as "not in a room".
- **Tests:** fullstack

### Process

#### DONE-001 No dead controls

- **Statement:** Every visible, enabled button, menu item, link, and switch on every J1 screen changes something observable.
- **Acceptance:** Given each J1 screen in a fixed state, when the dead-control check clicks every enabled control, then each one changes the URL, the DOM, a network request, or opens a dialog, or is on a reviewed allow-list with a reason. Any other control fails the test.
- **Tests:** browser

#### DONE-002 Walkthrough video

- **Statement:** Each step has a Playwright walkthrough that performs it as a person would, records video, and is watched before the step is done.
- **Acceptance:** Given the full stack, when `npm run test:walkthrough` (a new script, added with the first step) runs, then a video per step is written under `test-results/walkthrough/` and the PR for that step links the video and records who watched it.
- **Tests:** walkthrough

## Existing requirements: kept, revised, superseded

`docs/requirements/studio-requirements.md` stays the home for requirements that are not specific to this journey. On approval, the changes below are made there and the traceability gate is updated.

**Kept as written.** SHELL-001, SHELL-002, SHELL-004, SHELL-005, SHELL-006; MEDIA-002 to MEDIA-009, MEDIA-011, MEDIA-012, MEDIA-015, MEDIA-016; TIME-001 to TIME-005, TIME-007, TIME-010, TIME-011; KEY-002 to KEY-014; FX-004; CHAN-004, CHAN-005, CHAN-006; PROP-001 to PROP-006, PROP-008, PROP-009; UNDO-001 to UNDO-004; KEYB-001 to KEYB-003; SAVE-001, SAVE-003 to SAVE-009; IO-001 to IO-004; PREV-006, PREV-007, PREV-008, PREV-010, PREV-012; SAFE-001 to SAFE-003; PERF-001 to PERF-004; A11Y-001 to A11Y-004; ERR-001 to ERR-004, ERR-006, ERR-007; PLUG-001 to PLUG-005.

**Revised.**

| Requirement          | Change                                                                                                          | Replaced or joined by |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------- |
| SHELL-003            | Desktop layout is the editor layout in [Step 4](#step-4--edit): video and inspector over a full-width timeline. | EDIT-001, EDIT-007    |
| MEDIA-010            | Transport exists only in the editor, which always has a movie.                                                  | EDIT-007              |
| MEDIA-013            | Reload restores the route, item, and track.                                                                     | FLOW-003              |
| KEY-001              | A single click on a lane adds a keyframe, not a double click.                                                   | EDIT-003              |
| PROP-007             | Channel properties are default color and brightness. Id, display name, and hint come from the layout.           | MODEL-001             |
| IO-005               | A plain-text marketplace note is allowed on the Movie screen; still no control.                                 | TRACK-004             |
| PREV-001 to PREV-003 | The on-video regions follow the layout's positions. Kept as L2; not in J1.                                      | —                     |

**Superseded.**

| Requirement        | Why                                                                      | Replaced by                                                                                        |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| SHELL-010          | The empty-studio explainer becomes first run on Rooms.                   | FLOW-001                                                                                           |
| MEDIA-001          | Library is its own screen.                                               | LIB-001 to LIB-003                                                                                 |
| MEDIA-014, ERR-005 | Studio opens movies from Emby only. Local video files are not a J1 path. | —                                                                                                  |
| MEDIA-017          | Tracks open from the Movie screen.                                       | TRACK-001                                                                                          |
| TIME-006           | The minimap is the "Overview" bar that duplicated seeking.               | EDIT-001                                                                                           |
| CHAN-001           | Channel templates become layouts.                                        | MODEL-001, TRACK-002                                                                               |
| CHAN-002           | Channels are not added, renamed, or deleted by hand.                     | EDIT-014                                                                                           |
| CHAN-003           | Lane order is the layout's order.                                        | MODEL-001                                                                                          |
| SAVE-002           | Save no longer changes what Emby plays; Watch in Emby does.              | WATCH-001                                                                                          |
| PREV-004           | Channel-to-bulb mapping is replaced by room routing.                     | MODEL-003, MODEL-004, EDIT-004                                                                     |
| PREV-005           | Mapping profiles are retired.                                            | ROOM-011, WATCH-002                                                                                |
| PREV-009           | "No bulbs" becomes the no-room banner.                                   | EDIT-010                                                                                           |
| PLUG-006           | The plugin route list is replaced by the rooms API.                      | [rooms-api.md](https://github.com/openlightfx/openlightfx-emby/blob/main/docs/design/rooms-api.md) |

**Untouched, outside J1 (L2/L3).** SHELL-007 to SHELL-009, TIME-008, TIME-009, TIME-012, TIME-013, KEY-015, FX-001 to FX-003, FX-005, CHAN-007, KEYB-004, PREV-011.

## Proposed .lightfx format changes

The proto may change. These are additive proto3 fields, so old players ignore them and old tracks still decode. Recorded as FP-2 and FP-3 in [format-proposals.md](../requirements/format-proposals.md).

**FP-2 — `TrackMetadata.channel_layout` (required for new tracks).**

```proto
message TrackMetadata {
  // … fields 1–13 unchanged …

  // Channel layout this track is authored for. One of:
  //   LAYOUT_AMBIENT, LAYOUT_2_0, LAYOUT_3_0, LAYOUT_5_0
  // A string, like spatial_hint, so later layouts (e.g. 7.0, ceiling) need no schema change.
  // Empty means the track predates layouts; readers infer it from channel spatial hints.
  string channel_layout = 14;
}
```

New validation in both TrackParser (plugin) and Studio's validator, extending the existing V- codes:

| Code  | Rule                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| V-012 | `channel_layout`, when set, is one of the four values.                                                                                   |
| V-013 | When `channel_layout` is set, the track has exactly one channel per position of the layout, identified by `spatial_hint`, and no others. |

`version` stays 1: the change is additive and V-012/V-013 only apply when the field is set.

**FP-3 — Canonical position hints.** Document in the proto comment that, for tracks with a layout, `spatial_hint` is one of the six position hints in [Positions](#positions), `SPATIAL_BEHIND_SCREEN` is read as Center, and `SPATIAL_CEILING` / `SPATIAL_FLOOR` are reserved for a later layout. Comment-only.

Rooms, bulbs, positions, and Follows overrides are not in the track format. They describe a house, not a movie.

## Plugin API summary

Full design, storage, and code mapping: [openlightfx-emby `docs/design/rooms-api.md`](https://github.com/openlightfx/openlightfx-emby/blob/main/docs/design/rooms-api.md). All routes are under `/emby`, use the existing Studio authentication, and require the Emby Admin role for writes.

| Method and route                                          | Used by       | Purpose                                                                             |
| --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `GET /OpenLightFX/Studio/Setup`                           | Start-up      | Room count, whether legacy config exists, whether the caller is an admin.           |
| `GET /OpenLightFX/Studio/Rooms`                           | Rooms, editor | Every room with screen, bulbs, positions, overrides, `updatedAt`, suggested layout. |
| `POST /OpenLightFX/Studio/Rooms`                          | Rooms         | Create a room.                                                                      |
| `PUT /OpenLightFX/Studio/Rooms/{roomId}`                  | Rooms         | Replace a room, its screen, and its bulbs' positions. `If-Match: updatedAt`.        |
| `DELETE /OpenLightFX/Studio/Rooms/{roomId}`               | Rooms         | Delete a room; its bulbs become unplaced.                                           |
| `GET /OpenLightFX/Studio/Devices`                         | Screen picker | Every Emby device seen, with the room using it and unassigned recent playback.      |
| `POST /OpenLightFX/Studio/Discover`                       | Find bulbs    | Run discovery; return bulbs with stable ids, merged with known bulbs.               |
| `GET /OpenLightFX/Studio/Bulbs`                           | Rooms         | Every known bulb, placed or not. (Replaces today's route of the same name.)         |
| `PUT /OpenLightFX/Studio/Bulbs/{bulbId}`                  | Rename        | Name of a known bulb.                                                               |
| `POST /OpenLightFX/Studio/Bulbs/{bulbId}/Identify`        | Identify      | Flash one bulb.                                                                     |
| `GET` / `POST /OpenLightFX/Studio/Import/Legacy`          | Import card   | Preview, then apply, the legacy import.                                             |
| `GET /OpenLightFX/Studio/Rooms/{roomId}/Routing?layout=…` | Editor lanes  | Channel → bulbs and bulb → sources for a layout or a track's channel list.          |
| `POST /OpenLightFX/Studio/Preview/Start` (changed)        | Lights        | Takes `roomId` instead of a channel→bulb mapping.                                   |
| `POST /OpenLightFX/Studio/Preview/Frame` (changed)        | Lights        | Takes channel states; the plugin routes them.                                       |
| `POST /OpenLightFX/Studio/Items/{itemId}/ActiveTrack`     | Watch in Emby | Make a track the movie's active track; returns the Emby web URL.                    |
| `GET /OpenLightFX/Studio/Items` (extended)                | Library       | Adds `trackCount` and `hasActiveTrack`.                                             |

## Definition of done for each step

The journey is built one step at a time, in order: Rooms, Library, Movie, Editor, Watch. A step is done only when all of these are true:

1. Its requirements above are approved and moved into `studio-requirements.md`, and the traceability gate passes with no entry for this step in `tests/expected-failures.json`.
2. A walkthrough test drives the step through the real UI against the full stack (real Emby 4.9, the plugin from `main`, the simulator), like a person: it clicks what a person clicks and waits for what a person waits for. It records video.
3. The video has been watched by the agent that built the step and by the owner, and the PR links it. The person watching checks the screen against the wireframe and this document, not just that the test is green.
4. The dead-control check (DONE-001) passes on the step's screens.
5. The data is Emby-shaped: real item ids, real poster URLs, real device ids from the full stack. Mock data is for unit tests only.
6. Unit, browser (Firefox and Chromium), and full-stack tiers pass. No test is skipped, loosened, or listed as an expected failure to hide a real bug.

"All tests pass" is necessary, not sufficient.

## Out of scope

- **TV shows and episodes.** The Library lists movies only.
- **Marketplace** browsing, download, and publishing. Step 3 has a plain-text note only.
- **Effects authoring.** Effects in existing tracks are shown and kept. Placing and editing them is the next journey.
- **Layouts beyond Ambient, 2.0, 3.0, 5.0**, including ceiling, floor, and any ".1" low-frequency equivalent.
- **Per-track routing overrides.** Follows is per bulb, for every track.
- **More than one screen per room**, and a bulb in more than one room.
- **Moving the playback settings** (time offset, brightness cap, photosensitivity, start/end/credits overrides, log level) into Studio. They stay on the reduced plugin page under "Playback" for now ([OQ-J1-6](#open-questions)).
- Other journeys: reviewing a track in Emby with the room lights, sharing a track, multiple rooms watching at once, scene detection, the command palette, light theme, tablet layout.

## Open questions

The owner decides these before code. Each has a proposed default that this document already assumes.

| ID      | Question                                                                                                                                                                                                                         | Proposed default                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| OQ-J1-1 | Your John Wick track is Left, Right, Surround Left, Surround Right: a 4.0 layout. Add **4.0** as a fifth layout, or read such tracks as 5.0 with an empty Center (which fills from Left + Right)?                                | Read as 5.0 with an empty Center. Fewer layouts.                                |
| OQ-J1-2 | Should **fill** light bulbs the track has no channel for (a 2.0 track lights a 5.0 room's surround bulbs from Left and Right), or leave them dark like stereo audio leaves surround speakers silent?                             | Fill. A dark bulb in the room looks broken.                                     |
| OQ-J1-3 | When several channels land on one bulb: brightness-weighted color average with max brightness, or "the bulb's own position wins, folded channels only when it is dark"?                                                          | Weighted average. Effects: own position wins.                                   |
| OQ-J1-4 | Is Center "behind or around the screen" (a bias light), or a separate front-center lamp? The proto has both `SPATIAL_CENTER` and `SPATIAL_BEHIND_SCREEN`.                                                                        | One Center position that includes behind the screen.                            |
| OQ-J1-5 | Can a room be saved before it has a screen (e.g. the TV app has never been opened), or is the screen required?                                                                                                                   | Required. The empty state tells you to open Emby on the TV once.                |
| OQ-J1-6 | The plugin page shrinks to a link. Do the playback settings (offset, brightness cap, photosensitivity, behavior overrides, log level) stay on it under "Playback" until a later Studio Settings screen, or move into Studio now? | Stay on the plugin page for J1. Bulb, profile, and device JSON fields leave it. |
| OQ-J1-7 | Watch in Emby sets the movie's active track for every room. Should it instead set it only for the preview room's screen (the old per-device selection)?                                                                          | Every room.                                                                     |
| OQ-J1-8 | Emby remembers every app that ever signed in: phones, browsers, the TV. Should the Screen picker list them all, or only TV and media-player apps, with a "Show all devices" toggle?                                              | List all, newest activity first, with app names, so nothing is hidden.          |
| OQ-J1-9 | Retire openlightfx.com/config outright, or make it a page that says "Setup moved into OpenLightFX Studio on your Emby server"?                                                                                                   | Replace it with that one-line page.                                             |
