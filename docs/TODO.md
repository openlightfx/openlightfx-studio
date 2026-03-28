# TODO — Requirements Gaps

Verification of requirements from `../requirements/openlightfx-studio.md`.
**121 PASS · 14 PARTIAL · 14 FAIL** out of 149 requirements.

---

## Not Implemented

| ID       | Area         | Issue                                                                         |
| -------- | ------------ | ----------------------------------------------------------------------------- |
| STU-029  | Timeline     | Channel lane drag-and-drop reordering only in ChannelManager, not in timeline |
| STU-029n | Context Menu | Solo/Unsolo toggle item missing from timeline context menu                    |
| STU-059o | Scene        | Reserved loop-point auto-swap — not implemented (spec says "reserved")        |
| STU-069  | Snapshot     | `clearSnapshot()` exists but never called after `saveProjectFile()`           |
| STU-074  | Export       | "Export for Marketplace" is a TODO stub                                       |
| STU-087  | Video Meta   | `extractVideoMetadata()` exists but never called on video load                |
| STU-089c | Video Meta   | Chapter extraction exists but not wired to create `MARKER_CHAPTER` markers    |
| STU-089d | Video Meta   | `candidateMetadata` fields defined but extraction never triggered             |
| STU-100  | Marketplace  | Publish to Marketplace is a stub                                              |
| STU-101  | Marketplace  | OAuth authentication not implemented                                          |
| STU-102  | Marketplace  | Marketplace field validation present but publish not wired                    |
| STU-112  | Performance  | No startup time measurement or optimization                                   |
| STU-113  | Performance  | Uses `preload=auto`; no streaming support for 50GB files                      |
| STU-124  | Usability    | Auto-save interval is 60s, spec says default 2 minutes                        |

## Partially Implemented

| ID       | Area          | Gap                                                                      |
| -------- | ------------- | ------------------------------------------------------------------------ |
| STU-016  | Video         | Aspect ratio via CSS but no ResizeObserver for container                 |
| STU-029c | Timeline      | Scene marker editing only via properties panel (no inline edit)          |
| STU-029e | Context Menu  | Missing Solo/Unsolo items (all other items present)                      |
| STU-032a | Keyframe      | Collision snap works but no tooltip shown                                |
| STU-037  | Keyframe      | Snaps to playhead only; no snap to round times or video frame boundaries |
| STU-038  | Keyframe      | `selectAllInChannel` exists; no time-range selection                     |
| STU-059f | Effects       | Effect blocks stored but timeline rendering not fully verified           |
| STU-059h | Effects       | Palette preview works; overlay effect preview not verified               |
| STU-059n | Scene         | Chapter extraction implemented; auto-placement to UI not verified        |
| STU-066  | Snapshot      | Full state restored but no prompt to re-select inaccessible video        |
| STU-084  | Metadata      | Movie Metadata modal shown on export but not on save                     |
| STU-086  | Metadata      | `EDIT_METADATA` command exists but usage not verified as consistent      |
| STU-110  | Performance   | rAF + dirty flag optimized, but no 10k keyframe benchmark                |
| STU-132  | Accessibility | rem-based sizing present, no explicit scaling test                       |

## Key Themes

1. **Video metadata extraction is wired but not connected** — STU-087/089c/089d: parsers exist in `services/video-metadata/` but `extractVideoMetadata()` is never called on video load. Biggest integration gap.
2. **Marketplace is a stub** — STU-074/100/101/102: `PublishDialog` exists with TODO markers.
3. **Timeline context menu missing Solo/Unsolo** — STU-029e/029n.
4. **Snapshot not cleared on save** — STU-069: one-line fix needed.
5. **Auto-save interval mismatch** — STU-124: 60s vs spec's 2 minutes.

---

## UI Reachability Audit

Features that exist in code but are **invisible or unreachable** in the running application.

### Right Sidebar — Tabbed Pane Layout

