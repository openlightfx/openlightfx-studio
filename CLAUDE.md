# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Dev server on :5173 (--host 0.0.0.0)
npm run build            # Production build (static SPA)
npm run preview          # Preview production build on :4173
npm run check            # Type-check (svelte-kit sync + svelte-check)
npm run lint             # Prettier --check + ESLint
npm run format           # Prettier --write
npm run proto:compile    # Regenerate protobuf JS/TS from proto/lightfx.proto

# E2E tests (Playwright, requires build first)
npm run test:e2e         # Run all e2e tests (headless)
npm run test:e2e:ui      # Open Playwright UI
npm run test:e2e:headed  # Run headed

# Run a single e2e test
npx playwright test --config e2e/playwright.config.ts e2e/tests/boot.spec.ts

# Validate changes (no unit test framework yet)
npm run check && npm run lint
```

## Architecture

SvelteKit 2 + Svelte 5 SPA (static adapter, `fallback: 'index.html'`). No server — all logic runs in the browser. Browser-based editor for authoring ambient lighting tracks (`.lightfx` protobuf files) for home theater smart bulbs.

### Data Flow

User actions → Svelte components → **projectStore** (creates Command) → **undoStore.execute()** → Command.execute() mutates store → Svelte reactivity re-renders UI.

Every mutation uses the **command pattern**: `Command` with `execute()`, `undo()`, and `serialize()`. The 18 command types live in `src/lib/commands/`. The undo stack is 200 deep and persists across saves.

### Key Layers

- **Stores** (`src/lib/stores/*.svelte.ts`) — Class-based singletons using `$state()` runes. Central: `projectStore` (track data), `timelineStore` (viewport/selection), `videoStore` (playback), `undoStore`, `uiStore`, `toastStore`, `clipboardStore`, `snapshotStore`.
- **Services** (`src/lib/services/`) — Pure functions: color math, interpolation, protobuf encoding/decoding, validation, safety analysis, keyboard shortcuts, file I/O, channel groups.
- **Effects** (`src/lib/effects/`) — 13 lighting effect renderers implementing `IEffectRenderer.sample()`, registered in `registry.ts`.
- **Workers** (`src/lib/workers/`) — Web Workers for snapshot serialization and scene detection. Imported as `import Worker from './foo.worker?worker'`.
- **Types** (`src/lib/types/`) — Core domain types in `track.ts`; effect types in `effects.ts`; project persistence in `project.ts`.
- **Proto** (`proto/lightfx.proto`) — Protobuf v3 schema for `.lightfx` binary format. Compiled to `src/lib/proto/lightfx.{js,d.ts}`. Never edit generated files directly.

### Timeline

Entirely **canvas-based** (not DOM) for 60 fps with 10k+ keyframes. `TimelineCanvas.svelte` renders; `TimelineInteraction.svelte` handles input. Video sync uses `requestAnimationFrame` in `videoStore`.

### E2E Tests

Playwright with page object pattern in `e2e/pages/`. Tests seed data via localStorage fixture (`e2e/fixtures/test-project.json`). Config: Chromium only, serial execution, builds preview server automatically.

## Svelte 5 Conventions

**Svelte 5 runes exclusively** — no Svelte 4 patterns (`writable`, `readable`, `export let`, `<slot>`, `getContext`/`setContext`).

- Props: `$props()` with inline types and destructuring defaults
- Children: `Snippet` type, rendered with `{@render children()}`
- State: `$state()`, computed: `$derived()` or getter methods
- Effects: `$effect()` with `untrack()` to avoid reactivity loops
- Store updates: always immutable (`{ ...this.state, field: newValue }`)
- Store computed values: getter methods (not `$derived`)

## Code Style

- Prettier: single quotes, trailing commas (`es5`), 100 char width, 2-space indent
- String literal unions for enums (not TypeScript `enum`)
- Named exports only (no default exports except Svelte components)
- Barrel `index.ts` in each `src/lib/` subdirectory
- Timestamps always in milliseconds (`timestampMs`, `durationMs`)
- IDs via `crypto.randomUUID()`
- Tailwind with custom theme tokens: `bg`, `surface`, `surface2`, `surface3`, `accent`, `accent2`, `text-base`, `textMuted`, `danger`, `success`, `warning`

## Adding an Effect

1. Create `src/lib/effects/renderers/myeffect.ts` implementing `IEffectRenderer`
2. Add definition to `EFFECT_DEFINITIONS` in `src/lib/effects/definitions.ts`
3. Register renderer in `src/lib/effects/registry.ts`
4. Add effect type string to `EffectType` union in `src/lib/types/effects.ts`
