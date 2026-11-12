#!/usr/bin/env bash
# Synthetic Studio media. Outputs are gitignored under media/generated.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${OLFX_MEDIA_DIR:-$ROOT/media/generated}"
FONT="${OLFX_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf}"
mkdir -p "$OUT"

if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo "ffmpeg and ffprobe are required" >&2
  exit 1
fi

drawtext="drawtext=fontfile=${FONT}:timecode='00\\:00\\:00\\:00':rate=24:x=24:y=24:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6"

echo "Clip A: 10s 1280x720 H.264 MP4"
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "color=c=black:s=1280x720:r=24:d=2" \
  -f lavfi -i "color=c=red:s=1280x720:r=24:d=2" \
  -f lavfi -i "color=c=green:s=1280x720:r=24:d=2" \
  -f lavfi -i "color=c=blue:s=1280x720:r=24:d=2" \
  -f lavfi -i "color=c=white:s=1280x720:r=24:d=2" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=10" \
  -filter_complex "[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0,format=yuv420p,${drawtext}[v]" \
  -map "[v]" -map 5:a \
  -c:v libx264 -pix_fmt yuv420p -profile:v high -g 12 -keyint_min 12 -sc_threshold 0 \
  -c:a aac -ac 2 -ar 48000 \
  "$OUT/clip-a-h264.mp4"

echo "Center pixels for clip A"
python3 - "$OUT" << 'PY'
import json, subprocess, sys
from pathlib import Path
out = Path(sys.argv[1])
blocks = [(1, "black"), (3, "red"), (5, "green"), (7, "blue"), (9, "white")]
pixels = []
for second, name in blocks:
    raw = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", str(second), "-i", str(out / "clip-a-h264.mp4"),
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ])
    width, height = 1280, 720
    if len(raw) < width * height * 3:
        raise SystemExit(f"short frame at {second}s: {len(raw)} bytes")
    x, y = width // 2, height // 2
    i = (y * width + x) * 3
    pixels.append({"name": name, "timeSec": second, "r": raw[i], "g": raw[i+1], "b": raw[i+2]})
(out / "clip-a-center-pixels.json").write_text(json.dumps({"width": width, "height": height, "pixels": pixels}, indent=2) + "\n")
print(pixels)
PY

node "$ROOT/scripts/media/pgs.mjs" 320 240 "$OUT/clip-b.sup"
node "$ROOT/scripts/media/pgs.mjs" 3840 2160 "$OUT/clip-4k.sup"

hdr_meta="hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50):max-cll=1000,400"

echo "Clip B: 5s 320x240 HEVC 10-bit HDR10 MKV, TrueHD, PGS"
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "color=c=red:s=320x240:r=24:d=5,format=yuv420p10le" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=5" \
  -i "$OUT/clip-b.sup" \
  -map 0:v -map 1:a -map 2:s \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le \
  -x265-params "keyint=12:min-keyint=12:scenecut=0:${hdr_meta}" \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc \
  -c:a truehd -strict experimental \
  -c:s copy \
  "$OUT/clip-b-hevc-hdr.mkv"

echo "Clip 4K: 2s 3840x2160 HEVC HDR10 MKV, TrueHD, PGS"
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "smptehdbars=size=3840x2160:rate=24,format=yuv420p10le,trim=duration=2" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=2" \
  -i "$OUT/clip-4k.sup" \
  -map 0:v -map 1:a -map 2:s \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le \
  -x265-params "keyint=24:min-keyint=24:scenecut=0:${hdr_meta}" \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc \
  -c:a truehd -strict experimental \
  -c:s copy \
  "$OUT/clip-4k-hevc-hdr10.mkv"

python3 - "$OUT" << 'PY'
import json, subprocess, sys
from pathlib import Path
out = Path(sys.argv[1])

def probe(name):
    raw = subprocess.check_output([
        "ffprobe", "-hide_banner", "-loglevel", "error",
        "-show_streams", "-show_format", "-of", "json", str(out / name),
    ])
    return json.loads(raw)

def require(cond, message):
    if not cond:
        raise SystemExit(message)

a = probe("clip-a-h264.mp4")
v = next(s for s in a["streams"] if s["codec_type"] == "video")
au = next(s for s in a["streams"] if s["codec_type"] == "audio")
require(v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p", "clip A video")
require(v["width"] == 1280 and v["height"] == 720, "clip A size")
require(au["codec_name"] == "aac" and au["channels"] == 2, "clip A audio")

for name, width, height in (
    ("clip-b-hevc-hdr.mkv", 320, 240),
    ("clip-4k-hevc-hdr10.mkv", 3840, 2160),
):
    info = probe(name)
    kinds = {s["codec_type"]: s for s in info["streams"]}
    require(set(kinds) >= {"video", "audio", "subtitle"}, f"{name} streams {list(kinds)}")
    require(kinds["video"]["codec_name"] == "hevc", name)
    require(kinds["video"]["width"] == width and kinds["video"]["height"] == height, name)
    require(kinds["video"].get("pix_fmt") == "yuv420p10le", f"{name} bit depth")
    require(kinds["video"].get("color_transfer") == "smpte2084", f"{name} transfer")
    require(kinds["video"].get("color_primaries") == "bt2020", f"{name} primaries")
    require(kinds["audio"]["codec_name"] == "truehd", f"{name} audio")
    require(kinds["subtitle"]["codec_name"] == "hdmv_pgs_subtitle", f"{name} pgs")

print("ffprobe ok")
PY

echo "Wrote clips to $OUT"