The right sidebar uses a **tabbed layout** (Properties | Channels | Effects) so each pane gets full height. All three panels are reachable via a single click on the tab bar.

### Unreachable Dialogs

| Dialog                  | Trigger                                  | Reachable? | Issue                                                                |
| ----------------------- | ---------------------------------------- | ---------- | -------------------------------------------------------------------- |
| ExportDialog            | MenuBar File → Export, Ctrl+E            | ✅ Yes     |                                                                      |
| MovieMetadataDialog     | ExportDialog, TrackProperties            | ✅ Yes     |                                                                      |
| KeyboardShortcutsDialog | MenuBar Help, ? key                      | ✅ Yes     |                                                                      |
| WelcomeDialog           | Auto-launch on first visit, MenuBar Help | ✅ Yes     |                                                                      |
| SceneDetectionDialog    | MenuBar File → Auto-Detect Scenes…       | ✅ Yes     |                                                                      |
| PublishDialog           | MenuBar File (disabled)                  | ❌ No      | Menu item has `disabled: true`; expected since marketplace is a stub |
| AddChannelDialog        | Sidebar Channels tab                     | ✅ Yes     |                                                                      |
| TemplateDialog          | Sidebar Channels tab                     | ✅ Yes     |                                                                      |
| GroupDialog             | Sidebar Channels tab context menu        | ✅ Yes     |                                                                      |

### Documented but Unimplemented Keyboard Shortcuts

These shortcuts appear in `KeyboardShortcutsDialog` but have no handler in `+page.svelte`:

| Shortcut     | Action           | Status                                     |
| ------------ | ---------------- | ------------------------------------------ |
| Ctrl+=       | Zoom in          | ❌ Not bound (Ctrl+Wheel works)            |
| Ctrl+-       | Zoom out         | ❌ Not bound (Ctrl+Wheel works)            |
| Ctrl+0       | Zoom to fit      | ❌ Not bound (`zoomToFit()` method exists) |
| I            | Eyedropper       | ❌ Not bound (toolbar button works)        |
| Ctrl+D       | Toggle dark mode | ❌ Not bound (MenuBar View → toggle works) |
| Ctrl+L       | Toggle overlay   | ❌ Not bound (MenuBar View → toggle works) |
| Ctrl+Shift+S | Save as          | ❌ Not bound (no save-as UI exists)        |
| Ctrl+O       | Open project     | ❌ Not bound (no handler)                  |

### Keyboard Shortcuts with Silent Failures

These shortcuts work but **fail silently** when preconditions aren't met:

| Shortcut            | Precondition          | Failure behavior                        |
| ------------------- | --------------------- | --------------------------------------- |
| K (add keyframe)    | `activeChannelId` set | ✅ Shows toast "Select a channel first" |
| Ctrl+V (paste)      | `activeChannelId` set | ❌ Silent no-op (should show toast)     |
| Ctrl+A (select all) | `activeChannelId` set | ❌ Silent no-op (should show toast)     |

**Note:** `activeChannelId` can be set by clicking a channel lane header in the timeline, so these shortcuts work without the sidebar — the user just needs to click a lane first.

### Working Features (No Issues)

| Feature               | Mechanism                                                                 |
| --------------------- | ------------------------------------------------------------------------- |
| Timeline context menu | Right-click on canvas — fully wired                                       |
| Minimap               | Always rendered, fixed height, `shrink-0`                                 |
| Timeline panel sizing | 15–70% enforced by splitter clamp                                         |
| Eyedropper            | Toolbar button (💧) — always visible                                      |
| LightingOverlay       | Toolbar toggle (💡) — always visible, `overlayEnabled` defaults to `true` |
| LightIcons            | Always rendered; shows icons for channels with spatial hints              |
| Playback shortcuts    | Space, arrows, M — all bound and independent                              |
| Undo/redo shortcuts   | Ctrl+Z, Ctrl+Shift+Z — bound and independent                              |
| Save/export shortcuts | Ctrl+S, Ctrl+E — bound and independent                                    |
