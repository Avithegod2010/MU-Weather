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
