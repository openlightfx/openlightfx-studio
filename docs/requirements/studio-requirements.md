# OpenLightFX Studio — requirements

**Status:** every requirement below is `approved`. Open questions OQ-1, OQ-2, and OQ-3 are recorded in [Open questions](#open-questions). FP-1 stays deferred.

**Product:** Studio is the timeline editor for `.lightfx` tracks. The Emby plugin hosts it as a static SPA at `/emby/OpenLightFX/studio/` and is the primary way to use it. Movies come from the Emby library. Playback in Emby of that movie is what the track is for: the plugin drives WiZ, LIFX, Hue, Govee, and generic REST bulbs in sync with the film.

**Normative sources, in this order when they agree:**

1. The requirements in this document.
2. Owner decisions recorded in [Conflicts resolved](#conflicts-resolved).
3. Plugin behavior: Emby plugin PR [openlightfx-emby#1](https://github.com/openlightfx/openlightfx-emby/pull/1) at `6829915` for hosting, and the playback engine at `3b083d1` (`TrackParser`, `InterpolationEngine`, `PlaybackSession`, effect renderers, `PhotosensitivityFilter`).
4. `proto/lightfx.proto` in this repo (format version 1).

The March rewrite design (`docs/superpowers/specs/2026-03-28-studio-rewrite-design.md` on `feat/refactor`) is background. It is not normative where a conflict below says otherwise. `docs/TODO.md` on that branch is a list of hints only. The file it scored (`../requirements/openlightfx-studio.md`, 149 `STU-xxx` items) is gone. The "121 PASS" tally came from reading code, and the app built from that work did not survive real use. This spec does not reuse `STU` IDs and does not treat any of that code as accepted.

**How a requirement is written:** stable ID, one-sentence statement, layer (`L1` core loop, `L2`, `L3`), and Given/When/Then acceptance. The `Tests` line is the tier map. Tiers are defined in [Test strategy](#test-strategy). Traceability rules and the CI script are in [traceability.md](traceability.md).

**Layers:**

| Layer | Meaning                                                                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1    | The core loop a person can finish on a desktop browser, including Firefox: open Studio from Emby, pick a movie, play it with visible transport, edit channels and keyframes, preview on screen and on bulbs, save, and have Emby playback use that track. |
| L2    | Effects, groups, markers, command palette, light theme, tablet layout, metadata depth. The core loop does not depend on these.                                                                                                                            |
| L3    | Marketplace, cloud publish, and automatic track generation. No L1 or L2 screen shows a disabled marketplace control.                                                                                                                                      |

**Out of scope for L1:** ffmpeg.wasm, the File System Access API, COOP/COEP, hosting at openlightfx.studio, slaving Studio's playhead to a living-room Emby session, persisting undo history, and the reserved loop-point auto-swap mentioned in TODO.md.

---

## Journeys

Each journey is a path a person actually takes. Steps name the requirements that make the path true. L1 journeys are the acceptance bar for "Studio works".

### J1 — Author a track from Emby and play it back

L1. This is the loop the duration-first "New" dialog, the unplayable movie, and the missing transport all failed.

1. From Emby, open `/emby/OpenLightFX/studio/` (token in the query or header). The shell loads in the page Emby served. No COOP/COEP error in Firefox. `SHELL-001`, `SHELL-002`, `SHELL-004`, `PERF-001`, `MEDIA-014`.
2. The library, the movie box, the transport, and the timeline are all on screen at 1280×720. Save, undo, and play are buttons, not palette entries. Nothing asks for a duration. `SHELL-003`, `SHELL-005`, `SHELL-006`, `MEDIA-010`, `A11Y-001`.
3. Pick a movie. The track length becomes that item's runtime. The title defaults to the movie name. Stereo channels appear, each with a black keyframe at 0. A proxy build starts. `MEDIA-001`, `MEDIA-002`, `MEDIA-015`, `CHAN-001`, `CHAN-005`, `PROP-009`, `SAVE-009`.
4. Press Play. The picture advances from an H.264 edit proxy. Seeking does not restart a movie transcode. `MEDIA-003`, `MEDIA-004`, `MEDIA-011`, `MEDIA-016`, `PLUG-001`, `PLUG-003`, `PERF-004`.
5. Pause, scrub, skip 5 seconds, and step one frame-grid unit. The time readout follows the grid. The picture lands within one proxy GOP. `MEDIA-005`, `MEDIA-006`, `MEDIA-007`, `MEDIA-008`, `MEDIA-009`, `MEDIA-012`, `TIME-004`, `TIME-005`, `PERF-003`.
6. Add and edit keyframes with the pointer and with K. Zoom from the on-screen controls. `TIME-001`, `TIME-002`, `TIME-008`, `TIME-010`, `KEY-001`, `KEY-002`, `KEY-003`, `KEY-009`, `PROP-001`, `KEYB-001`.
7. Eyedropper: Studio asks the plugin for a tone-mapped frame at the playhead and samples that image. `PROP-004`, `PROP-005`, `PLUG-002`.
8. The on-screen glow matches the sampler. Map channels to bulbs and preview. Bulbs follow within the latency target. `PREV-001`, `PREV-002`, `PREV-004`, `PREV-005`, `PREV-006`.
9. Save. The plugin writes `.lightfx` under the movie's `lightfx/` folder, writes the project sidecar, selects the track for the item, and rejects a file `TrackParser` would reject. `SAVE-001`, `SAVE-002`, `SAVE-003`, `SAVE-004`, `KEY-008`, `SAFE-001`, `PLUG-004`, `PLUG-006`.
10. Play that movie in Emby. The headless simulator shows the keyframe color at the keyframe time. `SAVE-002`, `PREV-006`.

L2 continuation, not required for J1 to pass: place an effect and see it on the overlay and on the bulbs (`FX-002`, `FX-003`, `PREV-011`).

### J2 — Open an existing track and reload

L1.

1. The movie already has one `.lightfx` file. Choosing the movie opens that track and starts the same proxy. Keyframes are where the file says they are. `MEDIA-017`, `IO-001`.
2. Several tracks: Studio lists them and offers New track. It does not guess. `MEDIA-017`.
3. Move a keyframe, undo, save. `UNDO-001`, `UNDO-002`, `SAVE-001`.
4. Reload the browser. The same Emby item comes back without a file picker, because the media reference is the item id. Unsaved edits return from IndexedDB when they are newer than the server. Undo does not return. `MEDIA-013`, `SAVE-005`, `SAVE-006`, `SAVE-007`, `UNDO-004`.

### J3 — Import and export

L1.

1. Import a `.lightfx` file onto the selected movie. Channels and keyframes appear. A file `TrackParser` rejects is refused with the rule ids. `IO-001`, `IO-002`, `IO-003`.
2. If the imported duration differs from the movie runtime by more than 5 seconds, Studio warns and offers "Use movie duration". A track created from the movie does not warn. `IO-004`.
3. Download a `.lightfx` file. Hosted Save still goes to the plugin. There is no File System Access API path. `SAVE-008`.

### J4 — Backend down, bad media, lights already in use

L1.

1. The proxy or the video element fails. Transport stays visible. The message says what failed and offers retry. The timeline is still there. `ERR-001`.
2. The plugin API does not answer. Studio does not invent a library. Edits already in memory stay. Save offers a download. `ERR-002`, `ERR-004`.
3. A local HEVC/MKV/TrueHD file is refused with instructions to open the movie from Emby. An H.264 MP4 can still play in dev. `MEDIA-014`, `ERR-005`.
4. Emby is already driving bulbs for a playing movie. On-screen preview still runs. Bulb preview does not start until the person chooses takeover. Stop restores the snapshot from takeover time and does not resume live sync by itself. `PREV-007`, `PREV-008`, `PREV-009`, `PLUG-005`.
5. The eyedropper endpoint fails. The keyframe color is unchanged. `ERR-007`.
6. Runtime is missing and probe returns nothing. Plugin save is blocked. Studio still does not ask the person to type a duration. `ERR-006`, `MEDIA-015`.

### J5 — Real movie on the owner's machine

On-demand, not CI. Characteristics, not a title: about 25 GB, 4K, HEVC 10-bit, HDR10 (PQ), TrueHD, PGS subtitles, about 101 minutes.

1. Open it from the Emby library in Firefox. Studio never fetches the MKV into the browser and never runs ffmpeg.wasm.
2. An edit proxy starts. The first picture at time 0 appears within 20 seconds while the rest of the proxy can still be encoding.
3. A seek to a time the proxy already contains completes within 1.5 seconds (p95). Frame step moves the time grid, and the picture is allowed to be up to one GOP away.
4. Track duration is the Emby runtime, not a typed value.
5. Eyedropper returns a tone-mapped sRGB frame within 15 seconds (p95), time error ≤ 40 ms, header `hable-bt709`.
6. Save, then play the movie in Emby. Bulb colors for a step keyframe show up within 1.5 seconds of the player crossing that time at the default 500 ms poll.
7. If an existing `.lightfx` is configured for this item, J2 applies to it.

`MEDIA-003`, `MEDIA-006`, `MEDIA-007`, `MEDIA-011`, `PROP-005`, `PLUG-002`, `PLUG-003`, `PREV-006`. The tier is defined in [T6](#t6--real-media-on-demand).

---

## Requirements

### App shell and navigation

#### SHELL-001 Studio loads from the plugin URL

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** Studio is a static SPA served by the plugin at `/emby/OpenLightFX/studio/` and reloads there.

**Acceptance:**

- Given the plugin has the built assets and a valid admin token
- When the browser opens `/emby/OpenLightFX/studio/?api_key=` with no trailing slash
- Then the plugin redirects to the trailing-slash URL, `index.html` loads, script and style URLs resolve under that directory, and a second load of that URL shows the shell
- Given a reload on `/emby/OpenLightFX/studio/?itemId=42`
- When the plugin receives the document request
- Then the response is the SPA HTML, not a 404

#### SHELL-002 Hosted Studio is the product and dev mode is labeled

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A page served by the plugin stays in hosted mode, and a dev server without the plugin shows that it is local.

**Acceptance:**

- Given the page URL is under `/OpenLightFX/studio/` or `/emby/OpenLightFX/studio/`
- When the Bulbs or Items request fails
- Then the UI says the plugin is unreachable and does not show a built-in catalog of fake movies
- Given `npm run dev` opened at its local origin
- When the plugin is absent
- Then the screen says it is local dev and offers an H.264 file picker, and it does not present three pretend library titles

#### SHELL-003 Desktop layout keeps transport on screen

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** At 1280×720 the movie, transport, and timeline are all inside the viewport, and the movie keeps its aspect ratio.

**Acceptance:**

- Given a 1280×720 viewport and a 16:9 movie selected
- When the shell has finished loading
- Then the play button, the scrubber, the current time, and the duration are within the viewport and are not `display: none`, `visibility: hidden`, or `aria-hidden`
- Then the movie box letterboxes the frame and the video element is not cropped to a different aspect ratio
- Given a 375×700 viewport
- When L1 layout is used
- Then horizontal page scroll is absent and the play button is still reachable without a tablet-only layout

#### SHELL-004 Dark theme is the L1 appearance

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A fresh session opens in the dark theme.

**Acceptance:**

- Given a fresh session with no saved theme
- When the shell renders
- Then the page background computes to a dark color (relative luminance below 0.2)

#### SHELL-005 Core actions are buttons

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Save, undo, redo, play, and movie choice are visible controls in L1.

**Acceptance:**

- Given a movie is loaded
- When the user looks at the shell without opening a palette or a menu
- Then buttons named Save, Undo, Redo, and Play (or Pause while playing) are visible
- Then choosing a different movie does not require a command palette

#### SHELL-006 Title and save state are visible

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The top bar shows the movie or track title and whether there are unsaved edits.

**Acceptance:**

- Given a movie named "Proxy Fixture"
- When it is selected and a keyframe is added
- Then the top bar shows "Proxy Fixture" and a visible unsaved state
- When save succeeds
- Then the unsaved state clears

#### SHELL-010 An empty studio explains how to start

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** With no movie open, Studio tells the user how to pick a movie, add a keyframe, map bulbs, and save.

**Acceptance:**

- Given no movie is selected
- When the shell renders
- Then a guide says to pick a movie, add a channel, click the timeline to add a keyframe, map bulbs, and save
- Then the timeline shows a time ruler
- Given a movie is open
- When the editor renders
- Then the library row shows the movie title and a poster, and the timeline ruler is still visible

#### SHELL-007 Command palette

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** F1 opens a command palette that runs the actions it lists.

**Acceptance:**

- Given focus is not in a text field
- When the user presses F1
- Then a dialog opens listing actions, each with its shortcut if it has one
- When the user runs "Add keyframe" from that list with a channel active
- Then a keyframe is created as in `KEY-002`
- Given the user presses Ctrl+K or Cmd+K
- When the key event reaches the page
- Then the palette does not open

#### SHELL-008 Light theme

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** Light theme is available from Shift+D and from a visible menu, and it persists in the browser.

**Acceptance:**

- Given the dark shell
- When the user presses Shift+D
- Then the page background luminance is above 0.7
- When the page reloads
- Then the light theme is still on
- Given Ctrl+D or Ctrl+Shift+D
- When either chord is pressed
- Then the theme does not change

#### SHELL-009 Tablet layout

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** At a coarse-pointer width the movie stacks above the timeline and popovers become sheets.

**Acceptance:**

- Given a 768×1024 viewport and a coarse pointer
- When a keyframe is selected
- Then the movie is above the timeline in document order and the keyframe properties render as a bottom sheet
- Then play, save, and the scrubber have a CSS hit box of at least 44×44 px

### Media loading and playback

#### MEDIA-001 Library lists Emby movies

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** The library lists movies from the plugin Items API and the search box narrows that list.

**Acceptance:**

- Given the plugin returns two movies, one with `runtimeMs` 101000 and `year` 2020
- When the library renders
- Then both names are shown with year and runtime, and virtual items are absent because the API omitted them
- Given the API returns 200 items
- When they render
- Then the UI says the list is capped and that search narrows it
- When the user types a search of at least one character
- Then Studio calls Items with that search and replaces the list
- Given an item whose JSON uses Emby fields `Name` and `ProductionYear`
- When the library renders
- Then the visible row shows that title and year, plus a poster image, and does not show the year alone or the word movie in place of a title

#### MEDIA-002 Duration comes from the selected movie

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** Selecting a movie sets the track duration from the item runtime and never asks for a duration first.

**Acceptance:**

- Given an item with `runtimeMs` 6060000 and no existing track
- When the user selects it
- Then `metadata.duration_ms` becomes 6060000, the timeline length matches that value, and no input labeled duration was shown before or after the click
- Given the user has not selected a movie or a local file
- When they look for a way to create a track
- Then there is no duration field and no Create action that requires one

#### MEDIA-003 The editor plays an H.264 proxy

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** The video element plays the edit-proxy URL and never the source MKV or a seek-restarting transcode.

**Acceptance:**

- Given a movie whose source is HEVC in MKV
- When the proxy URL is ready and assigned
- Then `video.src` is that URL, the URL is a direct file response (range requests return 206, and the URL does not include a transcode `VideoCodec` parameter), and the response codec is H.264
- Then no request from the page downloads the source MKV body
- Given the user scrubs ten times
- When the network log is inspected
- Then Emby did not start a new full-movie transcode session for those seeks

#### MEDIA-004 Play advances the picture

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** Play starts the proxy and the picture advances.

**Acceptance:**

- Given the proxy has fired `loadeddata`
- When the user activates Play
- Then within 1 second `video.paused` is false, and 1 second later `currentTime` has increased by at least 0.4 seconds
- Then the control's accessible name is Pause

#### MEDIA-005 Pause holds the frame

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Pause stops the proxy and holds the playhead.

**Acceptance:**

- Given the proxy is playing
- When the user activates Pause
- Then `video.paused` is true within 1 second and `currentTime` changes by less than 0.25 seconds over the next second

#### MEDIA-006 Seeks on the proxy are fast

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** Once the proxy contains a time, seeking there completes quickly and lands within one GOP.

**Acceptance:**

- Given a finished synthetic proxy with `keyframeIntervalMs` ≤ 500
- When the test seeks to 20 times spread across the clip, measuring from the `currentTime` assignment to `seeked`
- Then p95 latency is ≤ 400 ms in Firefox and in Chromium on localhost
- Then each landed `currentTime` is within 500 ms of the requested time
- Given the user is dragging the scrubber
- When the pointer moves
- Then the numeric time updates immediately, video seeks are coalesced to at most one every 200 ms plus one seek on pointer-up, and the pointer-up seek meets the same p95

#### MEDIA-007 Frame step moves a time grid

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Frame step moves the playhead by one proxy frame period, and the picture is only guaranteed within one GOP.

**Acceptance:**

- Given a proxy reporting `fps` 24, so one frame is 42 ms (`round(1000/24)`)
- When the user activates next frame 24 times from a pause at 0
- Then the time readout is 1008 ms and each step's `seeked` event meets the `MEDIA-006` latency once that time is in the proxy
- Then the spec does not require the pixels to be the next frame of the original HEVC file; the displayed picture may be up to `keyframeIntervalMs` away from the readout
- Given Firefox and Chromium
- When the step runs
- Then both browsers set `currentTime` to the grid time, and neither test calls `seekToNextFrame`

#### MEDIA-008 Skip five seconds

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Skip back and skip forward move the playhead by five seconds inside the movie.

**Acceptance:**

- Given the playhead is at 10.0 seconds and the proxy contains 0 through 20 seconds
- When the user activates skip forward and then skip back
- Then the readout is 15.0 seconds and then 10.0 seconds, each within 0.5 seconds, and each seek meets `MEDIA-006`

#### MEDIA-009 Space toggles playback

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Space toggles play and pause unless a text field or a focused button should receive it.

**Acceptance:**

- Given focus is on the movie region and a proxy is loaded
- When the user presses Space
- Then playback toggles and the page does not scroll
- Given focus is in a text input
- When the user presses Space
- Then the input receives the space and playback does not toggle
- Given focus is on a button other than Play
- When the user presses Space
- Then that button activates and playback does not also toggle

#### MEDIA-010 Transport is present before and after a movie

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The transport is always rendered, and it is disabled with a reason until a movie or a local file is loaded.

**Acceptance:**

- Given no movie is selected
- When the shell renders
- Then the play control is visible, disabled, and exposes a reason such as "Choose a movie"
- Then the document contains no input whose name or label is a track duration
- Given a movie is selected and the proxy is still building
- When the user looks at the transport
- Then play is visible, and if it is disabled the reason is the proxy progress, not a missing control

#### MEDIA-011 Time to first picture

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack, realmedia
- **Statement:** The edit proxy shows a first frame at time 0 within a fixed budget.

**Acceptance:**

- Given a synthetic source of 30 seconds or less
- When the user selects the item and the clock starts
- Then `readyState` ≥ 2 and `videoWidth` > 0 within 10 seconds (p95), including proxy generation, in Firefox and Chromium
- Given the real-media tier item of about 101 minutes
- When the user selects it
- Then the first picture at time 0 appears within 20 seconds while later portions of the proxy may still be encoding

#### MEDIA-012 Playhead tracks the picture

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** While the proxy plays, the timeline playhead stays within 50 ms of the video clock.

**Acceptance:**

- Given the proxy is playing for 10 seconds
- When samples are taken every animation frame
- Then p95 of `|playheadMs − currentTime × 1000|` is ≤ 50

#### MEDIA-013 Reload restores the Emby item

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** The selected movie is an Emby item id, so a reload opens that movie again.

**Acceptance:**

- Given the user selected item 42
- When the URL is inspected
- Then the query contains `itemId=42`
- When the page reloads
- Then Studio requests the proxy for item 42 and does not open a file picker
- Given a hosted session
- When local files were never chosen
- Then reload still restores the item

#### MEDIA-014 Local files are browser-playable only

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Local dev plays H.264 MP4 in Firefox and refuses HEVC, MKV, and TrueHD without ffmpeg.wasm or the File System Access API.

**Acceptance:**

- Given local dev and an H.264/AAC MP4 of clip A
- When the user picks it in Firefox
- Then it plays with the same transport as a proxy
- Given a file whose type or extension is MKV, HEVC, or TrueHD
- When the user picks it
- Then playback does not start and the message tells them to open the movie from Emby
- Given the production bundle and the dev bundle
- When their module graphs are inspected
- Then neither imports ffmpeg.wasm, neither references `showSaveFilePicker` or `showOpenFilePicker`, and the app still reaches the shell when COOP and COEP are absent

#### MEDIA-015 Missing runtime is probed

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack, unit
- **Statement:** A movie with no Emby runtime takes its duration from the plugin probe and still does not ask the user.

**Acceptance:**

- Given Items returns `runtimeMs` 0 and MediaInfo returns `runtimeMs` 120000
- When the user selects the item
- Then the track duration becomes 120000 before any keyframe edit
- Then no duration input is shown

#### MEDIA-016 Proxy generation does not block editing or fall back

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** The timeline stays usable while a proxy builds, and seeks past the encoded horizon do not start a full transcode.

**Acceptance:**

- Given proxy state is `building` and `encodedThroughMs` is 0
- When the user adds a keyframe
- Then the keyframe is created and the transport shows preparation progress
- Given `encodedThroughMs` is 5000 and the user seeks to 20000
- When the seek is requested
- Then the picture can already be playing from time 0 while `state` is still `building`
- Then the UI shows `Still encoding to 00:05` and waits there, and the network log has no full-movie transcode request

#### MEDIA-017 Existing tracks open with the movie

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** A movie with one track opens that track, and a movie with several tracks asks which one.

**Acceptance:**

- Given the plugin lists one track for the item
- When the user selects the movie
- Then that track's channels and keyframes render and the proxy starts
- Given the plugin lists two tracks
- When the user selects the movie
- Then both titles are shown plus New track, and no keyframes appear until one is chosen

### Timeline view

#### TIME-001 Canvas lanes show keyframes

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** The timeline is a canvas with one lane per channel and a mark for each keyframe in view.

**Acceptance:**

- Given two channels and four keyframes with known colors
- When the timeline paints
- Then each keyframe mark uses that keyframe's RGB and sits in its channel lane at its time
- Then the marks are canvas pixels, not one DOM node per keyframe

#### TIME-002 Zoom uses on-screen controls and safe keys

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Zoom in, zoom out, and zoom to fit are buttons, and the keys are `[`, `]`, and `\`.

**Acceptance:**

- Given a 10 minute timeline
- When the user activates Zoom in
- Then `pxPerMs` increases
- When the user activates Zoom to fit
- Then the full duration fits the lane width
- When the user presses `]` and then `[` with focus outside a text field
- Then zoom in and zoom out happen
- When the user presses Ctrl or Cmd with `+`, `-`, or `0`
- Then Studio does not change `pxPerMs`

#### TIME-003 Pan

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The timeline pans horizontally with Shift+wheel, a scrollbar, and a middle-button drag.

**Acceptance:**

- Given the zoomed timeline is wider than the viewport
- When the user Shift+wheels down over the lanes
- Then `scrollX` increases and the page does not scroll
- Then a horizontal scrollbar is visible and dragging it changes `scrollX`

#### TIME-004 Playhead is drawn

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A playhead line is drawn at the current movie time.

**Acceptance:**

- Given the playhead is at 5000 ms and the view starts at 0
- When the timeline paints
- Then a vertical playhead is visible at the x position for 5000 ms

#### TIME-005 Follow during playback only

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** During playback the view keeps the playhead on screen, and while paused it does not steal the scroll position.

**Acceptance:**

- Given playback and a playhead that has reached 75% of the lane width
- When the next paint runs
- Then the view shifts so the playhead is at about 25% of the width (within 10% of the width)
- Given paused playback and a scroll position set by the user
- When the playhead is moved by a keyframe edit elsewhere
- Then `scrollX` stays put
- Given the user scrubs to a time outside the view
- When the scrub commits
- Then the playhead is inside the view

#### TIME-006 Minimap

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A minimap at least 48 px tall shows the whole movie and navigates when clicked.

**Acceptance:**

- Given a timeline
- When it renders
- Then the minimap height is ≥ 48 px and ≤ 80 px
- When the user clicks the midpoint of the minimap
- Then the view scrolls so the midpoint time is inside the lanes

#### TIME-007 Offscreen keyframes are not drawn

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** The draw list contains only keyframes that intersect the visible time range.

**Acceptance:**

- Given keyframes at 0 ms and at 3,600,000 ms and a view that shows only 0–10,000 ms
- When the viewport filter runs
- Then the result contains the 0 ms keyframe and omits the 3,600,000 ms keyframe

#### TIME-008 Selection gestures

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Click, Ctrl or Cmd click, and Shift click select keyframes, and clicking empty space clears the selection.

**Acceptance:**

- Given two keyframes in one lane
- When the user clicks the first
- Then only that keyframe is selected
- When the user Ctrl-clicks or Cmd-clicks the second
- Then both are selected
- When the user Shift-clicks from the first to the second
- Then the inclusive range on that lane is selected
- When the user clicks empty lane
- Then the selection is empty

#### TIME-009 Marquee selection

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Dragging a rectangle on empty timeline selects the keyframes inside it.

**Acceptance:**

- Given four keyframes
- When the user drags a rectangle that encloses all four
- Then all four ids are selected

#### TIME-010 Drag, snap, and minimum spacing

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Dragging a keyframe snaps to whole seconds, the playhead, and other keyframes, and enforces the minimum spacing.

**Acceptance:**

- Given minimum spacing 200 ms, a keyframe at 1000 ms, and another at 5000 ms
- When the user drags the second near 2000 ms and releases within 8 px of that second
- Then its time is 2000 ms and a snap guide was visible during the drag
- When the user drags it toward 1000 ms
- Then it stops at 1200 ms
- Given the spacing control
- When the user sets 100, 200, and 1000
- Then those three values are accepted and 50 and 5000 are rejected

#### TIME-011 Zoom to fit the movie

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Zoom to fit shows the whole track duration in the lane.

**Acceptance:**

- Given duration 7,200,000 ms
- When the user activates Zoom to fit
- Then time 0 and time 7,200,000 are both inside the lane horizontally

#### TIME-012 Extra snap targets

- **Layer:** L2
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** Snapping can also target 500 ms marks and the proxy frame grid.

**Acceptance:**

- Given frame snap is on and the proxy fps is 24
- When a keyframe is dragged near a frame boundary and released
- Then its time is that boundary in whole milliseconds
- Then a snap guide is visible while the pointer is within 8 px of the target

#### TIME-013 Scene markers

- **Layer:** L2
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Scene markers are drawn on the timeline and stored only in the project sidecar.

**Acceptance:**

- Given a marker at 1000 ms labeled Intro
- When the timeline paints
- Then a vertical marker labeled Intro is visible
- When the track is encoded to protobuf
- Then the protobuf has no marker field and the sidecar contains the marker
- When the user presses M with a movie loaded and focus outside a text field
- Then a marker is created at the playhead

### Keyframe editing

#### KEY-001 Double-click inserts a keyframe

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Double-clicking a lane inserts a keyframe at that time on that channel and selects it.

**Acceptance:**

- Given a stereo track and a click time that maps to 2500 ms
- When the user double-clicks the left lane there
- Then a keyframe exists on `left` within 50 ms of 2500 ms after snapping, and it is the only selection
- Then the properties popover is open

#### KEY-002 K inserts at the playhead

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** K inserts a keyframe at the playhead on the active channel, and it tells the user when no channel is active.

**Acceptance:**

- Given the active channel is `right` and the playhead is 4000 ms
- When the user presses K
- Then `right` has a new keyframe at 4000 ms, selected
- Given no active channel
- When the user presses K
- Then no keyframe is created and a toast says to select a channel

#### KEY-003 New keyframe defaults

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** A new keyframe copies the previous look, uses step interpolation, and uses a zero transition.

**Acceptance:**

- Given the previous keyframe on the channel is RGB 10,20,30 brightness 40
- When a keyframe is created later on that channel
- Then it has RGB 10,20,30, brightness 40, interpolation STEP, and `transition_ms` 0
- Given no previous keyframe
- When one is created
- Then it is RGB 0,0,0, brightness 0, STEP, and `transition_ms` 0

#### KEY-004 Delete selection

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Delete and Backspace remove the selected keyframes.

**Acceptance:**

- Given two selected keyframes
- When the user presses Delete or Backspace
- Then both are gone and undo restores both in one step

#### KEY-005 Times stay inside the movie and the transition rule

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** Keyframe times stay inside the track, and transition length never exceeds the keyframe time.

**Acceptance:**

- Given duration 10,000 ms
- When a drag would move a keyframe to −100 ms or to 20,000 ms
- Then the stored time is 0 or 10,000
- Given a keyframe at 300 ms
- When transition is set to 500 ms
- Then the stored transition is 300 ms

#### KEY-006 One keyframe per channel per time

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** A channel cannot have two keyframes closer than the minimum spacing.

**Acceptance:**

- Given a keyframe at 1000 ms and minimum spacing 200 ms
- When another keyframe is inserted at 1100 ms on that channel
- Then the insert is refused and the existing keyframe remains

#### KEY-007 Multi-select edit

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** An edit to a shared property applies to every selected keyframe, and mixed values show a dash.

**Acceptance:**

- Given two selected keyframes with brightness 10 and 90
- When the popover shows brightness
- Then the value is an em dash
- When the user sets brightness to 50
- Then both keyframes have brightness 50

#### KEY-008 Encoded keyframes validate

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** The encoder writes version 1 and orders each channel's keyframes by time.

**Acceptance:**

- Given keyframes edited in an order that is not time order
- When Studio encodes the track
- Then for each channel the file order of `timestamp_ms` is non-decreasing
- Then `version` is 1, every `transition_ms` is ≤ its `timestamp_ms`, and every time is ≤ `duration_ms`

#### KEY-009 Step holds until the keyframe instant

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** STEP interpolation holds the previous state until the next keyframe's own timestamp.

**Acceptance:**

- Given keyframe A at 0 ms RGB 0,0,0 brightness 0 transition 0, and keyframe B at 1000 ms RGB 255,0,0 brightness 100 transition 500 interpolation STEP
- When the sampler runs at 750 ms
- Then the state is RGB 0,0,0 brightness 0
- When the sampler runs at 1000 ms
- Then the state is RGB 255,0,0 brightness 100

#### KEY-010 Linear blend uses round-half-to-even

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** LINEAR blends across the transition window and rounds with half-to-even, matching the plugin.

**Acceptance:**

- Given A at 0 ms RGB 0,0,0 brightness 0, and B at 1000 ms RGB 255,0,0 brightness 100 transition 500 interpolation LINEAR
- When the sampler runs at 499 ms
- Then the state equals A
- When the sampler runs at 750 ms
- Then RGB is 128,0,0 and brightness is 50, because 127.5 rounds half-to-even to 128
- Then the implementation does not use JavaScript `Math.round` for this blend, because `Math.round(0.5)` is 1 and the plugin's round of 0.5 is 0

The window is `[timestamp_ms − transition_ms, timestamp_ms]` of the upcoming keyframe. `t = (now − start) / (end − start)`. LINEAR uses `t`. STEP uses 0 until `t` is 1.

#### KEY-011 Empty spans match playback, not channel defaults

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** Before the first keyframe the sampler is black, and after the last keyframe it holds that keyframe.

**Acceptance:**

- Given one keyframe at 2000 ms RGB 0,255,0 brightness 40 transition 0, and a channel default color of red
- When the sampler runs at 1999 ms
- Then RGB is 0,0,0 and brightness is 0
- When the sampler runs at 2000 ms and at 9000 ms
- Then RGB is 0,255,0 and brightness is 40
- Given B with `transition_ms` 0 at 1000 ms
- When the sampler runs at 999 ms and at 1000 ms
- Then 999 ms is the previous state and 1000 ms is B

#### KEY-012 Color temperature uses the plugin conversion

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** Color-temperature blends lerp kelvin and convert with the plugin's truncated Tanner Helland function.

**Acceptance:**

- Given two COLOR_TEMPERATURE keyframes, 2700 K at 0 ms and 6500 K at 1000 ms, both brightness 100, with the second transition 1000 and LINEAR
- When the sampler runs at 500 ms
- Then kelvin is 4600, RGB is 255,219,191, and the mode is COLOR_TEMPERATURE
- Given a single keyframe at 2700 K and another at 6500 K with no blend
- When each is converted
- Then 2700 K is RGB 255,166,87 and 6500 K is RGB 255,254,250
- Given one end is COLOR_TEMPERATURE and the other is RGB
- When they blend
- Then the result mode is RGB and kelvin is 0

Conversion: `temp = clamp(kelvin, 1000, 40000) / 100`. At `temp ≤ 66`, red is 255, green is `99.4708025861 * ln(temp) − 161.1195681661`, blue is 0 at `temp ≤ 19` and otherwise `138.5177312231 * ln(temp − 10) − 305.0447927307`. Above 66, blue is 255, red is `329.698727446 * (temp − 60) ^ −0.1332047592`, green is `288.1221695283 * (temp − 60) ^ −0.0755148492`. Each channel is clamped to 0–255 and truncated toward zero. `ln` is the natural log.

#### KEY-013 Unspecified interpolation is linear

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** An unset interpolation value blends as LINEAR.

**Acceptance:**

- Given the `KEY-010` pair with interpolation left at the protobuf default 0
- When the sampler runs at 750 ms
- Then RGB is 128,0,0 and brightness is 50

#### KEY-014 power_on does not change the preview color

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** The power flag is stored and round-tripped, and preview color follows brightness and RGB.

**Acceptance:**

- Given a keyframe RGB 255,0,0 brightness 100 with `power_on` false
- When the sampler and the preview frame are produced
- Then the preview color is RGB 255,0,0 brightness 100
- Then the encoded protobuf preserves `power_on` false
- Given brightness 0
- When the overlay draws that channel
- Then the region is dark

#### KEY-015 Copy and paste

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** Copy and paste duplicate selected keyframes at the playhead, including onto another channel.

**Acceptance:**

- Given a selected keyframe at 1000 ms on `left` and the playhead at 3000 ms
- When the user presses Ctrl+C or Cmd+C and then Ctrl+V or Cmd+V with `right` active
- Then `right` gains a keyframe at 3000 ms with the same color and brightness
- Given no active channel
- When the user pastes
- Then nothing is created and a toast says to select a channel

### Effects

#### FX-001 Effect catalog

- **Layer:** L2
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** The editor can place the 13 effect types defined in the proto.

**Acceptance:**

- Given the effect list is open
- When it renders
- Then it offers LIGHTNING, FLAME, FLASHBANG, EXPLOSION, PULSE, STROBE, SIREN, AURORA, CANDLE, GUNFIRE, NEON, BREATHING, and SPARK, and no fourteenth type

#### FX-002 Place and edit an effect

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** The user can place an effect on a lane and edit its time, duration, intensity, and colors.

**Acceptance:**

- Given the `left` lane
- When the user places LIGHTNING at 2000 ms for 1000 ms
- Then the timeline shows a block from 2000 ms to 3000 ms on `left`
- When intensity is set to 80
- Then the stored intensity is 80
- When duration is set to 0
- Then the edit is refused

#### FX-003 Effect sampling matches the plugin

- **Layer:** L2
- **Status:** approved
- **Tests:** fixture
- **Statement:** Studio's effect sampler matches the plugin renderers on the shared fixture.

**Acceptance:**

- Given the fixture generated from the plugin renderers at `tests/fixtures/sampling/effects.json`
- When Studio samples each case
- Then every command's offset, RGB, and brightness equals the fixture
- Then where a proto comment names a different default than the renderer, the fixture value wins

#### FX-004 Effect fields round-trip

- **Layer:** L2
- **Status:** approved
- **Tests:** unit, fixture
- **Statement:** Exported effect keyframes keep type, timing, colors, params, capability, and fallback.

**Acceptance:**

- Given an effect with `required_capability` `CAPABILITY_RGB`, a fallback color, and `flicker_rate_hz` 4
- When the track is encoded and decoded
- Then those fields are unchanged and `duration_ms` is > 0 and intensity is ≤ 100

#### FX-005 Automatic channel generation

- **Layer:** L3
- **Status:** approved
- **Tests:** unit
- **Statement:** Automatic color generation from frames is a later layer and has no L1 control.

**Acceptance:**

- Given the L1 shell
- When the user searches the visible UI for automatic generation
- Then no such control is present

### Channels and groups

#### CHAN-001 Templates without a duration step

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** A new movie starts on the Stereo template, and the other templates can replace it before the user adds keyframes.

**Acceptance:**

- Given a newly selected movie
- When the timeline appears
- Then the channels are `left` (`SPATIAL_LEFT`) and `right` (`SPATIAL_RIGHT`), and no duration control was shown
- When the user picks another template before adding any keyframe beyond the automatic ones at 0
- Then the channels match that template
- When the user picks a template after adding their own keyframe
- Then Studio asks for confirmation before replacing channels

Templates:

| Template               | Channels and spatial hints                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Ambient                | `ambient` / `SPATIAL_AMBIENT`                                                                      |
| Stereo                 | `left` / `SPATIAL_LEFT`, `right` / `SPATIAL_RIGHT`                                                 |
| Stereo + Ambient       | stereo plus `ambient` / `SPATIAL_AMBIENT`                                                          |
| Surround               | stereo plus `surround-left` / `SPATIAL_SURROUND_LEFT`, `surround-right` / `SPATIAL_SURROUND_RIGHT` |
| 6-Channel Theater      | surround plus `center` / `SPATIAL_CENTER` and `ambient` / `SPATIAL_AMBIENT`                        |
| 8-Channel Home Theater | 6-channel plus `back-left` / `SPATIAL_SURROUND_LEFT` and `back-right` / `SPATIAL_SURROUND_RIGHT`   |

The proto has no separate back hint, so the back channels share the surround hint. Display names are the English words for those ids.

#### CHAN-002 Add, rename, and delete channels

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** The user can add, rename, and delete channels, and new ids must be unique lowercase slugs.

**Acceptance:**

- Given a track
- When the user adds a channel with id `rear_1`
- Then the channel exists and has a black keyframe at 0
- When the user enters an id that is not `[a-z0-9_-]{1,64}` or that already exists
- Then the add is refused and the error is inline
- When the user deletes a channel
- Then a confirmation is required, and confirming removes its keyframes
- Given an imported id that does not match the slug rule
- When the track is saved without renaming it
- Then the original id is kept

#### CHAN-003 Reorder channels

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Dragging a channel header reorders the lanes and the encoded channel list.

**Acceptance:**

- Given channels `left` then `right`
- When the user drags `right` above `left`
- Then the lane order is `right`, `left` and the encoded `channels` array matches

#### CHAN-004 Solo and mute

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Solo and mute are available on the channel header and on the channel context menu.

**Acceptance:**

- Given two channels
- When the user solos `left` from the header and mutes `right` from the context menu
- Then solo contains `left`, mute contains `right`, and both toggles show their state
- When solo is activated on `right` as well
- Then both can be soloed together

#### CHAN-005 New channels start dark at zero

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** Every new channel has a black step keyframe at 0 ms with a zero transition.

**Acceptance:**

- Given a new channel
- When it is created
- Then it has one keyframe at 0 ms, RGB 0,0,0, brightness 0, transition 0, STEP, color mode RGB, `power_on` false

#### CHAN-006 A track needs a channel

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** Save is blocked while the track has no channels.

**Acceptance:**

- Given all channels were deleted
- When the user saves
- Then save does not call the plugin and the message cites the channel rule

#### CHAN-007 Channel groups

- **Layer:** L2
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** Mirror, spread, and alternate groups live in the project sidecar and export as ordinary keyframes.

**Acceptance:**

- Given a mirror group of `left` and `right`
- When the user changes the color of a `left` keyframe at 1000 ms
- Then `right` has the same color at 1000 ms
- Given a spread group with `spreadMs` 150
- When the user adds a keyframe at 1000 ms on the first member
- Then the following members get the same look at 1000 ms, 1150 ms, and so on
- When the protobuf is encoded
- Then it has no group field, and the sidecar still has the group

### Properties

#### PROP-001 Keyframe properties

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The selected keyframe's popover edits color mode, color, brightness, transition, and interpolation.

**Acceptance:**

- Given a selected keyframe
- When the popover is open
- Then it shows color, brightness 0–100, transition, and interpolation STEP or LINEAR
- When the user sets brightness to 72 and interpolation to LINEAR
- Then those values are stored
- Then ease-in and ease-out are not offered

#### PROP-002 RGB edits stay in range

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** RGB controls clamp each channel to 0–255 and accept a six-digit hex color.

**Acceptance:**

- Given the color controls
- When the user enters hex `00FF00`
- Then the keyframe is RGB 0,255,0
- When the user enters `GG0000`
- Then the keyframe is unchanged and the field shows an error
- When a slider is moved to 300
- Then the stored channel is 255

#### PROP-003 Kelvin edits use the authoring range

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Kelvin mode stores a temperature from 1000 K to 10000 K in steps of 100 K.

**Acceptance:**

- Given Kelvin mode
- When the user sets 4200 K
- Then `color_mode` is COLOR_TEMPERATURE, `color_temperature` is 4200, and the swatch shows the `KEY-012` conversion
- When the user attempts 500 K or 20000 K
- Then the value is refused

#### PROP-004 Eyedropper uses the plugin frame

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** In hosted Studio the eyedropper samples a plugin frame for the playhead, not the video element canvas.

**Acceptance:**

- Given a paused proxy and playhead 2500 ms
- When the user activates the eyedropper
- Then playback stays paused and Studio requests `GET /OpenLightFX/Studio/Items/{id}/Frame?timeMs=2500`
- Then the overlay shows that PNG fitted to the movie box
- When the user clicks the center of a flat-color PNG
- Then the click is mapped back onto the PNG pixel grid and the keyframe receives that source pixel's RGB, not a resampled color from the scaled overlay, and the color is added to history
- Then Studio does not call `drawImage` on the video element for this sample

#### PROP-005 Eyedropper timing and HDR header

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack, realmedia
- **Statement:** Frame samples return inside a time budget and HDR sources are marked as Hable tonemaps.

**Acceptance:**

- Given a synthetic HDR or SDR clip
- When the eyedropper requests the playhead frame
- Then p95 time to a displayed overlay is ≤ 2 seconds and `|X-OpenLightFX-Source-Time-Ms − timeMs|` is ≤ 40
- Given an HDR10 source
- When the frame returns
- Then `X-OpenLightFX-Tone-Map` is `hable-bt709`
- Given the real-media tier
- When a frame from the middle of the movie is requested
- Then p95 time to the overlay is ≤ 15 seconds and the time error is still ≤ 40 ms
- Given the header time differs from the request by more than 40 ms
- When the overlay is shown
- Then the overlay prints the actual source time

#### PROP-006 Color history

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The popover keeps the last 16 picked colors and can apply them.

**Acceptance:**

- Given 17 distinct picks
- When the popover renders
- Then 16 swatches are shown and the oldest is gone
- When the user clicks a swatch
- Then the keyframe takes that color

#### PROP-007 Channel properties

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The channel popover edits id, display name, spatial hint, default color, and the optional flag.

**Acceptance:**

- Given a channel header
- When the user opens channel properties
- Then id, display name, a spatial-hint list of the proto values, default color, and optional are shown
- When optional is toggled and the track is saved
- Then the protobuf field matches
- Then the UI does not claim that optional changes plugin playback

#### PROP-008 Track and movie metadata

- **Layer:** L2
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** A metadata form edits title, description, author, tags, and IMDB id without calling an external movie API.

**Acceptance:**

- Given the metadata form
- When the user enters a valid `tt` id and tags
- Then they are stored
- When the user enters `abc`
- Then the field shows an error and save stays blocked while that value remains
- Then the form does not call IMDB or TMDB

#### PROP-009 Title defaults from the movie

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A new track's title is the Emby item name.

**Acceptance:**

- Given an item named "Proxy Fixture" and no existing track
- When the user selects it
- Then the track title is "Proxy Fixture"

### Undo and redo

#### UNDO-001 Session undo

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** Every track edit can be undone, up to 200 steps, during the session.

**Acceptance:**

- Given a keyframe was added
- When the user undoes
- Then the keyframe is gone
- Given 201 edits
- When the user undoes 200 times
- Then the oldest of the 201 is no longer available
- Then buttons and Ctrl+Z or Cmd+Z both undo

#### UNDO-002 Redo

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** Redo replays an undo until the user makes a new edit.

**Acceptance:**

- Given an undone keyframe add
- When the user redoes with Ctrl+Shift+Z or Cmd+Shift+Z
- Then the keyframe returns
- When the user then adds a different keyframe
- Then redo is empty

#### UNDO-003 One undo for a compound edit

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** A multi-keyframe edit or a paste is a single undo step.

**Acceptance:**

- Given a brightness change applied to three keyframes
- When the user undoes once
- Then all three brightness values are back

#### UNDO-004 Undo is not stored

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** Undo history is memory-only and is absent from the track file, the sidecar, and IndexedDB.

**Acceptance:**

- Given 10 undo steps and a save
- When the protobuf and the sidecar JSON are inspected
- Then neither contains an undo stack
- When the page reloads and the track is restored
- Then the undo control is disabled and redo is empty

### Shortcuts

#### KEYB-001 Safe shortcut map

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** L1 shortcuts are a fixed set that does not include browser chrome chords.

**Acceptance:**

- Given focus is outside a text field and a movie and channel are ready
- When each row is invoked
- Then the action runs

| Action                  | Shortcut                    | Also a button                    |
| ----------------------- | --------------------------- | -------------------------------- |
| Save                    | Ctrl+S or Cmd+S             | Yes                              |
| Undo                    | Ctrl+Z or Cmd+Z             | Yes                              |
| Redo                    | Ctrl+Shift+Z or Cmd+Shift+Z | Yes                              |
| Play or pause           | Space                       | Yes                              |
| Add keyframe            | K                           | Double-click is the pointer path |
| Delete selection        | Delete or Backspace         | Context menu                     |
| Step one frame grid     | Left or Right               | Yes                              |
| Skip 5 seconds          | Shift+Left or Shift+Right   | Yes                              |
| Zoom in                 | `]`                         | Yes                              |
| Zoom out                | `[`                         | Yes                              |
| Zoom to fit             | `\`                         | Yes                              |
| Toggle on-screen lights | V                           | Yes                              |
| Eyedropper              | I                           | Yes                              |
| Shortcut help           | `?`                         | Yes                              |

- Then the shortcut registry contains these bindings and the browser test performs Save, Undo, K, Space, V, I, and the zoom keys in Firefox

#### KEYB-002 Browser chords are not bound

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** Studio does not bind the browser-reserved chords that the March spec and TODO.md disagreed about.

**Acceptance:**

- Given the shortcut registry
- When it is listed
- Then it has no binding for Ctrl or Cmd combined with L, D, K, `+`, `-`, `=`, or `0`
- Then it has no binding for Ctrl+Shift+D or Cmd+Shift+D
- Then it has no binding for Ctrl+Shift+P or Cmd+Shift+P
- Then overlay is only V, zoom is only the bracket keys plus buttons, and theme is not on a Ctrl chord

#### KEYB-003 Failed shortcuts say why

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A shortcut that cannot run shows a toast instead of doing nothing.

**Acceptance:**

- Given no channel is active
- When the user presses K or Ctrl+A or Cmd+A
- Then a toast explains that a channel is needed and the track is unchanged
- Given a channel is active
- When the user presses Ctrl+A or Cmd+A
- Then every keyframe on that channel is selected and the browser does not select the page text

#### KEYB-004 Extra shortcuts

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** Palette, theme, markers, copy, and paste use the L2 chords.

**Acceptance:**

- Given L2 features are enabled
- When the user presses F1, Shift+D, M, Ctrl+C or Cmd+C, and Ctrl+V or Cmd+V in the situations those features define
- Then the palette opens, the theme toggles, a marker is added, and copy and paste follow `KEY-015`

### Save, load, and autosave

#### SAVE-001 Hosted save writes the track

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack, unit
- **Statement:** Save uploads the protobuf to the plugin, which stores it beside the movie.

**Acceptance:**

- Given an admin session and item 42 with a new track id `proxy-fixture`
- When the user saves
- Then Studio PUTs the bytes to `/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=42`
- Then the file on disk is `{movieDir}/lightfx/proxy-fixture.lightfx` and a following GET returns the same bytes
- Given a body larger than 32 MiB
- When it is saved
- Then the plugin rejects it and Studio shows the error

#### SAVE-002 Save selects the track for Emby playback

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** After a hosted save, Emby playback of that movie uses the saved file.

**Acceptance:**

- Given the save in `SAVE-001` succeeded and another `.lightfx` already exists for the movie
- When Studio finishes the save
- Then it POSTs `/OpenLightFX/Tracks/Select` with that item id and the `lightfx/proxy-fixture.lightfx` path from Tracks ByItem
- Given Emby then plays the movie past a STEP keyframe of RGB 0,255,0 brightness 80 at 1000 ms
- When the collector log is read, with poll interval set to 200 ms for the test
- Then a sample with r 0, g 255, b 0, brightness 80 appears within 1000 ms after the player position crosses 1000 ms
- Given the default poll of 500 ms on the real-media tier
- When the same kind of keyframe plays
- Then the sample appears within 1500 ms

#### SAVE-003 Save writes the project sidecar

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack, unit
- **Statement:** Save also writes Studio-only project data to the plugin sidecar.

**Acceptance:**

- Given a save of track `proxy-fixture`
- When it completes
- Then Studio PUTs JSON to `/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42`
- Then the JSON has `version` 1, the item id, the track id, `sceneMarkers`, and `channelGroups`, and it has no undo stack and no duration
- Given the track PUT succeeded and the project PUT failed
- When the UI reports the result
- Then it says the track was saved and the editor data was not

#### SAVE-004 Invalid tracks do not save

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, fullstack
- **Statement:** Save is blocked when the track would fail TrackParser, and the message names the rule.

**Acceptance:**

- Given one violation of each rule below
- When the user saves
- Then no PUT body is stored and the message contains that rule id

| Rule  | Condition                                                                      |
| ----- | ------------------------------------------------------------------------------ |
| V-001 | `version` is not 1                                                             |
| V-002 | metadata is missing                                                            |
| V-003 | a non-empty IMDB id does not match `tt` plus at least 7 digits                 |
| V-004 | `duration_ms` is 0                                                             |
| V-005 | duplicate channel ids                                                          |
| V-006 | a keyframe channel is unknown, or a channel's times go backwards in file order |
| V-007 | brightness > 100                                                               |
| V-008 | an RGB component > 255                                                         |
| V-009 | COLOR_TEMPERATURE kelvin outside 1000–10000                                    |
| V-010 | a keyframe time is past `duration_ms`                                          |
| V-011 | there is no channel                                                            |
| V-012 | `transition_ms` > `timestamp_ms`                                               |
| V-013 | an effect duration is 0                                                        |
| V-014 | an effect intensity is > 100                                                   |

#### SAVE-005 Autosave is IndexedDB every 30 seconds

- **Layer:** L1
- **Status:** approved
- **Tests:** unit, browser
- **Statement:** Unsaved edits are written to IndexedDB on a single 30 second interval, and page close flushes that snapshot.

**Acceptance:**

- Given an edit at t = 0
- When 30 seconds pass without another edit
- Then one IndexedDB record exists for `{itemId}:{trackId}` and localStorage has no project snapshot
- Given another edit 5 seconds after the flush
- When the page fires `pagehide`
- Then the record includes that edit
- Then there is no second interval such as 60 seconds or 2 minutes
- The record holds the track bytes, the sidecar JSON, `playheadMs`, and timeline scroll, and it does not hold an undo stack

#### SAVE-006 A successful save wins over the crash copy

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** After a successful save the crash copy cannot override the server track on the next load.

**Acceptance:**

- Given a dirty snapshot and a successful save
- When the page reloads
- Then the server track is what renders and the unsaved banner is absent

#### SAVE-007 A newer crash copy is restored

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** If the IndexedDB copy is dirty and newer than the server track, reload restores it and says so.

**Acceptance:**

- Given a dirty IndexedDB record whose time is after the server `updatedAt`, and no successful save since
- When the page loads that item and track
- Then the keyframes match the IndexedDB copy and a notice says unsaved edits were restored
- Given the server is newer
- When the page loads
- Then the server track is shown

#### SAVE-008 Local export is a download

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Outside the plugin, Save downloads a `.lightfx` file and does not use the File System Access API.

**Acceptance:**

- Given local dev
- When the user saves
- Then the browser downloads one `.lightfx` file and no directory picker is opened
- Then the UI does not say the file was written to Emby

#### SAVE-009 New tracks store version 1 and the movie duration

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** A track created from a movie stores protobuf version 1 and that movie's duration.

**Acceptance:**

- Given item runtime 6060000 ms
- When the track is encoded before any metadata edit
- Then `version` is 1 and `duration_ms` is 6060000

### Import and export

#### IO-001 Import a track file

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** The user can import a `.lightfx` file into the open movie.

**Acceptance:**

- Given a valid protobuf with two channels and three keyframes, and a movie already selected
- When the user imports it
- Then those channels and keyframes replace the editor track and the movie stays selected

#### IO-002 Round-trip

- **Layer:** L1
- **Status:** approved
- **Tests:** fixture, unit
- **Statement:** Decoding and encoding a valid track preserves the fields the plugin reads.

**Acceptance:**

- Given a fixture track that uses both color modes, a transition, and one effect
- When Studio decodes it and encodes it again
- Then channel ids, keyframe times, colors, brightness, interpolation, transitions, effect type, effect timing, and duration match
- Then a plugin `TrackParser` test of the same bytes reports valid

#### IO-003 Bad files are rejected

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** An invalid `.lightfx` import shows the parser errors and leaves the open track in place.

**Acceptance:**

- Given a file with version 2
- When the user imports it
- Then the current track is unchanged and the error includes V-001

#### IO-004 Duration warning only for imports

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** A duration warning appears only when an imported track differs from the movie by more than 5 seconds.

**Acceptance:**

- Given a movie runtime of 120000 ms and an import whose `duration_ms` is 130001
- When the import finishes
- Then a warning is shown and the track duration stays 130001 until the user chooses Use movie duration
- When the user chooses Use movie duration
- Then `duration_ms` becomes 120000 and any keyframes past 120000 are listed and block save until removed or until the user keeps the track duration
- Given a track Studio just created from that movie
- When it is saved
- Then no duration warning is shown
- Given an import whose duration differs by 5000 ms or less
- When it finishes
- Then no warning is shown

#### IO-005 Marketplace

- **Layer:** L3
- **Status:** approved
- **Tests:** browser
- **Statement:** Marketplace publish is absent from the L1 and L2 interface.

**Acceptance:**

- Given the L1 shell
- When the user inspects menus and the save flow
- Then there is no Publish control, disabled or otherwise

### Live preview

#### PREV-001 On-screen regions

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The movie overlay draws each mapped spatial hint in a fixed region and lists channels with no hint.

**Acceptance:**

- Given one channel for each hint below, each with a distinct color at the playhead
- When the overlay is on
- Then each region below is tinted with that color

| Hint                                         | Region                                           |
| -------------------------------------------- | ------------------------------------------------ |
| `SPATIAL_LEFT`                               | top-left edge, 15% of the video height           |
| `SPATIAL_CENTER` and `SPATIAL_BEHIND_SCREEN` | top-center, 15% of the video height              |
| `SPATIAL_RIGHT`                              | top-right, 15% of the video height               |
| `SPATIAL_SURROUND_LEFT`                      | bottom-left, 15% of the video height             |
| `SPATIAL_SURROUND_RIGHT`                     | bottom-right, 15% of the video height            |
| `SPATIAL_AMBIENT`                            | border glow, 20% of the smaller video side       |
| `SPATIAL_CEILING`                            | top edge, full width, 10% of the video height    |
| `SPATIAL_FLOOR`                              | bottom edge, full width, 10% of the video height |

- Given a channel with an empty hint
- When the overlay renders
- Then that channel is not drawn and its name is in an Unassigned list under the movie
- Given two channels sharing a hint
- When the overlay renders
- Then the first in lane order that is not muted is the color drawn, and the other name is listed
- Given the default state
- When a movie loads
- Then the overlay is on

#### PREV-002 Overlay matches the sampler

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** The overlay color is the sampler output at the playhead.

**Acceptance:**

- Given the `KEY-010` track and the playhead at 1000 ms
- When the overlay renders
- Then the channel region is RGB 255,0,0 at full brightness
- When the user scrubs to 499 ms
- Then the region is black

#### PREV-003 Solo and mute affect the overlay

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Muted channels are hidden on the overlay, and solo shows only soloed channels.

**Acceptance:**

- Given `left` is red and `right` is blue
- When `right` is muted
- Then the right region is not tinted
- When `left` is soloed
- Then only the left region is tinted

#### PREV-004 Channel to bulb mapping

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** The user maps each bulb to at most one channel, and a channel may drive several bulbs.

**Acceptance:**

- Given bulbs `b1` and `b2` and channels `left` and `right`
- When the user assigns both bulbs to `left`
- Then preview Start sends `left: [b1, b2]`
- When the user also assigns `b1` to `right`
- Then the UI refuses and explains that a bulb follows one channel
- Given no mapping has been confirmed
- When the user turns bulb preview on
- Then preview does not start and the mapping UI opens

#### PREV-005 Mapping is saved for Emby playback

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** Confirming a mapping updates the active plugin mapping profile.

**Acceptance:**

- Given the user confirms `left` → `b1`
- When Studio finishes the write
- Then plugin settings' active profile maps channel `left` to bulb `b1`
- Given Emby later plays a track
- When `left` has a color
- Then bulb `b1` receives it

#### PREV-006 Preview latency and color

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** Bulb preview matches the sampler within 300 ms on the test network.

**Acceptance:**

- Given photosensitivity is off, a REST bulb with `minTransitionMs` 0 and 20 commands per second, and a STEP keyframe RGB 255,0,0 brightness 100 at the playhead
- When the playhead settles on that keyframe with preview on
- Then p95 time to a collector line with r 255, g 0, b 0, brightness 100 is ≤ 300 ms
- Then Studio sends at most 10 frames per second, and a paused playhead still refreshes at least every 5 seconds so the plugin idle timer does not fire while preview is on

#### PREV-007 Stop restores bulbs

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** Stopping preview, closing the page, or letting it go idle restores the bulb snapshot from preview start.

**Acceptance:**

- Given the collector showed brightness 10 before Start and brightness 100 during preview
- When the user turns preview off
- Then within 2 seconds the collector shows brightness 10 again
- Given preview is on
- When the page fires `pagehide`
- Then Studio sends Preview Stop with a keepalive request
- Given no Frame arrives for 10 seconds
- When the plugin idle path runs
- Then bulbs are restored and the next Studio frame is told that preview is not active, and the UI leaves the live state

#### PREV-008 Emby playback has priority until takeover

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack, browser
- **Statement:** While Emby is driving bulbs, Studio keeps the on-screen preview and takes the bulbs only after an explicit action.

**Acceptance:**

- Given an Emby lighting session is active
- When the user turns bulb preview on
- Then Start without takeover returns 409, the bulbs keep following the movie, and the on-screen overlay still follows Studio's playhead
- Then the message says Emby is using the lights and offers "Use bulbs for editing"
- When the user activates that offer
- Then Studio starts preview with takeover, and the movie's live lighting stops
- When the user then stops preview
- Then bulbs return to the snapshot from the takeover moment within 2 seconds, and live movie lighting does not resume until Emby plays again
- Then Studio's playhead is not forced to the Emby playback position

#### PREV-009 No bulbs

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** With no configured bulbs the on-screen overlay still works and bulb preview explains that none are configured.

**Acceptance:**

- Given Bulbs returns an empty list
- When the user turns the overlay on and opens bulb preview
- Then the overlay draws and bulb preview shows that no bulbs are configured

#### PREV-010 Preview and save require an admin

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** A non-admin can edit on screen and download, and cannot save to the plugin or drive bulbs.

**Acceptance:**

- Given a non-admin token
- When the user saves or starts preview
- Then the plugin returns 403 and Studio explains that an admin is required and offers a `.lightfx` download

#### PREV-011 Effects in the live preview

- **Layer:** L2
- **Status:** approved
- **Tests:** fixture, fullstack
- **Statement:** While an effect is active, the overlay and the bulb frames use the effect sampler.

**Acceptance:**

- Given a fixture effect that outputs RGB 0,0,255 at 100 ms into the block
- When the playhead is there
- Then the overlay and the preview frame for that bulb are RGB 0,0,255

#### PREV-012 Photosensitivity is a playback filter, not a file edit

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Studio shows when photosensitivity mode is on and does not bake that filter into the track.

**Acceptance:**

- Given plugin settings `photosensitivityMode` true
- When preview is on
- Then a status notice says the bulbs may be softer than the on-screen colors
- When the track is saved
- Then keyframe brightness values are the authored ones

### Safety

#### SAFE-001 Safety info is computed on save

- **Layer:** L1
- **Status:** approved
- **Tests:** unit
- **Statement:** Save writes SafetyInfo from keyframe steps and from the presence of flash effects.

**Acceptance:**

- A flash edge is two consecutive keyframes on one channel whose absolute brightness difference is greater than 20. Its frequency is `1000 / dt` hertz.
- `max_flash_frequency_hz` is the maximum edge frequency, or 0 when there is no edge.
- `max_brightness_delta` is the maximum absolute consecutive brightness difference, or 0.
- `contains_strobing` is true when any effect type is STROBE.
- `contains_flashing` is true when the max frequency is greater than 3, or when any effect type is LIGHTNING, FLASHBANG, GUNFIRE, SPARK, or STROBE.
- Intensity is EXTREME when max frequency is ≥ 8, otherwise INTENSE when flashing or strobing is set, otherwise MODERATE when max delta is ≥ 40, otherwise SUBTLE.
- Given brightness 0 at 0 ms and 100 at 200 ms and no effects
- When safety is computed
- Then frequency is 5, delta is 100, flashing is true, strobing is false, and intensity is INTENSE
- Given brightness 0 at 0 ms and 30 at 5000 ms
- When safety is computed
- Then frequency is 0.2, delta is 30, both flags are false, and intensity is SUBTLE
- Given a STROBE effect as well
- When safety is computed
- Then strobing and flashing are true and intensity is at least INTENSE
- Then `warning_text` is empty and keyframe values are unchanged by the photosensitivity filter

#### SAFE-002 Safety badges

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The shell shows the computed flashing, strobing, and intensity flags as read-only text.

**Acceptance:**

- Given a track whose safety result is INTENSE and flashing
- When the shell renders
- Then the user can read Intense and Flashing without opening a file

#### SAFE-003 Author warning text

- **Layer:** L2
- **Status:** approved
- **Tests:** unit
- **Statement:** The user can store a safety warning string that round-trips in SafetyInfo.

**Acceptance:**

- Given the user enters "Strobe in the alley scene"
- When the track is saved and reopened
- Then `warning_text` is that string

### Performance

#### PERF-001 Shell is ready quickly

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** The library or the local open control is visible within 2 seconds of the HTML response.

**Acceptance:**

- Given a desktop Chromium or Firefox session and a warm HTTP cache of the SPA assets
- When navigation starts at the studio URL
- Then within 2 seconds a library row or the local open control is visible and not marked busy
- Then this clock does not include proxy generation

#### PERF-002 Large timelines stay at 60 fps

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Panning and zooming a two-hour, 10,000-keyframe timeline stays within a 16.7 ms frame budget.

**Acceptance:**

- Given 8 channels, 10,000 keyframes, duration 7,200,000 ms, video paused, device pixel ratio ≤ 2, and at least 4 CPU cores
- When the test applies a continuous zoom for 3 seconds
- Then p95 time between animation frames is ≤ 16.7 ms in Chromium

#### PERF-003 Playback stays smooth

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A 24 fps proxy keeps presenting frames while the timeline follows the playhead.

**Acceptance:**

- Given clip A playing with follow turned on
- When 5 seconds elapse
- Then each of those seconds presents at least 22 frames

#### PERF-004 The source movie is not downloaded

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** Studio does not fetch the source media file into the browser.

**Acceptance:**

- Given the synthetic HEVC item or the real-media item
- When the user plays, scrubs, and samples a frame
- Then the page has no request whose response is the source MKV, and the video element `preload` is `metadata` until Play
- Then frame sampling is the plugin Frame request, not a download of the source

### Accessibility and input

#### A11Y-001 Transport is named and operable

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** Play, pause, scrub, skip, and frame step have accessible names, keyboard operation, and a visible focus ring.

**Acceptance:**

- Given the transport
- When it is rendered
- Then play has accessible name Play or Pause, skip controls name the five-second direction, and frame step names the direction
- Then the scrubber is a `slider` with `aria-valuemin` 0, `aria-valuemax` equal to the duration, and `aria-valuenow` equal to the playhead
- When each control is focused
- Then a focus ring is visible, and Enter or Space activates a button

#### A11Y-002 Selection is not color alone

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A selected keyframe has a non-color cue and the popover states the selection.

**Acceptance:**

- Given a selected keyframe
- When the timeline paints
- Then the mark has an outline or ring in addition to its fill
- Then the popover text includes the channel id and the time

#### A11Y-003 Shortcut help

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** The question-mark key opens a list of the active shortcuts.

**Acceptance:**

- Given focus is outside a text field
- When the user presses `?`
- Then a dialog lists every binding from `KEYB-001` and the L2 bindings that are currently available

#### A11Y-004 Coarse pointers and text scaling

- **Layer:** L2
- **Status:** approved
- **Tests:** browser
- **Statement:** Coarse-pointer targets are at least 44 px and the shell follows browser text zoom.

**Acceptance:**

- Given a coarse pointer
- When transport controls render
- Then each hit box is at least 44×44 px
- Given browser text size 200%
- When the shell renders at 1280×720
- Then the play button text is visible and not clipped

### Error handling

#### ERR-001 Playback errors stay understandable

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A proxy or video failure leaves the transport in place and offers a retry.

**Acceptance:**

- Given the video element fires an error or the proxy URL returns 500
- When the shell handles it
- Then a message names the failure, the play control remains visible, and Retry requests the proxy again
- Then the message does not include the raw `api_key`
- Given MediaInfo `proxy.state` is `failed` and `proxy.reason` names the failure
- When the shell handles it
- Then the message is that reason, Retry asks the plugin to build the proxy again, and the shell does not stay on Preparing edit proxy

#### ERR-002 A dead plugin does not become a fake library

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** If the plugin API fails, hosted Studio shows an outage and keeps the in-memory edit.

**Acceptance:**

- Given a track is loaded and the next Items request fails
- When the failure is handled
- Then a banner says the plugin is unavailable, the keyframes remain, and no substitute movie list appears

#### ERR-003 Save conflicts show the server text

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, fullstack
- **Statement:** A 400 from track save shows the plugin's validation text.

**Acceptance:**

- Given the plugin returns 400 with a V-004 message
- When save completes
- Then the UI shows that message and leaves the editor dirty

#### ERR-004 Forbidden save can download

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A 403 on save explains the admin requirement and offers a download.

**Acceptance:**

- Given save returns 403
- When the error renders
- Then the text says an admin is required and a Download control produces a `.lightfx` file

#### ERR-005 Unplayable local files point at Emby

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** A local file the browser cannot play tells the user to open it through Emby.

**Acceptance:**

- Given local dev and an MKV file
- When the user picks it
- Then the message says this browser cannot play it and names Emby as the way to open the movie
- Then no duration field appears

#### ERR-006 Unknown duration blocks plugin save

- **Layer:** L1
- **Status:** approved
- **Tests:** browser, unit
- **Statement:** Plugin save is blocked when neither the item nor the probe produced a duration.

**Acceptance:**

- Given `runtimeMs` 0 and a failed MediaInfo probe
- When the user saves to the plugin
- Then save does not PUT and the message says the movie duration is unknown
- Then the UI still has no field asking the user to type a duration

#### ERR-007 Eyedropper failure keeps the color

- **Layer:** L1
- **Status:** approved
- **Tests:** browser
- **Statement:** If the frame endpoint fails, the eyedropper closes and the keyframe color stays.

**Acceptance:**

- Given the Frame request returns 503
- When the eyedropper was active
- Then a toast says the frame could not be sampled and the keyframe RGB is unchanged

### Plugin contract

These requirements are changes or guarantees the Emby plugin must provide. Studio's L1 behavior depends on them. Existing routes are pinned so the editor and the plugin cannot drift.

#### PLUG-001 Media info

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** The plugin reports movie timing, HDR, and edit-proxy progress for an item.

**Acceptance:**

- Given an admin GET `/OpenLightFX/Studio/Items/{itemId}/MediaInfo`
- When the item exists
- Then the JSON includes `runtimeMs`, `width`, `height`, `videoCodec`, `hdr`, `colorTransfer`, `audioCodec`, and `proxy`
- Then `proxy.state` is `missing`, `building`, `ready`, or `failed`
- Then `proxy.reason` is a short string when `state` is `failed`, and it does not include `api_key`
- Then `proxy` includes `encodedThroughMs`, `fps`, `keyframeIntervalMs`, `width`, and `height` when a build has started
- Given `proxy.state` is `failed`
- When the admin POSTs `/OpenLightFX/Studio/Items/{itemId}/Proxy`
- Then the plugin drops that failure and starts another build
- Given `runtimeMs` on the item is 0 and ffprobe reports 120000
- When MediaInfo is called
- Then `runtimeMs` is 120000
- Given a missing item
- When MediaInfo is called
- Then the status is 404

#### PLUG-002 Tone-mapped frame endpoint

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** The plugin extracts one sRGB frame with Emby's ffmpeg, and HDR frames are Hable tonemapped.

**Acceptance:**

- Given an admin GET `/OpenLightFX/Studio/Items/{itemId}/Frame?timeMs=2500`
- When the item exists and `timeMs` is inside the runtime
- Then the response is `image/png`, 8-bit, without requiring COOP or COEP
- Then `X-OpenLightFX-Source-Time-Ms` is within 40 ms of 2500
- Given an SDR source
- When the frame is extracted
- Then `X-OpenLightFX-Tone-Map` is `none` and the center pixel matches an independent run of Emby's ffmpeg extracting `format=rgb24` within ±2 per channel
- Given HDR10 PQ or HLG
- When the frame is extracted
- Then the header is `hable-bt709` and the center pixel matches an independent run of the filter below within ±2 per channel
- PQ filter: `zscale=tin=smpte2084:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=rgb24`
- HLG uses the same filter with `tin=arib-std-b67`
- Then ffmpeg is the binary Emby already uses for transcodes
- Given `timeMs` is missing or past the runtime
- When the endpoint is called
- Then the status is 400
- Given a non-admin
- When the endpoint is called
- Then the status is 403

`maxWidth` may be passed and defaults to 1280, capped at 1920. The PNG keeps aspect ratio. Accurate seek is required: a fast input seek may locate the previous keyframe, and the decode must still land within 40 ms of `timeMs`.

#### PLUG-003 Edit proxy

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** The plugin produces a direct-play H.264 proxy with keyframes at least twice a second.

**Acceptance:**

- Given an admin POST `/OpenLightFX/Studio/Items/{itemId}/Proxy`
- When the source is longer than 60 seconds
- Then the response includes an `editUrl` that can start playback at time 0 before the full duration is encoded, and `encodedThroughMs` advances
- Given a source of 30 seconds or less
- When the proxy reaches `ready`
- Then the file is H.264, yuv420p, AAC stereo, long side ≤ 1280, even dimensions, `keyframeIntervalMs` ≤ 500, and `fps` is the value MediaInfo reports
- Then `editUrl` answers HTTP range requests with 206 and does not start an Emby transcode session on seek
- Then ffmpeg arguments force a closed GOP at that interval (`scenecut` disabled) using Emby's ffmpeg
- Given a seek to a time greater than `encodedThroughMs`
- When Studio asks for that time
- Then the plugin does not answer 416 while the encode is still running, and it does not start a full-quality transcode as a fallback
- Then an open-ended read of a building proxy stays open and appends bytes until the encode finishes, without a Content-Length of the bytes written so far
- Then the proxy is a cache the plugin may delete and rebuild, not a second library item

#### PLUG-004 Project sidecar API

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** The plugin stores a JSON project sidecar next to the track and does not parse it during playback.

**Acceptance:**

- Given an admin PUT `/OpenLightFX/Studio/Projects/{trackId}?itemId=` with the JSON below and a body ≤ 4 MiB
- When it succeeds
- Then the file is `{movieDir}/lightfx/{trackId}.studio.json` and GET returns the same JSON
- Given playback of that movie
- When the lighting session starts
- Then the sidecar is not read by `TrackParser` or `PlaybackSession`
- Given `version` is not 1, the body is not JSON, or the body is larger than 4 MiB
- When it is PUT
- Then the status is 400
- Given a non-admin
- When it is PUT
- Then the status is 403

```json
{
  "version": 1,
  "itemId": "42",
  "trackId": "proxy-fixture",
  "sceneMarkers": [{ "id": "m1", "timeMs": 1000, "label": "Intro", "kind": "manual" }],
  "channelGroups": [
    {
      "id": "g1",
      "name": "Walls",
      "mode": "mirror",
      "channelIds": ["left", "right"],
      "spreadMs": 150
    }
  ]
}
```

`kind` is `manual`, `chapter`, or `detected`. `mode` is `mirror`, `spread`, or `alternate`.

#### PLUG-005 Preview takeover

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** Preview start can refuse while Emby is using the bulbs, or suspend that session when takeover is requested.

**Acceptance:**

- Given a playback lighting session is active
- When POST `/OpenLightFX/Studio/Preview/Start` is sent without takeover
- Then the status is 409 and the body identifies `playback_active`
- When Start is sent with `takeover` true and a valid mapping
- Then playback lighting stops, the previous bulb state is snapshotted, and the response status is started
- When POST `/OpenLightFX/Studio/Preview/Stop` runs
- Then bulbs return to that snapshot and playback lighting stays off
- Given no Frame for 10 seconds
- When the idle timer fires
- Then the same restore runs
- Given an unknown bulb id or an empty mapping
- When Start is called
- Then the status is 400

#### PLUG-006 Editor routes already on the plugin

- **Layer:** L1
- **Status:** approved
- **Tests:** fullstack
- **Statement:** The plugin keeps the Studio list, track, bulb, and preview-frame routes the editor calls.

**Acceptance:**

- Given an admin token
- When each call below is made
- Then the response shape matches this table

| Call                                               | Result                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET `/OpenLightFX/Studio/Bulbs`                    | array of `id`, `name`, `protocol`, `capabilities.rgb`, `capabilities.minTransitionMs` |
| GET `/OpenLightFX/Studio/Items?search=`            | movies only, at most 200, each with `itemId`, `name`, `year`, `runtimeMs`             |
| GET `/OpenLightFX/Studio/Tracks?itemId=`           | array of `trackId`, `title`, `itemId`, `updatedAt`                                    |
| GET `/OpenLightFX/Studio/Tracks/{trackId}`         | protobuf bytes                                                                        |
| PUT `/OpenLightFX/Studio/Tracks/{trackId}?itemId=` | stores `{movieDir}/lightfx/{trackId}.lightfx` after `TrackParser` accepts the bytes   |
| POST `/OpenLightFX/Studio/Preview/Frame`           | accepts `states[]` of `bulbId`, `r`, `g`, `b`, `brightness`, `transitionMs`           |
| POST `/OpenLightFX/Tracks/Select`                  | body `itemId` and `trackPath` selects the file for later playback                     |
| GET `/OpenLightFX/Tracks/ByItem?itemId=`           | includes `trackPath` for the saved file                                               |
| GET `/OpenLightFX/Settings`                        | includes `photosensitivityMode` and the active mapping profile                        |

- Then track ids are safe file names of at most 120 characters
- Then a new track id Studio generates matches `[a-z0-9][a-z0-9_-]{0,63}`

---

## Requirement counts

| Area                       | Prefix |      L1 |     L2 |    L3 |   Total |
| -------------------------- | ------ | ------: | -----: | ----: | ------: |
| App shell and navigation   | SHELL  |       7 |      3 |     0 |      10 |
| Media loading and playback | MEDIA  |      17 |      0 |     0 |      17 |
| Timeline view              | TIME   |      11 |      2 |     0 |      13 |
| Keyframe editing           | KEY    |      14 |      1 |     0 |      15 |
| Effects                    | FX     |       0 |      4 |     1 |       5 |
| Channels and groups        | CHAN   |       6 |      1 |     0 |       7 |
| Properties                 | PROP   |       8 |      1 |     0 |       9 |
| Undo and redo              | UNDO   |       4 |      0 |     0 |       4 |
| Shortcuts                  | KEYB   |       3 |      1 |     0 |       4 |
| Save, load, and autosave   | SAVE   |       9 |      0 |     0 |       9 |
| Import and export          | IO     |       4 |      0 |     1 |       5 |
| Live preview               | PREV   |      11 |      1 |     0 |      12 |
| Safety                     | SAFE   |       2 |      1 |     0 |       3 |
| Performance                | PERF   |       4 |      0 |     0 |       4 |
| Accessibility and input    | A11Y   |       3 |      1 |     0 |       4 |
| Error handling             | ERR    |       7 |      0 |     0 |       7 |
| Plugin contract            | PLUG   |       6 |      0 |     0 |       6 |
| **Total**                  |        | **116** | **16** | **2** | **134** |

The checker recomputes this table from the headings. Do not keep a second list.

---

## Conflicts resolved

### C1 — The external STU specification is gone

`docs/TODO.md` on `feat/refactor` scores 149 requirements in `../requirements/openlightfx-studio.md` and reports 121 pass. The owner confirms that file is gone. The pass count was produced by reading source, and the application did not work in real use: New asked for a duration before any movie, the movie did not play, and once something loaded there was no usable transport.

**Decision:** This document is a new specification. `STU` ids are hints, mapped in the appendix, and they are not acceptance tests. Nothing in the March implementation is grandfathered in because a code reader marked it pass.

### C2 — Local files and ffmpeg.wasm do not fit the product

The March spec runs entirely in the browser: local files, File System Access API, and ffmpeg.wasm for HDR eyedropper frames, with COOP/COEP so SharedArrayBuffer works. The owner uses Firefox. Firefox has no File System Access API and cannot play HEVC, MKV, or TrueHD from an object URL. A 25 GB 4K HEVC HDR10 file is not a practical ffmpeg.wasm input (memory, software-decode speed, and the isolation headers Emby will not send).

**Decision:** Emby is the media path. The browser plays an H.264 edit proxy from the plugin. HDR eyedropper frames are extracted by the plugin with Emby's ffmpeg and Hable-tonemapped to sRGB (`PLUG-002`, `PROP-004`). Studio does not ship ffmpeg.wasm and does not require COOP or COEP. Local dev may open an H.264/AAC MP4 for UI work. Anything the browser cannot decode is an error that points back to Emby (`MEDIA-014`, `ERR-005`).

### C3 — Scrubbing a transcode restarts the transcode

The plugin's current StreamUrl transcodes non-browser files to H.264 on each playback session. A seek on that kind of URL starts the transcode again, so scrubbing and frame stepping feel broken. Browsers also cannot promise original-frame stepping: `seekToNextFrame` is not a cross-browser API, and Firefox is the owner's browser.

**Decision:** Studio's video element uses only the edit proxy (`PLUG-003`): H.264, AAC, keyframe interval ≤ 500 ms, direct play with range requests. For sources longer than 60 seconds the URL must play from time 0 before the rest is encoded. Seek p95 is ≤ 400 ms on the synthetic proxy and ≤ 1500 ms on the real-media tier once that time is encoded. Seeks past the encoded horizon wait and the transport shows `Still encoding to mm:ss`; they do not fall back to a full transcode (`MEDIA-006`, `MEDIA-016`). Frame step moves `round(1000/fps)` ms by setting `currentTime`. The picture may be as far away as one GOP. That limit is the requirement, not a bug (`MEDIA-007`).

### C4 — Duration was asked before any movie

The March metadata model lets a person type duration, and the rebuild's New dialog required minutes before a movie existed. The March export warning fires whenever the track and the video differ by more than 5 seconds.

**Decision:** Duration is the Emby item `runtimeMs`, or the plugin probe when that value is 0 (`MEDIA-002`, `MEDIA-015`). There is no duration field in the create path (`MEDIA-010`). The 5 second warning exists only when importing a `.lightfx` whose stored duration disagrees with the selected movie (`IO-004`). A track Studio creates from a movie does not warn. The user is not asked to type a length when the probe fails; save is blocked instead (`ERR-006`).

### C5 — Persistence, sidecar, autosave, undo

The March spec stores a video file path, autosaves a JSON snapshot including a 200-deep undo stack to localStorage every 60 seconds, and treats File System Access as the primary save. TODO.md says another missing document wanted a 2 minute autosave. Scene markers and channel groups are not in `lightfx.proto`. Reload cannot restore a local file handle, which is why the old gap STU-066 asked the user to pick the file again.

**Decision:** The media reference is the Emby `itemId` in the page query, so reload reopens that movie (`MEDIA-013`). Primary save is PUT to the plugin Tracks API, then `Tracks/Select`, so a movie with more than one file still plays the one just saved (`SAVE-001`, `SAVE-002`).

Studio-only data uses a **plugin sidecar**, not a proto change. Recommendation, and the requirement: `{movieDir}/lightfx/{trackId}.studio.json` via `PLUG-004`. The playback file stays a version-1 `LightFXTrack` the current parser accepts. Markers and groups are editor state; the player does not read them. Groups are already expanded into per-channel keyframes in the `.lightfx` when those edits happen, which is what playback needs. Putting them in the proto would make every player carry editor documents. A proto addition is recorded as considered and rejected in [format-proposals.md](format-proposals.md).

Autosave uses **IndexedDB**, not localStorage, on **one interval of 30 seconds**. Closing the page flushes the pending snapshot so the 30 seconds are a cap on loss, not a second schedule (`SAVE-005`). localStorage stays unused for project data because a 10,000-keyframe draft plus a sidecar can exceed its quota.

Undo stays **200 steps in memory** and is not written to the `.lightfx`, the sidecar, or IndexedDB (`UNDO-004`). Reloading restores the track and drops the undo stack. Storing 200 serialized commands in the project file was reconsidered and rejected: it bloats the sidecar, it is meaningless on another browser, and the crash copy already keeps the unsaved track.

### C6 — Shortcuts that browsers steal

The March table binds zoom to Ctrl or Cmd with `+`, `-`, and `0`, the palette to Ctrl+K, and theme to Ctrl+Shift+D. TODO.md instead lists Ctrl+L for the overlay and Ctrl+D for theme, and notes that several of those handlers were never bound. Firefox uses Ctrl+L for the address bar, Ctrl+D for a bookmark, Ctrl+Shift+D for bookmark-all, Ctrl+K for the search bar, and Ctrl+Shift+P for a private window. Page zoom chords are not reliably cancelable.

**Decision:** The L1 map is `KEYB-001`. Zoom is `[`, `]`, `\`, plus buttons. Overlay is V. Eyedropper is I. Palette, which is L2, is F1. Theme, which is L2, is Shift+D. `KEYB-002` forbids Ctrl/Cmd+L, Ctrl/Cmd+D, Ctrl/Cmd+K, the zoom chords, Ctrl/Cmd+Shift+D, and Ctrl/Cmd+Shift+P. Ctrl/Cmd+S, Z, Shift+Z, C, V, and A stay, because the page receives them and `preventDefault` works, and each of those actions also has a visible control so the loop is not key-only.

### C7 — Live bulb preview was missing

The March spec's overlay is a picture on the video. It does not drive bulbs. The plugin already has Preview Start, Frame, and Stop, one session, a 10 second idle restore, and a 409 while Emby playback lighting holds the bulbs. Frame does not run `InterpolationEngine`; the client must send bulb colors. `power_on` is not applied at dispatch. Photosensitivity can still soften effect frames on the plugin.

**Decision:** L1 preview is on-screen and on real bulbs (`PREV-001` through `PREV-010`). One sampler feeds both. The sampler matches `PlaybackSession` / `InterpolationEngine` (`KEY-009` through `KEY-014`). Mapping is one bulb to one channel, because dispatch uses the first channel for a bulb, and one channel may own many bulbs. Confirming the map writes the active plugin profile so Emby playback uses it (`PREV-005`). Latency target is p95 ≤ 300 ms to the collector on the test rig (`PREV-006`).

While a movie is playing in Emby, Studio does not take the bulbs silently and does not follow Emby's playhead. The overlay keeps using Studio's playhead. Bulb preview shows that Emby holds the lights until the user chooses "Use bulbs for editing", which starts preview with takeover (`PREV-008`, `PLUG-005`). Stop, page close, and the 10 second idle restore the snapshot taken when preview started. Stop does not reattach live movie sync. The user presses play in Emby again for that.

### C8 — Scope and where Studio is hosted

The March layer 1 includes tablet-first layout, a command palette, light mode, marketplace placeholders, and deployment at openlightfx.studio. The owner wants a fast editing loop first. Marketplace and AI wait. Tablet, the palette, and light mode are L2 unless the loop cannot ship without them.

**Decision:** The loop ships with visible buttons (`SHELL-005`), so the palette is L2 (`SHELL-007`). Light theme is L2 (`SHELL-008`). Tablet layout and 44 px targets are L2 (`SHELL-009`, `A11Y-004`); L1 is specified at 1280×720 and must not trap the play button on a phone-width window (`SHELL-003`). Deployment is only `/emby/OpenLightFX/studio/`. openlightfx.studio is not a requirement. Effects, groups, and markers are L2. Marketplace and auto-generation are L3 and have no controls before that (`IO-005`, `FX-005`).

### C9 — `power_on` comment versus the plugin

The proto comment says false turns bulbs off and also says an unset false leaves power unchanged. Protobuf bool cannot tell those apart. `PlaybackSession` never reads `PowerOn`; drivers turn the bulb on as part of setting a color. Brightness 0 is what actually reads as dark.

**Decision:** Studio stores and round-trips the bool (`KEY-014`) and previews from RGB and brightness. It does not claim that `power_on` false switches a bulb off. A format change is proposed separately and is not part of L1 (`FP-1`).

### C10 — Two plugin samplers disagree before the first keyframe

`PlaybackSession` uses a black default before the first keyframe. `GetStateAtTime` uses the channel default color. Playback is what bulbs do.

**Decision:** Studio matches `PlaybackSession` (`KEY-011`). Channel default color is still stored for authoring (`PROP-007`) and is not the pre-roll preview.

### C11 — Kelvin conversion details

`InterpolationEngine` clamps kelvin to 1000–40000 and truncates the converted channels. `ColorConverter` does not clamp the same way. The parser accepts 1000–10000 for authored COLOR_TEMPERATURE values. JavaScript `Math.round` is not the plugin's half-to-even rule.

**Decision:** Authoring uses 1000–10000 (`PROP-003`). The sampler uses the engine formula and half-to-even lerp (`KEY-010`, `KEY-012`). The numeric fixtures in those requirements are binding.

### C12 — Effect comment defaults versus renderers

Proto comments give LIGHTNING `flash_count` 2. `LightningRenderer` defaults `flash_count` to 1. STROBE comments talk about `flash_count`; `StrobeRenderer` reads `flicker_rate_hz` defaulting to 10. Candle and Aurora ignore some commented parameters.

**Decision:** Playback wins. The shared effect fixture is generated from the renderers (`FX-003`). Studio's new-effect defaults follow that fixture, not the comment table.

### C13 — Preshow, credits, and boundary fields

The proto stores preshow, credits, and start/end behavior. `PlaybackSession` does not apply the track fields. End behavior follows the plugin option, and the default option fades to black and then powers off.

**Decision:** L1 and L2 do not show editors for those fields. L3 may, and any such screen must say the current plugin does not apply them. Studio does not write non-default values in L1, so encoded tracks leave the protobuf defaults.

### C14 — Ease curves and a fourteenth effect

The master README lists ease-in, ease-out, and 14 effects. The proto and the plugin implement STEP, LINEAR, and 13 effect types.

**Decision:** The editor offers STEP and LINEAR only (`PROP-001`) and the 13 proto types (`FX-001`).

### C15 — March channel template "Mono" versus "Ambient"

Shipped master code has a Mono template with id `main` and `SPATIAL_CENTER`. The March spec's one-channel template is `ambient` / ambient.

**Decision:** New tracks use the March table (`CHAN-001`), including Ambient. Import keeps ids already in the file, including `main`.

### C16 — Overlay names versus proto hints

The March overlay section uses names like FRONT*LEFT. The proto and the shipped editor use `SPATIAL*\*`.

**Decision:** Files and the overlay use the proto names (`PREV-001`).

### C17 — Validation order versus authoring order

`TrackParser` checks that each channel's keyframe times are non-decreasing in file order, not after an internal sort. A keyframe at 0 with a non-zero transition fails V-012.

**Decision:** The encoder sorts each channel by time and clamps transitions (`KEY-005`, `KEY-008`). The automatic keyframe at 0 has transition 0 (`CHAN-005`).

### C18 — Preview does not interpolate

Preview Frame is a list of bulb colors. The plugin does not run the interpolation engine or effect renderers for it. Photosensitivity may still change effect output, and the response body does not echo the softened color.

**Decision:** Studio samples, then sends bulb states (`PREV-006`, `PREV-011`). The overlay shows the artistic sample. When settings say photosensitivity is on, the status line says bulbs may be softer (`PREV-012`). The track file is not rewritten to match the filter.

### C19 — Rebuild asked for minutes and then could not play

The unspecced rebuild (`cursor/rebuild-studio-6bff`) asked for duration in the New dialog, used a dev mock whose stream URL was empty, and shipped a transport without a scrubber. Video tests on `feat/refactor` were skipped because drag-and-drop did not load a file in headless Chromium.

**Decision:** Those failures are acceptance tests, not background. `MEDIA-002`, `MEDIA-004`, `MEDIA-006`, `MEDIA-010`, and `SHELL-002` exist so that path cannot return. Browser tests load a real generated file or the plugin proxy. They are not skipped.

---

## Test strategy

The `Tests` line on each requirement is the map from requirement to tier. A tier name there means that tier must contain a test whose title includes the requirement id and `@tier` once the requirement is approved. Definitions:

### T1 — Unit

Vitest on pure modules: sampler, encoder, validation, safety, snap, shortcut registry, IndexedDB snapshot shape. No browser and no Emby.

### T2 — Shared fixtures

JSON fixtures in `tests/fixtures/sampling/` used by Studio's Vitest tests and by the plugin's dotnet tests. The plugin test names include the same requirement ids.

| Fixture             | Normative content                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyframes.json`    | The cases in `KEY-009`, `KEY-010`, `KEY-011`, `KEY-012`, `KEY-013`, and `KEY-014`, including half-to-even and the kelvin integers named there |
| `effects.json`      | One default case and one non-default parameter case per effect type, generated by the plugin renderers and copied into this repo              |
| `roundtrip.lightfx` | A valid version-1 file for `IO-002`                                                                                                           |

A Studio `@fixture` test fails if the sampler differs by any RGB level, brightness level, or kelvin integer. Effect commands match offset, RGB, and brightness exactly.

### T3 — Browser

Playwright against the built SPA. Projects run in **Firefox and Chromium** for every `@browser` test under media, shell transport, eyedropper, and shortcuts. Other `@browser` tests run in Chromium and may also run in Firefox.

Clip generation (committed as a script, not as a large binary):

- Clip A: 10 seconds, 1280×720, 24 fps, H.264 yuv420p, AAC stereo, full-frame colors in 2 second blocks (black, red, green, blue, white), burned-in timecode. This is the direct-play and local-file clip.
- Clip B: 5 seconds, 320×240, 24 fps, HEVC 10-bit, color primaries bt2020, transfer smpte2084, MKV, TrueHD audio, and an `hdmv_pgs_subtitle` stream. This forces the non-direct-play path. If the CI ffmpeg cannot encode PGS, the script muxes a tiny committed PGS sample and fails if `ffprobe` does not show all three streams.

The harness decodes clip A to a center-pixel JSON file. Eyedropper fullstack tests compare the plugin PNG to an independent ffmpeg run (`PLUG-002`), not to the pre-encode lavfi color.

Browser tests that need a movie use clip A through the proxy or, in the local-dev test, through the file input. They do not skip when a drag-and-drop stunt fails.

### T4 — Full stack

Docker Compose:

1. Emby server, started and configured by the API (admin user, library folder).
2. The plugin, built with Studio's static files embedded and with `PLUG-001` through `PLUG-005` implemented.
3. Two library items: clip A and clip B, scanned in.
4. Two generic REST bulbs on the headless simulator in T5 (ports 9200 and 9201). Plugin settings: photosensitivity off, brightness cap 100, time offset 0, poll 200 ms for the automated playback test. Mapping profile `left` → bulb `left`, `right` → bulb `right`.
5. Playwright drives Studio at `/emby/OpenLightFX/studio/` and Emby's playback API for `SAVE-002`.

Pass means the HTTP contracts and the simulator `command_received` colors match the requirement numbers. The bulbs are the simulator's generic REST listeners. There is no separate REST-collector process.

### T5 — Simulator NDJSON

OQ-3 is answered. The full-stack rig runs [openlightfx-simulator](https://github.com/openlightfx/openlightfx-simulator) (Python) as `openlightfx-simulator --no-gui --config simulator.toml`. It emulates WiZ (UDP 38899), LIFX (UDP 56700), Govee (UDP 4003), Hue (HTTP bridge), and generic REST. Every event is one JSON object on stdout.

A color command looks like this (fields the program actually emits):

```json
{
  "ts": "2026-11-12T00:00:00.000Z",
  "event": "command_received",
  "bulb_id": "left",
  "bulb_name": "Left",
  "protocol": "rest",
  "ip": "",
  "command": "GET /api/light",
  "params": {
    "r": 255,
    "g": 0,
    "b": 0,
    "brightness": "100",
    "power": "true",
    "transition_ms": "0"
  },
  "state_after": { "r": 255, "g": 0, "b": 0, "brightness": 100, "power": true, "transition_ms": 0 }
}
```

Assertions read `event` (`command_received`), `bulb_id`, and `state_after.r`, `state_after.g`, `state_after.b`, `state_after.brightness`, and `state_after.power`. They ignore kelvin: the generic REST driver writes 4000 when kelvin is null, and these RGB commands do not assert it. `ts` is the simulator's UTC time. `brightness` may be a float. Other events (`simulator_started`, `transition_start`, `transition_end`, `parse_error`) are not color assertions.

The plugin REST template is a GET to the simulator bulb, for example `http://simulator:9200/api/light?r={r}&g={g}&b={b}&brightness={brightness}&transition_ms={transition_ms}&power={power}`. The automated playback test uses two of those REST bulbs. The same NDJSON stream is what a WiZ, LIFX, Govee, or Hue command would print.

### T6 — Real media, on demand

Not part of CI. Run on the owner's machine when `OLFX_REAL_MEDIA` points at a file of about 25 GB, 4K HEVC 10-bit HDR10 PQ, TrueHD, PGS, about 101 minutes, already in Emby. `OLFX_REAL_TRACK` may point at an existing `.lightfx` for J2; if unset, the tier creates a two-keyframe track.

The pass/fail numbers are in J5: first picture ≤ 20 s, seek p95 ≤ 1500 ms inside the encoded horizon, eyedropper p95 ≤ 15 s with the Hable header and ≤ 40 ms time error, playback bulb p95 ≤ 1500 ms at the default 500 ms poll. The script's `realmedia` tier never fails CI.

### T7 — Traceability gate

`docs/requirements/check-traceability.mjs`, described in [traceability.md](traceability.md). Every requirement in this document is `approved`. An approved L1 requirement fails the gate when one of its CI tiers has no test. While `tests/expected-failures.json` lists a tier, a failing test for that tier does not fail the gate. The requirements report still shows that failure.

---

## Traceability

Test titles include the requirement id and the tier tag, for example `MEDIA-006 @browser proxy seek p95`. Rules, the report JSON, and the CI command are in [traceability.md](traceability.md).

---

## Open questions

OQ-1, OQ-2, and OQ-3 are decided for this spec. The decisions below are normative.

**OQ-1.** `power_on` stays a proto3 bool. Studio round-trips that bool and does not let it change preview color (`KEY-014`). Format proposal FP-1 is deferred and is not part of L1 or L2. A decoded `false` is also what an omitted proto3 field produces, so tests assert the decoded bool rather than a distinct on-the-wire encoding of "unset".

**OQ-2.** The eyedropper tonemap stays fixed as ffmpeg `tonemap=hable` to bt709. HDR frames advertise `X-OpenLightFX-Tone-Map: hable-bt709` (`PLUG-002`, `PROP-005`). Studio does not follow the tonemap Emby is configured to use for television playback.

**OQ-3.** `openlightfx-simulator` is the bulb process. Headless mode is `openlightfx-simulator --no-gui`. It prints NDJSON for every event to stdout and emulates WiZ (UDP 38899), LIFX (UDP 56700), Govee (UDP 4003), Hue (HTTP bridge), and generic REST, configured with `simulator.toml`. Full-stack tests launch that program. They do not use a REST-collector stand-in. The line they assert on is [T5](#t5--simulator-ndjson).

---

## Appendix — TODO.md hints

These `STU` ids are the gaps TODO.md listed. They are not requirements.

| Hint                                                 | What this spec does                                         |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| STU-029 reorder only outside the timeline            | `CHAN-003` reorders lanes                                   |
| STU-029n solo missing from the context menu          | `CHAN-004`                                                  |
| STU-059o reserved loop-point swap                    | Out of scope                                                |
| STU-069 snapshot not cleared on save                 | `SAVE-006`                                                  |
| STU-074, STU-100, STU-101, STU-102 marketplace stubs | `IO-005` removes them from L1 and L2                        |
| STU-087, STU-089 metadata never wired                | `MEDIA-002`, `PLUG-001`, `PROP-009` take metadata from Emby |
| STU-112 startup not measured                         | `PERF-001`                                                  |
| STU-113 no streaming for huge files                  | `MEDIA-003`, `PERF-004`, `PLUG-003`                         |
| STU-124 autosave 60 s versus 2 min                   | `SAVE-005` is 30 s in IndexedDB                             |
| STU-016 aspect ratio                                 | `SHELL-003`                                                 |
| STU-032a, STU-037 snap gaps                          | `TIME-010`, `TIME-012`                                      |
| STU-038 no time-range selection                      | `TIME-008` Shift-click and `TIME-009` marquee               |
| STU-059 effects not verified on the timeline         | `FX-002`, `FX-003`                                          |
| STU-066 prompt to reselect a video file              | Withdrawn. `MEDIA-013` restores the Emby item               |
| STU-084 metadata only on export                      | `PROP-008` is L2 and is not required to save                |
| STU-110 no 10k benchmark                             | `PERF-002`                                                  |
| STU-132 scaling                                      | `A11Y-004`                                                  |
| Unbound zoom, eyedropper, theme, overlay chords      | `KEYB-001`, `KEYB-002`                                      |
| Silent paste and select-all                          | `KEYB-003`, `KEY-015`                                       |
