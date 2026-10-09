#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="$ROOT_DIR/scripts/perfetto/trace-config.pbtxt"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/perfetto-captures}"
APP_ID="com.avithegod.muweather"
SERIAL=""
TIER=""
SCENARIO=""
BUILD_TYPE=""
NETWORK=""

usage() {
  cat <<'EOF'
Usage: scripts/perfetto/capture-android.sh \
  --tier entry|mid|high \
  --scenario "cold launch" \
  --build dev|profile|release \
  --network "Wi-Fi, stable" \
  [--serial DEVICE_SERIAL]

The script captures one 30-second Perfetto trace and writes a .pftrace plus a
metadata .md file under perfetto-captures/ (ignored by Git). It does not launch
the app or infer performance values. Start/perform the stated scenario on the
physical device while the trace is running.
EOF
}

while (($#)); do
  case "$1" in
    --serial) SERIAL="${2:?Missing value for --serial}"; shift 2 ;;
    --tier) TIER="${2:?Missing value for --tier}"; shift 2 ;;
    --scenario) SCENARIO="${2:?Missing value for --scenario}"; shift 2 ;;
    --build) BUILD_TYPE="${2:?Missing value for --build}"; shift 2 ;;
    --network) NETWORK="${2:?Missing value for --network}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$TIER" && -n "$SCENARIO" && -n "$BUILD_TYPE" && -n "$NETWORK" ]] || {
  echo "--tier, --scenario, --build, and --network are required." >&2
  usage >&2
  exit 2
}
case "$TIER" in entry|mid|high) ;; *) echo "Tier must be entry, mid, or high." >&2; exit 2 ;; esac
case "$BUILD_TYPE" in dev|profile|release) ;; *) echo "Build must be dev, profile, or release." >&2; exit 2 ;; esac
command -v adb >/dev/null || { echo "adb is required on the capture workstation." >&2; exit 1; }
[[ -f "$CONFIG_FILE" ]] || { echo "Missing Perfetto config: $CONFIG_FILE" >&2; exit 1; }

if [[ -z "$SERIAL" ]]; then
  mapfile -t ONLINE_DEVICES < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  if ((${#ONLINE_DEVICES[@]} != 1)); then
    echo "Connect exactly one authorized Android device, or pass --serial." >&2
    adb devices -l >&2
    exit 1
  fi
  SERIAL="${ONLINE_DEVICES[0]}"
fi
ADB=(adb -s "$SERIAL")
run_adb() { "${ADB[@]}" "$@"; }
[[ "$(run_adb get-state)" == "device" ]] || { echo "Selected device is not ready." >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SCENARIO_SLUG="$(printf '%s' "$SCENARIO" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')"
BASE="${STAMP}-${TIER}-${SCENARIO_SLUG:-scenario}"
mkdir -p "$OUT_DIR"
TRACE_LOCAL="$OUT_DIR/$BASE.pftrace"
META_LOCAL="$OUT_DIR/$BASE.md"
TRACE_REMOTE="/data/misc/perfetto-traces/$BASE.pftrace"
CONFIG_REMOTE="/data/local/tmp/$BASE.pbtxt"

cleanup() {
  run_adb shell rm -f "$CONFIG_REMOTE" "$TRACE_REMOTE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
run_adb push "$CONFIG_FILE" "$CONFIG_REMOTE" >/dev/null

echo "Starting 30-second Perfetto capture on tier '$TIER'. Perform scenario: $SCENARIO"
echo "Trace output: $TRACE_LOCAL"
run_adb shell perfetto --txt -c "$CONFIG_REMOTE" -o "$TRACE_REMOTE"
run_adb pull "$TRACE_REMOTE" "$TRACE_LOCAL" >/dev/null

getprop() {
  local value
  value="$(run_adb shell getprop "$1" 2>/dev/null | tr -d '\r' || true)"
  printf '%s' "${value:-unknown}"
}
MODEL="$(getprop ro.product.model)"
DEVICE="$(getprop ro.product.device)"
ANDROID_RELEASE="$(getprop ro.build.version.release)"
ANDROID_SDK="$(getprop ro.build.version.sdk)"
SOC="$(getprop ro.soc.model)"
[[ "$SOC" == "unknown" ]] && SOC="$(getprop ro.hardware)"
MEMORY="$(run_adb shell awk '/MemTotal:/ { printf "%.1f GiB", $2 / 1048576 }' /proc/meminfo 2>/dev/null | tr -d '\r' || true)"
APP_VERSION="$(run_adb shell dumpsys package "$APP_ID" 2>/dev/null | sed -n 's/^[[:space:]]*versionName=//p' | head -n 1 | tr -d '\r' || true)"
APP_VERSION="${APP_VERSION:-unknown}"
APP_COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [[ -z "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  TREE_STATE="clean"
else
  TREE_STATE="dirty"
fi

cat > "$META_LOCAL" <<EOF
# Perfetto capture metadata

- UTC capture label: $STAMP
- Tier label (assigned by tester): $TIER
- Scenario: $SCENARIO
- Device model / product: $MODEL / $DEVICE
- RAM reported by Android: ${MEMORY:-record manually}
- SoC: $SOC
- Android release / SDK: $ANDROID_RELEASE / $ANDROID_SDK
- App package / installed version: $APP_ID / $APP_VERSION
- Build type supplied by tester: $BUILD_TYPE
- Network supplied by tester: $NETWORK
- Source commit: $APP_COMMIT ($TREE_STATE working tree)
- Trace: $(basename "$TRACE_LOCAL")
- Device display refresh rate: record from device settings / profiler
- Perfetto marker check: search for MUWeather: in the app-process timeline
- Raw trace inspected by / date: pending

## Measurements

Do not fill a metric from a different track or infer one from another. Use the reporting definitions in scripts/perfetto/README.md.

| Metric | Value | Track / source |
| --- | --- | --- |
| Weather fetch span wall duration (ms) | pending | `MUWeather:open-meteo.fetch-weather` |
| Ensemble fetch span wall duration (ms) | pending | `MUWeather:open-meteo.fetch-ensemble` |
| Cache read span (ms) | pending | `MUWeather:app.weather-cache-read` |
| Post-fetch side-effect span (ms) | pending | `MUWeather:app.weather-post-fetch-side-effects` |
| JS-thread scheduled/running observations | pending | Perfetto thread tracks |
| FrameTimeline jank / presented-frame observations | pending | Android FrameTimeline |
| Displayed FPS | not inferred | Requires an explicitly defined presented-frame measurement |
| Skia draw time | not inferred | Not supplied by the JS spans |
EOF

printf '\nCapture complete. Review the trace in Perfetto and fill in the metadata only from the indicated tracks.\n'
