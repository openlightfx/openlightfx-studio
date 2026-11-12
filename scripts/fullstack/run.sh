#!/usr/bin/env bash
# Local full stack: Emby + plugin (studio host API branch) + headless simulator.
# CI validates the compose file. The live run needs Docker, the .NET 8 SDK,
# and read access to the private openlightfx-simulator repository.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.fullstack.yml)
EMBY_BRANCH="${OLFX_EMBY_BRANCH:-cursor/studio-host-api-18c1}"
SIM_URL="${OLFX_SIMULATOR_URL:-https://github.com/openlightfx/openlightfx-simulator.git}"
WORK="${OLFX_STACK_DIR:-$ROOT/.emby-stack}"

if ! command -v docker >/dev/null; then
  echo "Docker is not installed. The full stack is scripts/fullstack/run.sh on a machine with Docker."
  if [[ "${OLFX_FULLSTACK_REQUIRE:-}" == "1" ]]; then exit 1; fi
  exit 0
fi

echo "Validating compose file"
"${COMPOSE[@]}" config >/dev/null

if [[ "${OLFX_FULLSTACK_CONFIG_ONLY:-}" == "1" ]]; then
  echo "Compose file is valid. Set OLFX_FULLSTACK_CONFIG_ONLY empty to boot the stack."
  exit 0
fi

if ! command -v dotnet >/dev/null; then
  echo "The .NET 8 SDK is required to build the plugin. See docs/testing.md."
  if [[ "${OLFX_FULLSTACK_REQUIRE:-}" == "1" ]]; then exit 1; fi
  exit 0
fi

mkdir -p "$WORK" docker/simulator-src
if [[ ! -f docker/simulator-src/src/openlightfx_simulator/__main__.py ]]; then
  echo "Cloning openlightfx-simulator"
  if ! git clone --depth 1 "$SIM_URL" docker/simulator-src; then
    echo "Could not clone $SIM_URL. The simulator repository is private."
    echo "Clone it into docker/simulator-src and rerun, or export a credential that can read it."
    if [[ "${OLFX_FULLSTACK_REQUIRE:-}" == "1" ]]; then exit 1; fi
    exit 0
  fi
fi

bash scripts/media/generate-clips.sh
npm run build
( cd build && rm -f "$WORK/studio.zip" && zip -qr "$WORK/studio.zip" . )

echo "Starting Emby"
"${COMPOSE[@]}" up -d emby
eval "$(node scripts/fullstack/setup-emby.mjs | tail -n 1 | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f"API_KEY={d[\"apiKey\"]}")')"
echo "Emby API key acquired"

mkdir -p "$WORK/emby/lib"
for dll in MediaBrowser.Common.dll MediaBrowser.Controller.dll MediaBrowser.Model.dll Emby.Web.GenericEdit.dll; do
  if [[ ! -f "$WORK/emby/lib/$dll" ]]; then
    docker compose -f docker-compose.fullstack.yml cp "emby:/system/$dll" "$WORK/emby/lib/$dll"
  fi
done

if [[ ! -d "$WORK/emby/src" ]]; then
  git clone --depth 1 --branch "$EMBY_BRANCH" https://github.com/openlightfx/openlightfx-emby.git "$WORK/emby/src"
fi
cp -a "$WORK/emby/lib/." "$WORK/emby/src/lib/"
mkdir -p "$WORK/emby/src/src/OpenLightFX.Emby/obj/studio-dist"
cp "$WORK/studio.zip" "$WORK/emby/src/src/OpenLightFX.Emby/obj/studio-dist/openlightfx-studio-dist.zip"
printf 'phase1' > "$WORK/emby/src/src/OpenLightFX.Emby/obj/studio-dist/openlightfx-studio-dist.zip.version"
( cd "$WORK/emby/src/src/OpenLightFX.Emby" && dotnet build -c Release -p:StudioVersion=phase1 )
DLL="$WORK/emby/src/src/OpenLightFX.Emby/bin/Release/net8.0/OpenLightFX.Emby.dll"
( cd "$WORK/emby/src" && dotnet tool restore && dotnet ilrepack \
  /lib:"$WORK/emby/src/lib" \
  /out:"$DLL.merged" \
  "$DLL" \
  "$WORK/emby/src/src/OpenLightFX.Emby/bin/Release/net8.0/Google.Protobuf.dll" )
mv "$DLL.merged" "$DLL"
docker compose -f docker-compose.fullstack.yml cp "$DLL" emby:/config/plugins/OpenLightFX.Emby.dll
"${COMPOSE[@]}" restart emby
node scripts/fullstack/setup-emby.mjs >/dev/null

echo "Starting the simulator"
"${COMPOSE[@]}" up -d --build simulator
sleep 2
"${COMPOSE[@]}" logs simulator > "$WORK/simulator.ndjson" || true

export OLFX_EMBY_URL="${OLFX_EMBY_URL:-http://127.0.0.1:8096}"
export OLFX_API_KEY="$API_KEY"
export OLFX_NDJSON="$WORK/simulator.ndjson"
export OLFX_OUTCOMES="${OLFX_OUTCOMES:-$ROOT/test-results/outcomes-fullstack.jsonl}"
npx playwright test --project=fullstack
echo "Full stack finished. Simulator NDJSON is $WORK/simulator.ndjson"
