# OpenLightFX Studio

Visual timeline editor for `.lightfx` lighting tracks. The Emby plugin plays a track in sync with a movie and drives WiZ, LIFX, Hue, Govee, and REST bulbs. Studio authors the track.

The file format is `proto/lightfx.proto` (schema version 1), the same contract as [openlightfx-emby](https://github.com/openlightfx/openlightfx-emby) `TrackParser`. This repo does not change that schema. Scene markers exist only in the editor and are not written into `.lightfx`.

## Develop

Node.js 22+.

```bash
npm install
npm run dev      # http://localhost:5173 — mock Emby API
npm test
npm run check
npm run build    # static site in dist/, relative asset paths
```

`npm run dev` uses the mock backend (bulbs, a small library, no media stream). Open a local video with the Video button. `?backend=live&server=http://host:8096` talks to a real plugin instead. A production build probes the plugin and keeps working offline if it is down: import/export, local video, and the on-screen lights still run.

When the plugin hosts the build, Studio is a static site under a path such as `/emby/OpenLightFX/studio/`. Asset URLs are relative. API calls go to the Emby server root (`/OpenLightFX/Studio/...`) with `X-Emby-Token` when the Emby web session exposes one.

## Backend

Typed client: `src/lib/api/types.ts`. Paths are relative to the Emby server root.

| Method | Path | Body |
| --- | --- | --- |
| GET | `/OpenLightFX/Studio/Bulbs` | |
| GET | `/OpenLightFX/Studio/Items?search=` | |
| GET | `/OpenLightFX/Studio/Items/{itemId}/StreamUrl` | |
| GET | `/OpenLightFX/Studio/Tracks?itemId=` | |
| GET | `/OpenLightFX/Studio/Tracks/{trackId}` | raw `.lightfx` |
| PUT | `/OpenLightFX/Studio/Tracks/{trackId}?itemId=` | raw `.lightfx` (`application/octet-stream`) |
| POST | `/OpenLightFX/Studio/Preview/Start` | `{ mapping: { channelId: bulbId[] } }` |
| POST | `/OpenLightFX/Studio/Preview/Frame` | `{ states: [{ bulbId, r, g, b, brightness, transitionMs }] }` |
| POST | `/OpenLightFX/Studio/Preview/Stop` | |

Preview frames are throttled to 10 Hz, or slower when a mapped bulb's `minTransitionMs` is higher. Bulbs that cannot play an effect receive that effect's fallback color.

## Release

Push a `v*` tag. `.github/workflows/release.yml` builds the site and attaches `openlightfx-studio-dist.zip` to the GitHub Release. The zip root is the static site (`index.html` at the top), which the plugin can download and serve.
