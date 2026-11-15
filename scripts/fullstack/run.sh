#!/usr/bin/env bash
# Local full stack: Emby + plugin (studio host API branch) + headless simulator.
# CI validates the compose file. The live run needs Docker, the .NET 8 SDK,
# and read access to the private openlightfx-simulator repository.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f "${OLFX_COMPOSE_FILE:-docker-compose.fullstack.yml}")
if [[ -n "${OLFX_COMPOSE_PROJECT:-}" ]]; then COMPOSE+=(-p "$OLFX_COMPOSE_PROJECT"); fi
MEDIA="${OLFX_MEDIA_DIR:-$ROOT/media/generated}"
PLUGIN="${OLFX_EMBY_REPO:-${OLFX_STACK_DIR:-$ROOT/.emby-stack}/emby/src}"
EMBY_BRANCH="${OLFX_EMBY_BRANCH:-main}"
SIM_URL="${OLFX_SIMULATOR_URL:-https://github.com/openlightfx/openlightfx-simulator.git}"
WORK="${OLFX_STACK_DIR:-$ROOT/.emby-stack}"

if ! command -v docker >/dev/null; then
  echo "Docker is not installed. The full stack requires Docker." >&2
  exit 1
fi

echo "Validating compose file"
"${COMPOSE[@]}" config >/dev/null

if [[ "${OLFX_FULLSTACK_CONFIG_ONLY:-}" == "1" ]]; then
  echo "Compose file is valid. Set OLFX_FULLSTACK_CONFIG_ONLY empty to boot the stack."
  exit 0
fi

if ! command -v dotnet >/dev/null; then
  echo "The .NET 8 SDK is required to build the plugin." >&2
  exit 1
fi

mkdir -p "$WORK" docker/simulator-src
if [[ ! -f docker/simulator-src/src/openlightfx_simulator/__main__.py ]]; then
  echo "Cloning openlightfx-simulator"
  if ! git clone --depth 1 "$SIM_URL" docker/simulator-src; then
    echo "Could not clone $SIM_URL. The simulator repository is private."
    echo "Clone it into docker/simulator-src and rerun, or export a credential that can read it."
    exit 1
  fi
fi

bash scripts/media/generate-clips.sh
# Tracks and sidecars saved by an earlier run live in the bind-mounted media, not in
# the Emby volume, so `down -v` keeps them and the next SAVE-001 hits a stale conflict.
find "$MEDIA" -type d -name lightfx -prune -exec rm -rf {} +
# MEDIA-015: Emby is told this movie's runtime is 0. ffprobe still sees 120s.
ZERO_DIR="$MEDIA/clip-zero"
mkdir -p "$ZERO_DIR"
if [[ ! -f "$ZERO_DIR/clip-zero.mp4" ]]; then
  echo "Clip zero: 120s H.264 with no Emby runtime"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "color=c=black:s=160x90:r=24:d=120" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=120" \
    -t 120 -c:v libx264 -pix_fmt yuv420p -g 48 -sc_threshold 0 -c:a aac -shortest \
    "$ZERO_DIR/clip-zero.mp4"
fi
LONG_DIR="$MEDIA/clip-long"
mkdir -p "$LONG_DIR"
if [[ ! -f "$LONG_DIR/clip-long.mp4" ]]; then
  echo "Clip long: 10 min H.264 so the edit proxy is still encoding when playback starts"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "color=c=black:s=160x90:r=24:d=600" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=600" \
    -t 600 -c:v libx264 -pix_fmt yuv420p -preset ultrafast -g 48 -sc_threshold 0 -c:a aac -shortest \
    "$LONG_DIR/clip-long.mp4"
fi
cat > "$LONG_DIR/movie.nfo" << 'EOF'
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<movie>
  <title>clip-long</title>
</movie>
EOF
cat > "$ZERO_DIR/movie.nfo" << 'EOF'
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<movie>
  <title>clip-zero</title>
  <runtime>0</runtime>
  <lockdata>true</lockdata>
</movie>
EOF
npm run build
( cd build && rm -f "$WORK/studio.zip" && zip -qr "$WORK/studio.zip" . )

echo "Starting Emby"
"${COMPOSE[@]}" up -d emby
SETUP_JSON="$(node scripts/fullstack/setup-emby.mjs | tail -n 1)"
API_KEY="$(printf '%s' "$SETUP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["apiKey"])')"
if [[ -z "$API_KEY" ]]; then echo "Emby first-run did not return an API key"; exit 1; fi
echo "Emby API key acquired"

mkdir -p "$WORK/emby/lib"
for dll in MediaBrowser.Common.dll MediaBrowser.Controller.dll MediaBrowser.Model.dll Emby.Web.GenericEdit.dll; do
  if [[ ! -f "$WORK/emby/lib/$dll" ]]; then
    "${COMPOSE[@]}" cp "emby:/system/$dll" "$WORK/emby/lib/$dll"
  fi
done

