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

Cleanup pass: 250 unused import specifiers removed, `array-type` and `import/first` fixed by `eslint --fix`,
one unused `useMemo` (`moonTimesToday`, never read) and one unused constant removed. Two deliberate lazy
`require` calls carry a disable comment with the reason. Then the five `exhaustive-deps` warnings were resolved. `useWeatherTheme` now lists its three real
dependencies. Four others are kept on purpose and carry a disable comment with the reason: `useRainOngoing`
(data is a refresh trigger), `useCityComparison` (`cityKey` is the stable identity, so re-picking the same
pair does not refetch), and the two sliding effects, which drive shared values.
Result: **0 errors, 188 warnings**, all from the five deferred compiler-era hook rules. Those are the follow-up. The smoke run after the cleanup still
passes the journal probe in both styles.

## 8. Hourly ICON-EPS rain calibration (collection and scoring)

- Log one latest **raw** ensemble wet-member share for each future local forecast hour and rounded location.
  Re-fetches replace only unverified rows; once an observation is attached, that forecast/outcome pair is
  immutable. Each row retains the app retrieval time and lead hours. The API does not expose its model-cycle
  initialization time, so `issuedAt` means client retrieval time, not a claimed model run time.
- Keep the data on-device in AsyncStorage only: coordinates are rounded to 0.01 degrees, the log holds at most
  30 days per location, and at most eight locations. No upload, backup, or data-export path was added.
- After a 72-hour archive lag, match local ISO hours to hourly Archive API precipitation. Missing archive values
  remain unverified (never treated as dry); attempts are throttled to once per location per six hours.
  A wet observation uses the same 0.1 mm hourly threshold as the ensemble member share. These are archive-relative
  reference values, not station-confirmed ground truth, so the score is not presented as an independent verification.
- Withhold Brier and reliability results until there are at least 100 verified hourly cases over 14 distinct
  local dates. Reliability bins are shown only with at least 20 cases each. The logged unit is an hourly forecast
  case; multiple hours on one date are correlated, so the counts are not independent samples or a confidence
  interval. No daily rain probability is derived by multiplying hourly dry probabilities. A supported reliability
  bin can provide an empirical probability correction, but this pass does not apply a correction to live chart
  values; the displayed score describes raw ICON-EPS probabilities.
- The Home rain chart's hourly bars remain the primary-provider series; direct complete-day ICON-EPS event
  probabilities are shown separately with member counts. Calibration summaries are explicitly labeled ICON-EPS
  and do not imply that the blue hourly bars are calibrated. The handoff-described ensemble-dot overlay is not
  present in this checkout.
- Rain-method and forecast-exposure strings are present in all 14 locale dictionaries. Automated checks cover
  keys/placeholders only; native-speaker translation review has not been performed.
