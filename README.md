# OpenLightFX Studio

Visual timeline editor for authoring `.lightfx` ambient lighting tracks. Part of the [OpenLightFX](https://github.com/openlightfx) ecosystem — create lighting tracks in Studio, share them on the Marketplace, and play them in sync with movies via the Emby plugin.

<!-- ![Studio Screenshot](media/screenshot.png) -->

## Features

- **Canvas-based timeline editor** — keyframe editing with drag, snap, and multi-select
- **Channel & group management** — organise lights into logical channels and groups
- **Multiple interpolation modes** — Step, Linear, Ease In, Ease Out, Ease In/Out
- **14 built-in effects** — fire, lightning, candle, breathing, and more
- **Scene markers** — mark chapters/scenes for easy navigation
- **Protobuf `.lightfx` format** — compact binary tracks with full metadata
- **Undo / redo** — full history support for all editing operations
- **Dark theme** — purpose-built dark UI for color-accurate editing
- **Photosensitivity metadata** — flag tracks with safety information

## Quick Start

The fastest way to get running is Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up dev
# Open http://localhost:5173
```

## Local Development

Requires **Node.js 22+**.

```bash
npm install
npm run dev          # SvelteKit dev server at http://localhost:5173
```

### Build Commands

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start dev server with HMR               |
| `npm run build`      | Production build (static output)         |
| `npm run preview`    | Preview production build locally         |
| `npm run check`      | Type-check with svelte-check             |
| `npm run lint`       | Lint with Prettier + ESLint              |
| `npm run format`     | Auto-format with Prettier                |

### Protobuf Compilation

The `.lightfx` schema lives at `proto/lightfx.proto`. To regenerate bindings:

```bash
# Via Docker (no local protoc needed)
docker compose -f docker-compose.dev.yml run protoc

# Output: proto/generated/
```

## Docker Compose

### Development (`docker-compose.dev.yml`)

Runs the SvelteKit dev server with hot reload. Source is bind-mounted; `node_modules` use an anonymous volume for performance.

```bash
docker compose -f docker-compose.dev.yml up dev
```

The `protoc` service is under the `tools` profile — run it on demand:

```bash
docker compose -f docker-compose.dev.yml run protoc
```

### CI (`docker-compose.ci.yml`)

Compiles protobuf then builds the static site. Used in CI pipelines.

```bash
docker compose -f docker-compose.ci.yml up --abort-on-container-exit
```

### Production (`docker-compose.prod.yml`)

Multi-stage build: Node compiles the SPA, nginx serves it. Hardened with read-only filesystem, dropped capabilities, non-root user, and resource limits.

```bash
docker compose -f docker-compose.prod.yml up -d
# Serves on http://localhost:80
```

## Technology Stack

| Layer          | Technology                                      |
| -------------- | ----------------------------------------------- |
| Framework      | SvelteKit with `@sveltejs/adapter-static` (SPA) |
| UI             | Svelte 5 (runes), Tailwind CSS v3               |
| Timeline       | HTML Canvas 2D                                  |
| Protobuf       | protobufjs                                      |
| Build          | Vite                                            |
| Language       | TypeScript                                      |
| Linting        | ESLint, Prettier                                |
| Type checking  | svelte-check                                    |

## Project Structure

```
openlightfx-studio/
├── proto/                    # Protobuf schema & generated bindings
│   └── lightfx.proto
├── src/
│   ├── lib/
│   │   ├── components/       # Svelte components
│   │   │   └── timeline/     # Canvas-based timeline editor
│   │   ├── proto/            # Protobuf loader & helpers
│   │   ├── services/         # Application services
│   │   ├── stores/           # Svelte stores (undo/redo)
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Shared utility functions
│   ├── routes/               # SvelteKit pages
│   └── app.html              # HTML shell
├── static/                   # Static assets
├── docker-compose.dev.yml    # Dev environment
├── docker-compose.ci.yml     # CI build
├── docker-compose.prod.yml   # Production deployment
├── Dockerfile                # Multi-stage prod build
├── nginx.conf                # Non-root nginx config
├── svelte.config.js
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and ensure checks pass:
   ```bash
   npm run check && npm run lint
   ```
4. Commit with a descriptive message
5. Open a pull request

## License

[MIT](LICENSE)
