# Copilot Instructions — OpenLightFX Studio

## Commands

```bash
npm run dev            # Start dev server on :5173
npm run build          # Production build (static SPA)
npm run check          # Type-check (svelte-kit sync + svelte-check)
npm run lint           # Prettier --check + ESLint
npm run format         # Prettier --write
npm run proto:compile  # Regenerate protobuf JS/TS from proto/lightfx.proto
```

No test framework is configured. Validate changes with `npm run check && npm run lint`.

## Architecture

SvelteKit 2 + Svelte 5 single-page app using the static adapter (`adapter-static` with `fallback: 'index.html'`). There is no server — all logic runs in the browser.

### Data flow

User actions → Svelte components → **projectStore** (creates Command) → **undoStore.execute()** → Command.execute() mutates store → Svelte reactivity re-renders UI.

Undo/redo uses the **command pattern**: every mutation is a `Command` with `execute()`, `undo()`, and `serialize()`. The undo stack is 200 deep and persists across project saves.

### Key layers

- **Stores** (`src/lib/stores/*.svelte.ts`) — Class-based singletons using `$state()` runes. Central stores: `projectStore` (track data + commands), `timelineStore` (viewport/selection), `videoStore` (playback), `uiStore` (modals/prefs), `undoStore`, `toastStore`.
- **Services** (`src/lib/services/`) — Pure functions for color math, interpolation, protobuf encoding/decoding, validation, safety analysis, keyboard shortcuts, and file I/O.
- **Effects** (`src/lib/effects/`) — 13 lighting effect renderers implementing `IEffectRenderer.sample()`, registered in a `Map<EffectType, IEffectRenderer>` in `registry.ts`.
- **Workers** (`src/lib/workers/`) — Web Workers for snapshot serialization and scene detection. Typed request/response messages via `postMessage`. Imported as `import Worker from './foo.worker?worker'`.
- **Types** (`src/lib/types/`) — All TypeScript interfaces. Core domain types in `track.ts`; effect types in `effects.ts`; project persistence in `project.ts`.
- **Proto** (`proto/lightfx.proto`) — Protobuf v3 schema for the `.lightfx` binary track format. Compiled to `src/lib/proto/lightfx.{js,d.ts}` via `npm run proto:compile`. Never edit the generated files directly.

### Timeline

The timeline is entirely **canvas-based** (not DOM) for 60 fps performance with 10k+ keyframes. `TimelineCanvas.svelte` handles rendering; `TimelineInteraction.svelte` handles mouse/keyboard events. Video sync uses a `requestAnimationFrame` loop in `videoStore`.

## Svelte 5 Conventions

This codebase uses **Svelte 5 runes exclusively** — no Svelte 4 patterns (`writable`, `readable`, `export let`, `<slot>`).

### Components

- Props via `$props()` with inline type annotations and destructuring defaults:
  ```svelte
  let { variant = 'primary', disabled = false, children }: {
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
    children: Snippet;
  } = $props();
  ```
- Children via `Snippet` type, rendered with `{@render children()}`
- Local state via `$state()`, computed values via `$derived()` or getter methods
- Side effects via `$effect()`, with `untrack()` to avoid reactivity loops

### Stores

Class-based singletons with `$state()` fields. Updates are **always immutable** (object spread):

```ts
this.state = { ...this.state, field: newValue };
```

Computed values use **getter methods** (not `$derived`):

```ts
get visibleDurationMs(): number {
  return this.viewport.viewportWidth / this.viewport.pxPerMs;
}
```

## Adding an Effect

1. Create `src/lib/effects/renderers/myeffect.ts` implementing `IEffectRenderer`
2. Add the definition to `EFFECT_DEFINITIONS` in `src/lib/effects/definitions.ts`
3. Register the renderer in the map in `src/lib/effects/registry.ts`
4. Add the effect type string to the `EffectType` union in `src/lib/types/effects.ts`

## Code Style

- Prettier: single quotes, trailing commas (`es5`), 100 char width, 2-space indent
- String literal unions for enums (not TypeScript `enum`)
- Named exports only (no default exports except Svelte components)
- Barrel `index.ts` in each `src/lib/` subdirectory
- Timestamps always in milliseconds (`timestampMs`, `durationMs`)
- IDs generated via `crypto.randomUUID()`
- Tailwind CSS with custom theme tokens (`bg`, `surface`, `surface2`, `accent`, `accent2`, `text-base`, `textMuted`) defined in `tailwind.config.js`