if [[ ! -d "$PLUGIN" ]]; then
  if [[ -n "${OLFX_EMBY_REPO:-}" ]]; then echo "Plugin checkout not found: $PLUGIN"; exit 1; fi
  git clone --depth 1 --branch "$EMBY_BRANCH" https://github.com/openlightfx/openlightfx-emby.git "$PLUGIN"
fi
cp -a "$WORK/emby/lib/." "$PLUGIN/lib/"
mkdir -p "$PLUGIN/src/OpenLightFX.Emby/obj/studio-dist"
cp "$WORK/studio.zip" "$PLUGIN/src/OpenLightFX.Emby/obj/studio-dist/openlightfx-studio-dist.zip"
printf 'phase1' > "$PLUGIN/src/OpenLightFX.Emby/obj/studio-dist/openlightfx-studio-dist.zip.version"
( cd "$PLUGIN/src/OpenLightFX.Emby" && dotnet build -c Release -p:StudioVersion=phase1 )
DLL="$PLUGIN/src/OpenLightFX.Emby/bin/Release/net8.0/OpenLightFX.Emby.dll"
( cd "$PLUGIN" && dotnet tool restore && dotnet ilrepack \
  /lib:"$PLUGIN/lib" \
  /out:"$DLL.merged" \
  "$DLL" \
  "$PLUGIN/src/OpenLightFX.Emby/bin/Release/net8.0/Google.Protobuf.dll" )
mv "$DLL.merged" "$DLL"
"${COMPOSE[@]}" cp "$DLL" emby:/config/plugins/OpenLightFX.Emby.dll
# MEDIA-015 needs an item whose Emby runtime is unknown. Emby always probes on scan
# and its update API ignores RunTimeTicks, so clear it in the database while Emby
# is stopped. movie.nfo locks the item so a later refresh does not probe it again.
"${COMPOSE[@]}" stop emby
EMBY_CONFIG_VOLUME="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Name}}{{end}}{{end}}' "$("${COMPOSE[@]}" ps -aq emby)")"
# Start fixture endpoints before resolving their isolated addresses for the room seed.
echo "Starting simulator and isolated UDP endpoints"
mapfile -t UDP_SERVICES < <("${COMPOSE[@]}" config --services | grep "^udp-" || true)
"${COMPOSE[@]}" up -d --build simulator "${UDP_SERVICES[@]}"
SEED_ARGS=()
if [[ -n "${OLFX_LAB_SCENARIO_FILE:-}" ]]; then
  UDP_ADDRESSES=$(node scripts/fullstack/udp-addresses.mjs "$OLFX_LAB_SCENARIO_FILE" "$OLFX_COMPOSE_FILE" "$OLFX_COMPOSE_PROJECT")
  SEED_ARGS=(-v "$OLFX_LAB_SCENARIO_FILE:/lab-scenario.json:ro" -e OLFX_LAB_SCENARIO_FILE=/lab-scenario.json -e OLFX_LAB_UDP_ADDRESSES="$UDP_ADDRESSES")
fi
docker run --rm "${SEED_ARGS[@]}" -e OLFX_UID="${OLFX_UID:-1000}" -e OLFX_GID="${OLFX_GID:-1000}" -v "$EMBY_CONFIG_VOLUME:/config" python:3.12-slim python -c '
import json, os, sqlite3
db = sqlite3.connect("/config/data/library.db")
n = db.execute("update MediaItems set RunTimeTicks = NULL where Path = ?", ("/media/clip-zero/clip-zero.mp4",)).rowcount
db.commit()
if n != 1: raise SystemExit("clip-zero not found in library.db")
# Test-only fixture data in this disposable Docker volume; never written to a real Emby install.
room_id = "r_fullstack"
def bulb(bid, name, position, port):
    return {
        "Id": bid, "Name": name, "RoomId": room_id, "Position": position,
        "Config": {
            "protocol": "Rest", "id": bid, "name": name, "ipAddress": "0.0.0.0", "port": port,
            "restUrlTemplate": f"http://simulator:{port}/api/light?r={{r}}&g={{g}}&b={{b}}&brightness={{brightness}}&transition_ms={{transition_ms}}&power={{power}}",
            "restHttpMethod": "GET"
        }
    }
