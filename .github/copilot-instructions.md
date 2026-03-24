# OpenLightFX Studio — Copilot Instructions

OpenLightFX Studio is a web application for authoring `.lightfx` ambient lighting tracks. Users design color/effect keyframes on a visual timeline, organized into channels that map to physical smart bulbs at playback time. The output is a compact protobuf binary (`.lightfx`) that the Emby plugin plays in sync with movies.

## Architecture

- **SvelteKit** with `@sveltejs/adapter-static` — builds to a pure static SPA (HTML/CSS/JS)
- **Svelte 5** with runes (`$state`, `$derived`, `$effect`) — all components use runes mode
- **Tailwind CSS v3** — dark theme via CSS custom properties
- **HTML Canvas 2D** — the timeline editor is entirely canvas-rendered, not DOM elements
- **protobufjs** — loads `proto/lightfx.proto` dynamically for `.lightfx` encoding/decoding
- **Vite** — dev server and build tooling
- **TypeScript** throughout

## Build & Dev

```bash
# Local development
npm install
npm run dev              # SvelteKit dev server at :5173
npm run build            # Production static build → build/
npm run check            # svelte-check type checking
npm run lint             # Prettier + ESLint
npm run format           # Auto-format

# Docker development
docker compose -f docker-compose.dev.yml up dev       # Dev server with HMR
docker compose -f docker-compose.dev.yml run protoc   # Compile protobuf

# Docker production
docker compose -f docker-compose.prod.yml up -d       # Hardened nginx on :80
```

## Key Conventions

### Svelte 5 Runes
All components use Svelte 5 runes. Use `$state` for reactive state, `$derived` for computed values, and `$effect` for side effects. Do not use legacy `let` reactivity or `$:` statements.

### Class-Based Stores
Stores in `src/lib/stores/` are class-based with undo/redo support. State mutations go through store methods that record history snapshots.

### Canvas Timeline
The timeline editor (`src/lib/components/timeline/`) renders entirely on HTML Canvas. Interaction is handled via the Pointer Events API (`pointerdown`, `pointermove`, `pointerup`) — never mouse events. Hit testing is coordinate-based, not DOM-based.

### Drag Operations
All drag interactions use the Pointer Events API with `setPointerCapture()` for reliable tracking. This ensures drags work correctly even when the pointer leaves the canvas element.

### Type Definitions
TypeScript types live in `src/lib/types/`. Key types: `Channel`, `ChannelGroup`, `Keyframe`, `EffectKeyframe`, `SceneMarker`, `TimelineState`.

### Theming
The dark theme uses CSS custom properties (`--bg`, `--surface`, `--surface-alt`, `--accent`, `--text`, `--text-muted`, etc.) defined in `src/app.css`. Reference these variables instead of hard-coding colors.

### File Organization
- `src/lib/components/` — Svelte components, grouped by feature
- `src/lib/components/timeline/` — Canvas timeline editor
- `src/lib/stores/` — Application state stores
- `src/lib/services/` — Business logic and integrations
- `src/lib/types/` — TypeScript type definitions
- `src/lib/utils/` — Pure utility functions
- `src/lib/proto/` — Protobuf loader and helpers
- `src/routes/` — SvelteKit pages

## Proto Schema

The `.lightfx` format schema is at `proto/lightfx.proto`. It is loaded dynamically at runtime via a protobufjs `?raw` import (Vite inlines the `.proto` text). Do not pre-compile to static JS — the dynamic approach keeps the schema human-readable and easy to update.

Key protobuf types: `LightFXTrack` (root), `TrackMetadata`, `Channel`, `ChannelGroup`, `Keyframe`, `EffectKeyframe`, `SceneMarker`, `SafetyInfo`.

Interpolation modes: `STEP`, `LINEAR`, `EASE_IN`, `EASE_OUT`, `EASE_IN_OUT`.

Channels are an abstraction layer — tracks define keyframes per channel, and the Emby plugin maps channels to physical bulbs at runtime via mapping profiles. This makes tracks portable across different bulb setups.
