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