doc = {
    "SchemaVersion": 1,
    "UpdatedAt": "2025-01-01T00:00:00.0000000+00:00",
    "Rooms": [{
        "Id": room_id, "Name": "Fullstack Room",
        "Screen": {"DeviceId": "openlightfx-fullstack-play", "DeviceName": "Fullstack Player", "AppName": "OpenLightFX Tests"},
        "Bulbs": [{"Id": "left", "Position": "left"}, {"Id": "right", "Position": "right"}],
        "UpdatedAt": "2025-01-01T00:00:00.0000000+00:00"
    }],
    "Bulbs": [bulb("left", "Left", "left", 9200), bulb("right", "Right", "right", 9201)]
}
if os.environ.get("OLFX_LAB_SCENARIO_FILE"):
    with open(os.environ["OLFX_LAB_SCENARIO_FILE"], encoding="utf-8") as source:
        scenario = json.load(source)
    doc["Bulbs"] = []
    doc["Rooms"][0]["Bulbs"] = []
    for index, fixture in enumerate(scenario["room"]["bulbs"]):
        port = 9200 + index + (1 if index >= 2 else 0)
        entry = bulb(fixture["id"], fixture["name"], fixture["position"], port)
        protocol = fixture.get("protocol", "rest")
        if protocol != "rest":
            address = json.loads(os.environ["OLFX_LAB_UDP_ADDRESSES"])[fixture["id"]]
            ports = {"wiz": 38899, "lifx": 56700, "govee": 4003}
            entry["Config"] = {"protocol": {"wiz": "Wiz", "lifx": "Lifx", "govee": "Govee"}[protocol],
                "id": fixture["id"], "name": fixture["name"], "ipAddress": address, "port": ports[protocol]}
        assignment = {"Id": fixture["id"], "Position": fixture["position"]}
        if fixture.get("follows"):
            entry["Follows"] = fixture["follows"]
            assignment["Follows"] = fixture["follows"]
        doc["Bulbs"].append(entry)
        doc["Rooms"][0]["Bulbs"].append(assignment)
path = "/config/data/OpenLightFX/rooms.json"
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as out: json.dump(doc, out)
# Emby runs as uid 1000 in the official image. The test setup above runs as root;
# give the plugin data directory back to Emby so room saves can atomically replace rooms.json.
uid, gid = int(os.environ["OLFX_UID"]), int(os.environ["OLFX_GID"])
os.chown(os.path.dirname(path), uid, gid)
os.chown(path, uid, gid)
'
"${COMPOSE[@]}" start emby
# Second pass: the plugin is loaded now, so this also seeds the simulator bulbs.
SETUP_JSON="$(node scripts/fullstack/setup-emby.mjs | tail -n 1)"
read -r API_KEY VIEWER_TOKEN PLUGIN_LOADED ZERO_TICKS < <(printf '%s' "$SETUP_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["apiKey"], d.get("viewerToken") or "-", d.get("pluginLoaded"), d.get("zeroRuntimeTicks") or 0)')
if [[ "$PLUGIN_LOADED" != "True" ]]; then echo "The plugin did not load or rejected the bulb settings"; exit 1; fi
if [[ "$ZERO_TICKS" != "0" ]]; then echo "clip-zero still has an Emby runtime ($ZERO_TICKS ticks)"; exit 1; fi
echo "Plugin loaded and simulator bulbs configured"

if [[ "${OLFX_LAB_START_ONLY:-}" == "1" ]]; then
  umask 077
  printf '%s' "$SETUP_JSON" > "$WORK/session.json"
  echo "Local lab started. Credentials are restricted to $WORK/session.json"
  exit 0
fi
sleep 2
# Follow the simulator for the whole test run so commands sent during tests land in the file.
# docker logs keeps the container's stdout (NDJSON) apart from its stderr (Python log lines),
# and adds none of the ANSI prefixes `docker compose logs` writes.
docker logs -f "$("${COMPOSE[@]}" ps -q simulator)" > "$WORK/simulator.ndjson" 2> "$WORK/simulator.stderr.log" &
SIM_LOG_PID=$!
trap 'kill "$SIM_LOG_PID" 2>/dev/null || true' EXIT
for bulb in left right; do
  curl -fsS "${OLFX_EMBY_URL:-http://127.0.0.1:8096}/OpenLightFX/Bulbs/Test?BulbId=$bulb&api_key=$API_KEY"; echo
done
sleep 1
echo "Simulator saw $(grep -c '"command_received"' "$WORK/simulator.ndjson" || true) command(s) during the bulb smoke test"

export OLFX_EMBY_URL="${OLFX_EMBY_URL:-http://127.0.0.1:8096}"
export OLFX_API_KEY="$API_KEY"
export OLFX_VIEWER_TOKEN="$VIEWER_TOKEN"
export OLFX_NDJSON="$WORK/simulator.ndjson"
# Chromium and Firefox share one Emby, so the projects run one after the other.
# A second Playwright process would otherwise wipe the first project's outcomes.
CHROMIUM_OUTCOMES="$ROOT/test-results/outcomes-fullstack-chromium.jsonl"
FIREFOX_OUTCOMES="$ROOT/test-results/outcomes-fullstack-firefox.jsonl"
export OLFX_OUTCOMES="$CHROMIUM_OUTCOMES"
npx playwright test --project=fullstack
export OLFX_OUTCOMES="$FIREFOX_OUTCOMES"
# Each project expects a fresh library, as the first run does: SAVE-001 writes the
# new track proxy-fixture, which would otherwise already exist from the Chromium pass.
find "$MEDIA" -type d -name lightfx -prune -exec rm -rf {} +
npx playwright test --project=fullstack-firefox
cat "$CHROMIUM_OUTCOMES" "$FIREFOX_OUTCOMES" > "$ROOT/test-results/outcomes-fullstack.jsonl"
echo "Full stack finished. Simulator NDJSON is $WORK/simulator.ndjson"
