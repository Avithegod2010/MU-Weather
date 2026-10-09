# Android Perfetto baseline workflow

This workflow collects **device-specific evidence**; it contains no measured baselines. No physical Android device/ADB trace was available when this template was added. Keep every result blank or marked pending until it is read from a real trace.

## Device tiers

Use three physical devices from the supported/test cohort and record their actual model, RAM, SoC, Android version, screen refresh rate, and build. Assign tiers relative to the cohort, not by an undocumented brand/price assumption:

- **Entry:** lowest-capability supported device in the cohort.
- **Mid:** representative mainstream device (ideally near the cohort median).
- **High:** representative higher-capability supported device.

Keep the same physical device assigned to a tier between baseline and later comparisons. A tier label alone is not a hardware specification.

## Repeatable capture

1. Install the same app commit/build type on the selected device. Use a physical device and a development/profiling build when validating `MUWeather:` JS trace markers. Record app version, build type, Android version, network, and location/scenario. A development trace is not evidence of production performance.
2. Enable USB debugging and confirm `adb devices -l` shows exactly one authorized device, or pass `--serial`. Keep the device awake, use the same orientation/brightness/power mode, and let it cool to a comparable thermal state. Do not run another benchmark or screen recording at the same time.
3. For each tier and each scenario below, collect at least **three separate runs**. Use the same city, location permission, cache state, connectivity, and scenario duration for comparisons. Record airplane/offline/cache behavior when that is specifically the scenario. Do not combine cold launch and warm refresh in one result group.
4. From the repository root, run:

   ```sh
   scripts/perfetto/capture-android.sh \
     --tier entry \
     --scenario "warm weather refresh" \
     --build profile \
     --network "Wi-Fi, stable"
   ```

   Use `--tier mid` or `--tier high` for the other cohort devices. Add `--serial DEVICE_SERIAL` when more than one device is connected. The script records device/build metadata and writes a 30-second `.pftrace` plus a `.md` run sheet under `perfetto-captures/`, which is ignored by Git. During the capture, perform only the named scenario on the physical device. The script does not launch the app, select a city, or invent result values.
5. Open the trace in Perfetto. Confirm the app process and search its timeline for `MUWeather:`. The markers are conditional on React Native trace support being active; a system trace does not guarantee that they will appear. If absent, note “markers unavailable” and do not report zero-duration spans. On devices where command-line Perfetto or a data source is unsupported, use Android Studio Profiler/System Trace, export the trace, and complete the same metadata template.
6. Fill the matching row in `device-tier-template.csv` and the run sheet. Preserve the raw `.pftrace` locally with its metadata; check for unrelated personal/device data before sharing. Compare only matching scenario/build/network/cache conditions.

### Minimum scenario set

- **Cold launch, saved snapshot:** force-stop before capture; launch the app and note whether the saved weather snapshot appears before the network refresh completes.
- **Warm weather refresh:** start from a loaded forecast and trigger one pull-to-refresh; do not change city or screen mid-run.
- **Ensemble refresh:** use a loaded forecast, then capture the refresh that obtains or replaces ensemble data. Record cache/freshness state so a cache hit is not mislabeled as a network fetch.

## Read the right track

| Measurement | Source | Interpretation / limit |
| --- | --- | --- |
| `MUWeather:open-meteo.fetch-weather` | Async app span | End-to-end weather bundle operation, including network wait and response mapping; not CPU-only time. |
| `MUWeather:open-meteo.fetch-ensemble` | Async app span | End-to-end ensemble request/mapping latency. |
| `MUWeather:app.weather-cache-read` | Async app span | Cache read/validation. |
| `MUWeather:app.weather-post-fetch-side-effects` | Async parent span | Overall non-blocking persistence/log/widget work. Its child spans overlap and run concurrently; do not sum them as sequential latency. |
| `MUWeather:app.weather-accept-response` | Sync JS span | JS acceptance/bookkeeping and state-setter calls only; it does not measure React render/commit, layout, or drawing. |
| JS thread occupancy | Perfetto thread scheduling/CPU tracks | Use scheduling state and CPU tracks to investigate work; a wall-span duration alone does not prove the JS thread was busy for the whole span. |
| Jank / presented-frame timing | Android FrameTimeline where supported | Report track and Android version; distinguish it from app span duration. |

Do not call an uncapped browser `requestAnimationFrame` callback interval “displayed FPS.” It is not a proxy for Android performance, Android FrameTimeline, or Skia draw time. These are separate measurements and require their own source/units.

## Summary convention

For each scenario/device/build, retain all run values and report the number of valid runs plus a stated statistic (for example, median and p95). Mark unavailable tracks as unavailable, not zero. Establish this real-device baseline before setting performance targets. Do not claim a measured device-tier baseline until the trace files have actually been captured and reviewed.
