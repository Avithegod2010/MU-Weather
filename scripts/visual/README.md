# Visual probes

Browser probes for the Skia sky, charts and contrast work. Output lives here, not in /tmp.

- `fixtures.py`: generates Open-Meteo style forecast and air-quality fixtures for each condition.
- `capture.py`: Playwright harness. `shots` writes screenshots; `frames` measures uncapped frame times per scenario.
  Run with `CHROMIUM_NO_ZYGOTE=1` (single-process mode crashes with TargetClosedError).
- `contrast-audit.ts`: checks text colours for 10 weather bases × 2 styles × 6 backgrounds × 10 colour themes
  (7200 cases, WCAG 4.5:1). Compile with `npx tsc --ignoreConfig --outDir /tmp/contrast-build --module commonjs --target es2019 --strict --skipLibCheck --esModuleInterop scripts/visual/contrast-audit.ts`, then run the emitted JS.
- `results/frames-before.json`: SVG sky baseline (software-rendered headless Chromium, 4 s uncapped).
- `results/frames-after.json`: Skia sky, same settings, on the export built before the chart, sun and contrast changes.

Caveats: these numbers come from software rendering (SwiftShader), not a device. Skia was slower in this
environment, so no performance improvement is claimed. The `pageErrors: 1` entry is the init-script
`localStorage` SecurityError on about:blank frames. It appears in both runs.

## Added since the first pass

- `detail_shots.py`: screenshots of what `capture.py shots` cannot reach: the converted charts on Home
  (Rain Probability, Hourly Forecast, 48-Hour Trend, Moon), the day detail temperature and rain curves, and
  the storm ring in its counting state. Run with `--condition thunder --night` for the storm card.
  Output: `results/detail/` and `results/detail-storm/`.
- `parse_gfxinfo.py`: frame-time summary from `adb shell dumpsys gfxinfo <pkg> framestats`. Tested on
  synthetic framestats only. The real mid-range Android trace is still to be captured on a device.
- `results/contrast-audit.txt`: latest audit run. Card and chip text has 0 failing cases out of 7200.
  Sky text (the Home hero) still fails 3408 cases without its text halo. The audit does not measure the halo.

## Refinement pass

- `halo_audit.py`: measures the Home hero text halo from pixels (30 samples, 120 text targets).
  Result in `results/halo-audit.json`. Worst halo reading 2.85:1 (no-halo baseline 1.90:1). 26 of 120
  targets are still below 4.5:1, mostly on the Sunset and Aurora backgrounds. A single text shadow cannot
  reach 4.5:1 on mid-tone skies. Closing that gap needs a scrim, which has not been chosen.
- `frames-before-optimise.json` / `frames-after-glow-cache.json`: the sun glow is cached as an offscreen
  image. Clear-day mean frame time 22.7 ms to 13.9 ms, clear-night 21.6 ms to 13.7 ms, in software Chromium.
  Single runs. Still slower than the SVG sky on web (6.0 ms clear-day), and no device measurement.

## Completion pass

- `results/halo-audit.json`: now measured with the hero scrim (see `DECISIONS.md`). Worst halo 4.31:1,
  4 of 120 targets still below 4.5:1, all the 17 px "London" label on Sunset and Ocean skies.
- `results/frames-after-charts.json`: frame times on the build with the converted charts. Clear-day mean 14.41 ms
  (glow-cache run: 13.93 ms), within run-to-run noise. Software Chromium only, not a device. This replaces the
  lost `/tmp/vout/frames-after.json`, which no longer existed.
- Page errors: each frames scenario logs one pageerror. In the glass probe it is
  `ExpoNotifications.getLastNotificationResponse is not available on web`, a pre-existing web-only call from the
  notifications code, not the sky or the charts.
- `results/detail/` and `results/detail-storm/`: regenerated on the new build. All 12 steps captured in both sets,
  including the storm flash tap. The earlier flash-click timeout came from the older build.
- `glass_check.py`: loads Home in glass style, records page errors and a screenshot in `results/glass/`.
- Android frame times: not measured here. No device run happened in this environment.

## Open-list pass (this session)

- Journal singulars (`journal_progress_one`): all 14 locales reviewed. Bengali, Hindi, Hungarian, Indonesian and
  Turkish keep one wording for one and many, which is correct for those languages. The rest agree with the count.
- `glass_refraction.py`: 2x close-ups of the glass pill at rest and after moving to "Hot", in `results/glass/`.
  The pill renders with the tint and the specular rim. The refraction is now measured: see the refraction results below.
- The journal pill is correctly absent when today has no rating (`activeIndex` is -1). The probe seeds a rating.
- `Sliding.tsx`: the first selection measurement now runs 400 ms after mount instead of being skipped. Verified
  with a rated day at launch: the pill appears at rest at the right size.
- `capture.py`: `open_page` takes a `scale` argument for the 2x close-ups.
- Android frame times: still not measured. No device or `adb` is available in this environment.

## Glass refraction and halo, final

- `glass_refraction.py` (sky motion off): the snapshot pill and the gradient fallback differ by a mean of 49.8 per
  channel. Two snapshot captures differ by 0.0. The snapshot matches the real sky: the pill averages
  (69,135,172) against (64,144,183), (78,140,175) and (72,143,181) for the sky just outside it. The fallback is
  an approximation and shows a yellow base the sky does not have. Output: `results/glass/refraction.json`,
  `refraction-compare.png`.
- `halo-audit.json`: all 120 hero targets now clear 4.5:1 with the halo. Worst 4.89:1. The last four failed because
  the scrim's gradient was still fading at the label; moving the full-strength stop to 8% of the height fixed it.
- `debug hook`: `window.__MU_DISABLE_SKY_BACKDROP = true` forces the gradient fallback. Off in normal use; used only
  by `glass_refraction.py`.
- `sun-twilight-card.png`: the title and labels wrap in full, nothing truncated. The arc is empty at night, as expected.
- Storm copy: all near and far lines reviewed in all 14 locales, no changes needed. A native speaker should still
  confirm the close-band safety lines.
