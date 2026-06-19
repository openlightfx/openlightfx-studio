# GitHub Copilot Instructions — OpenLightFX Studio

Browser-based SvelteKit 2 + Svelte 5 SPA for authoring ambient lighting tracks (`.lightfx` protobuf files). No server — all logic runs in the browser. Static adapter with SPA fallback.

## Commands

```bash
npm run dev              # Dev server on :5173
npm run build            # Production build
npm run check            # Type-check (svelte-kit sync + svelte-check)
npm run lint             # Prettier --check + ESLint
npm run format           # Prettier --write
npm run proto:compile    # Regenerate protobuf JS/TS from proto/lightfx.proto

# E2E tests (Playwright, requires build first)
npm run test:e2e                              # Run all tests (headless)
npx playwright test --config e2e/playwright.config.ts e2e/tests/boot.spec.ts  # Single test file
```

## Architecture

### Data Flow

Every user mutation follows this exact path:

```
UI component → create Command → undoStore.execute(command) → command.execute() → projectStore mutation → Svelte reactivity re-renders
```

**Never mutate `projectStore` directly from a component.** Always create a `Command` and pass it to `undoStore.execute()`.

### Command Pattern

Every mutation is a `Command` with `execute()`, `undo()`, and `serialize()`. The 19 command types live in `src/lib/commands/`. Commands receive the store they need via constructor injection (e.g., `KeyframeStore`, `ChannelStore`). The undo stack is capped at 200 and persists with the project.

```typescript
export class AddKeyframeCommand implements Command {
  readonly type = 'ADD_KEYFRAME';
  readonly description: string;
  constructor(private readonly keyframe: Keyframe, private readonly store: KeyframeStore) {
    this.description = `Add keyframe at ${keyframe.timestampMs}ms`;
  }
  execute(): void { this.store.addKeyframe({ ...this.keyframe }); }
  undo(): void { this.store.removeKeyframe(this.keyframe.id); }
  serialize(): SerializedCommandData { return { type: this.type, description: this.description, payload: { keyframe: this.keyframe } }; }
}
```

To batch multiple mutations into one undo step, use `CompositeCommand`.

### Stores

All stores are **class-based singletons** using Svelte 5 `$state()` runes. Exported as named instances from `src/lib/stores/index.ts`.

| Store | Responsibility |
|-------|---------------|
| `projectStore` | The loaded track — channels, keyframes, effects, metadata |
| `undoStore` | Command undo/redo stack |
| `timelineStore` | Viewport (zoom, scroll), selection, solo/mute state |
| `videoStore` | Video element binding, playback, RAF-based time sync |
| `uiStore` | Modals, dark mode, overlays, snapping |
| `toastStore` | Toast notifications |
| `clipboardStore` | Copy/paste buffer |
| `snapshotStore` | Auto-saves to localStorage every 60s via Web Worker |

`projectStore` implements multiple narrow store interfaces (`KeyframeStore`, `ChannelStore`, etc.) so commands only receive the interface they need.

### Timeline

The timeline is **entirely canvas-based** (not DOM) — `TimelineCanvas.svelte` renders to `<canvas>`, `TimelineInteraction.svelte` handles input. Never try to add DOM elements to the timeline for rendering.

### Web Workers

Workers live in `src/lib/workers/` and are imported with the `?worker` suffix:
```typescript
import SnapshotWorker from '$lib/workers/snapshot.worker?worker';
```
CORP/COEP headers are required (set in `vite.config.js`) for SharedArrayBuffer/FFmpeg.

### Effects

13 lighting effect renderers implement `IEffectRenderer.sample()`. To add one:
1. Create `src/lib/effects/renderers/myeffect.ts` implementing `IEffectRenderer`
2. Add definition to `EFFECT_DEFINITIONS` in `src/lib/effects/definitions.ts`
3. Register in `src/lib/effects/registry.ts`
4. Add type string to `EffectType` union in `src/lib/types/effects.ts`

### Protobuf

`.lightfx` files are protobuf v3 binary. The schema is `proto/lightfx.proto`. The generated files (`src/lib/proto/lightfx_pb.js`, `lightfx.d.ts`) are **never edited directly** — regenerate with `npm run proto:compile`. Encoding/decoding is in `src/lib/services/protobuf.ts`, which maps string literal unions to numeric proto enum values.

## Key Conventions

### Svelte 5 Only — No Svelte 4 Patterns

```svelte
<!-- Props -->
const { title, children }: { title: string; children?: Snippet } = $props();

<!-- Children (not <slot>) -->
{@render children?.()}

<!-- State / derived -->
let count = $state(0);
let doubled = $derived(count * 2);

<!-- Effects — use untrack() to avoid reactivity loops -->
$effect(() => { untrack(() => { someState = derivedValue; }); });
```

No `writable`/`readable` stores, no `export let`, no `getContext`/`setContext`, no `<slot>`.

### Store Updates Are Immutable

```typescript
// Always spread — never mutate in place
this.state = { ...this.state, channels: [...this.state.channels, newChannel] };
```

### Naming

- All timestamps and durations: `*Ms` suffix (`timestampMs`, `durationMs`, `transitionMs`)
- IDs: `crypto.randomUUID()` via `src/lib/services/id.ts`
- String literal unions for enums (not TypeScript `enum`)
- Named exports only — no default exports except Svelte components
- Barrel `index.ts` in each `src/lib/` subdirectory

### Tailwind Theme Tokens

Use the custom semantic tokens, not raw Tailwind colors:
`bg`, `surface`, `surface2`, `surface3`, `accent`, `accent2`, `text-base`, `textMuted`, `danger`, `success`, `warning`

### E2E Tests

Playwright only (no unit tests). Tests seed project data via `localStorage` using `e2e/fixtures/test-project.json`. Use the page object classes in `e2e/pages/` rather than raw locators. Config: Chromium only, 1 worker (serial).

```typescript
// Seeding pattern
await page.evaluate((project) => {
  localStorage.setItem('project', JSON.stringify(project));
}, testProject);
await page.reload();
```

### Adding a New Command

1. Create `src/lib/commands/my-command.ts` implementing `Command`
2. Add a new `CommandType` string to the union in `src/lib/types/commands.ts`
3. Export from `src/lib/commands/index.ts`
4. Instantiate and pass to `undoStore.execute()` from the component
