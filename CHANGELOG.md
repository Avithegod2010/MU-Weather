# Changelog

All notable changes to MU Weather. The app is keyless and offline-friendly by design — every release keeps that promise.

## [1.4.0] — 2026-10-24

### Added
- **US severe-weather warnings** — official NWS alert cards for US locations with a coverage gate (MeteoAlarm continues to serve Europe), plus an opt-in NWS alert rule and polygon/filter tests.
- **Ukrainian and Russian** — the catalog grows to 16 languages (931 keys each: full translation pass, speech voices, and launcher shortcut labels included).
- **Optional AI digest summaries** — set `EXPO_PUBLIC_AI_API_KEY` (Anthropic or OpenAI) to upgrade the daily spoken digest to a natural-language summary; without a key the built-in template digest is unchanged.
- **Health disclaimer** on the health card ("heuristic estimates only — not medical advice").
- README FAQ section.

### Fixed
- Release tooling: `appVersionSource: local` so the APK reports the real `versionName`/`versionCode` from `app.json` (the previous build silently shipped as 1.3.0/versionCode 1); path sanitization hardening in the shortcuts config plugin; `zod` override to clear the high Dependabot alert.

## [1.3.0] — 2026-10-14

### Added
- **All-GPU rendering** — every chart converted from SVG to Skia; liquid-glass sliders, switches and cards; a condition-driven animated sky behind the hero; sticky section headers.
- **Sky-driven widgets** — all 5 widgets restyled with a shared palette helper and colours that follow the current sky.
- **Rain calibration** — local hourly calibration from your own observations, sample-gated ensemble + feedback calibration, ICON-EPS rain probability overlay, per-model quality controls.
- **Trustworthy alerts** — standalone weather policy engines, alert outcomes recorded with provenance, reliable saved-city cadence, screen-reader improvements.

## [1.2.0] — 2026-10-11

### Added
- **Weekend verdict** — Saturday vs Sunday crowned for outdoor plans (reads the full 16-day forecast, not just the next 24 h).
- **Calendar rain risk** — the next 7 days of calendar events carry their rain chance, timezone-correct for saved cities.
- **Streaks** — dry/wet runs in the past-days view with a same-kind record line.
- **Feels-like cause** — "feels 4° colder than it is — the wind's doing" under the hero.
- **Moon lore** — a folklore line in the moon deep-dive per phase, plus a frost-scrape reminder line.
- **Polish and Turkish** — 14 languages total, launcher shortcut labels localized for all.

### Security
- Exact-origin WebView guard on the radar map.

## [1.1.0] — 2026-10-04

### Added
- **Widgets 4/5** — 4×3 dashboard, multi-city widget with an in-app configuration screen, sun-countdown widget, widget staleness indicator.
- **Notification upgrades** — quiet hours, snooze/dismiss action buttons, per-city cooldown, custom alert builder with notes.
- **Two-city comparison** — per-metric "better" verdicts and a week verdict, plus a metrics tab.
- **Weather journal and comfort model** — rate days, get a tuned "what to wear" line.
- Share card refactor, backup/restore v2 (settings + journal + custom alerts), wind rose.

## [1.0.0] — 2026-09-22

First stable public release.

### Added
- 16-day Open-Meteo forecast with hourly scroller, trend chart with an ensemble P10–P90 band, and day detail.
- Animated RainViewer radar with a pure-JS tile renderer (no Google Maps, no API key).
- Home-screen widgets (2×2, 4×2), Material You dynamic color, spoken forecast, data export (CSV/JSON).
- Alerts: heat/frost/rain/thunder/CAPE + 7 opt-in rules, quiet-aware delivery, alert history, saved-city alerts.
- Insights: accuracy dashboard with per-model leaderboard, best-window, weather-on-this-day, record breakers, year in review.
- 11 languages at launch; backup/restore; sunrise alarm; air-quality, pollen, UV, marine, aurora, climate normals and more.
