# Decisions

Records of product and design choices made while finishing the Skia work, with the measurements behind them.

## 1. Hero scrim behind the Home temperature (chosen: add it)

**Problem.** The Home hero text (location, temperature, condition, feels-like) sits on sky gradients whose
mid-tones cannot reach WCAG 4.5:1 with a text halo alone. The halo audit (`scripts/visual/halo_audit.py`,
30 samples, 120 targets) measured 26 of 120 targets below 4.5:1 with only the halo, worst 2.85:1.

**Decision.** Add a soft scrim behind the hero (`components/CurrentWeather.tsx`, `heroScrimColors`). Its tone is
opposite the ink, as the halo is: a light scrim under dark ink, a dark scrim under light ink. It fades out at
top and bottom so it reads as light on the sky, not as a panel.

**Tuning, measured.**

| Scrim tone (dark ink / light ink) | Worst with halo | Targets below 4.5:1 |
| --- | --- | --- |
| none (halo only, earlier audit) | 2.85:1 | 26 / 120 |
| 0.34 white / 0.30 black | 3.90:1 | 7 / 120 |
| 0.46 white / 0.42 black (shipped) | 4.31:1 | 4 / 120 |
| same, gradient stop moved so the label sits at full strength (shipped) | 4.89:1 | 0 / 120 |

**Why the last four failed.** The scrim's gradient started at 0% opacity at its top edge, and the 17 px
"London" label sat in that fade. Moving the full-strength stop from 22% to 8% of the height fixed it. No
change to the scrim tone was needed for the last step.

**Result.** All 120 targets clear 4.5:1. Worst 4.89:1 with the halo, against 4.82:1 without it.

## 2. Remaining SVG charts (chosen: convert them to the Skia chart set)

**Finding.** No `react-native-svg` import remains in the app. The six files listed as "still SVG" built their
paths as SVG strings and drew them through Skia (`SkiaShapes.tsx`). The real gap was features, not the renderer.

**Decision.** Move all six onto the shared Skia chart code, with animated line draw, gradient fill and dots:

- `TrendChart.tsx` (48-hour trend): `SkiaSeriesChart`, with the wind line dashed and markers every 6 hours.
  Scrub is off because the chart sits in a horizontal scroller, where a pan would fight the scroll.
- `AuroraCard.tsx`, `PastWeekCard.tsx` (sparklines): `SkiaSeriesChart` with markers on the peak or extremes,
  scrub off.
- `HourlyForecast.tsx` (temperature row): `SkiaSeriesChart`, scrub off, because the row aligns to its own columns.
- `GraphExplorer.tsx`: native Skia `Path`s with draw-on and gradient fill. Its existing scrub responder is kept.
- `SunTwilightCard.tsx`: the sun arc draws from sunrise to the current position, and the dot fades in on arrival.
- `RainProbabilityChart.tsx`: a line draw does not suit bars, so the chart keeps its bars and gains a scrub
  cursor: a column highlight and a percentage tag.

`SkiaSeriesChart` gained per-series `dash` and `markers`, a `bandColor`, and a `scrub` toggle. Its gradient
now accepts `rgba()` colours as well as hex.

**Not claimed.** The sparklines and the 48-hour trend are checked in a browser only, not on a device.

## 3. Translation review of storm strings (scope and limits)

- All 14 locales have every storm key. Four keys (`storm_thunder`, `storm_flash`, `storm_hint`,
  `storm_risk`) sit on inline lines, so a naive key count reports them missing. They are present.
- The close-band safety lines (`storm_close_1` to `_6`) were reviewed in all 14 locales. Each carries a shelter
  or stay-inside instruction. No changes were needed.
- The near and far lines were sampled (1 and 6) in all 14 locales. No changes were needed.
- This review was done by the agent, not by native speakers. Ask a native reviewer to confirm before release,
  especially the close-band lines, because they are safety text.
- The non-English singulars for `journal_progress_one` are still unreviewed drafts.

## 4. Liquid glass backdrop (chosen: sample the real sky, keep the gradient as fallback)

**Measured.** `glass_refraction.py` with sky motion off. The snapshot pill and the fallback pill differ by a mean
of 49.8 per channel, while two snapshot captures differ by 0.0. The snapshot matches the real sky: the pill
averages (69,135,172), against (64,144,183), (78,140,175) and (72,143,181) for the sky just above, below and beside
it. The gradient fallback stretches the theme gradient across the pill's own height, so it shows a yellow base
that the sky there does not have. It is kept as the fallback, as requested, but it is an approximation.

The sliding highlight refracts a snapshot of the Home sky canvas. The snapshot is taken every 1.5 s, once under
reduced motion. The gradient shader remains the fallback when no snapshot exists.

## 7. Lint setup and the compiler-era hook rules

`npm run lint` runs Expo's own rules (`eslint-config-expo`, ESLint 9 flat config). The repo had no lint
tooling before this.

The first run reported 187 errors and 365 warnings. Most errors came from the React Compiler-era hook
rules: `react-hooks/refs` (148), `set-state-in-effect` (31), `purity`, `immutability` and `static-components`.
They flag reading and writing refs during render, and setting state from effects after layout. The
animation code here does both on purpose, for worklets and for the first layout measurement. Fixing 187
sites would be a broad refactor of the animation code, so those five rules are kept as **warnings**. They
stay visible and do not fail the lint. Hook-order and other real correctness rules stay errors.

Result: 0 errors. The remaining warnings are `no-unused-vars` (252), `array-type` (78), `import/first` (16),
`import/no-duplicates` (12), `exhaustive-deps` (5). Clearing these is a follow-up, not a blocker.

