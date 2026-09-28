<div align="center">

# 🌤️ MU Weather

**Material You Weather** — a free, open-source, offline-friendly Android weather app
built with React Native & Expo.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android-3DDC84.svg?logo=android&logoColor=white)](#-getting-started)
[![Expo SDK](https://img.shields.io/badge/Expo_SDK-57-000020.svg?logo=expo&logoColor=white)](https://docs.expo.dev/versions/v57.0.0/)
[![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB.svg?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Languages](https://img.shields.io/badge/languages-11-8A2BE2.svg)](#-languages)
[![API keys](https://img.shields.io/badge/API_keys-none-success.svg)](#-data-sources--attribution)
[![Release](https://img.shields.io/badge/release-v1.0-brightgreen.svg)](https://github.com/Avithegod2010/MU-Weather/releases/tag/v1.0)

<sub>No accounts · No analytics · No tracking · No API keys · All your data stays on your device</sub>

</div>

---

## 🧠 Why “MU”?

**MU** stands for **Material You** — Android's design language, and the idea the whole app is built around.

| Material You idea | How MU Weather delivers it |
| --- | --- |
| Colour that adapts to *you* | A dedicated **Material You** theme (Android 12+) reads the system palette — derived from your wallpaper — and recolours the app, its **home-screen widgets** and its notification surfaces |
| Rounded, tactile surfaces | Card-based layout, soft radii, layered gradients, and an optional glass style |
| Personal expression | 10 colour themes · light / dark / system · comfortable & compact density · 3 icon styles · 4 tile-transition animations · 6 home backgrounds |
| Feel like part of Android | Home-screen widgets, app shortcuts, notification actions, spoken readouts, calendar rows |

---

## 📑 Contents

- [Features](#-features) · [Tech stack](#-tech-stack) · [Project structure](#-project-structure)
- [Getting started](#-getting-started) · [Building an APK](#-building-an-apk)
- [Data sources & attribution](#-data-sources--attribution) · [Privacy & permissions](#-privacy--permissions)
- [Languages](#-languages) · [Roadmap](#-roadmap) · [Contributing](#-contributing) · [License](#-license)

---

## ✨ Features

### 🌡️ Forecast & conditions

- **Live conditions** — temperature, feels-like, condition, wind, humidity and pressure with animated weather icons
- **Hourly strip** — tap any hour for an inline panel (condition, temp, feels-like, rain chance & amount, wind/gusts/direction, humidity, dew point, pressure, UV, visibility)
- **16-day forecast** — tap any day for a full breakdown: 24-hour temperature curve, rain-probability curve, sunrise/sunset, UV max & band, precipitation total, rain hours and max wind
- **Trend charts** — 48-hour trends for temperature, rain probability, pressure and more
- **Minute-level nowcast** — rain bands arriving, easing or passing, with plain-language headlines
- **Graph explorer** — pick any metric (temperature, feels-like, rain chance, precipitation, wind, gusts, direction, pressure, humidity, UV, visibility, CAPE) × any range (24 h / 7 days / past 30 days) with a **scrubbing crosshair** that reads out values as you drag

### 🌫️ Air, sky & space

- **Air quality** — US EPA **and** European EEA scales with a one-tap toggle, 24-hour AQI curve, **next-5-day peak forecast**, and PM2.5 / PM10 / O₃ / NO₂ / SO₂ breakdown
- **Pollen** — 6-species pollen levels and a worst-species deep dive (Europe only — CAMS coverage)
- **Aurora** — Kp now, Kp forecast, visibility chance for your latitude, **live solar wind speed and Bz**, and a **Kp last-24-hours sparkline**. Auto-hides below ~45° latitude
- **Storm index** — CAPE storm-building row with peak hour, plus a **storm distance meter** that times the gap between lightning and thunder
- **Sun & moon** — moon phase disc with full/new countdown, illumination and cycle day; golden-hour windows
- **Best time outdoors** — a scored 2-hour window from rain, wind, UV and apparent temperature
- **What to wear** — a one-line, unit-aware suggestion under the hero
- **Health indices** — migraine, respiratory and flu risk estimated from pressure trend, AQI and humidity *(heuristic, not medical advice)*

### 🔔 Alerts that actually reach you

- **17 opt-in alert rules** — rain, thunderstorm, frost, heat, high UV, strong wind, CAPE storm building, rapid pressure drop, pollen, air quality, aurora, fog, black ice, cold snap, rapid temperature drop, stargazing and rain easing
- **Saved-city alerts** — the same rules can run for your saved cities, so a notification can say *“Rain starting in Paris in 40 min”* while you are somewhere else (rotating sweep, per-city cooldowns, your language)
- **Alert history** — the last 20 delivered alerts with severity, city and local time, on the Alerts screen
- **Spoken forecast** — the app reads your forecast aloud in the app language; the daily digest notification carries a **“Read my forecast”** action
- **Background checks** — the weather, widgets, digest and alerts refresh even while the app is closed

### 📊 History, climate & accuracy

- **30-day history** — archive-based actuals vs. the forecasts the app logged itself, with a 7/30-day toggle, a temperature-range sparkline, rain totals and variability stats
- **Weather on this day** — what actually happened on today's date over the past 10 years
- **Climate normals** — “what's normal here” for every month of the year, from the ERA5 archive, with a delta against today's forecast
- **Forecast accuracy** — the app scores its own past predictions and shows the average miss
- **Model leaderboard** — ranks ECMWF, GFS, ICON, Météo-France, JMA and MET Nordic by hit rate and mean error over the last 30 days, scored per city
- **Official warnings** — MeteoAlarm CAP feeds for European countries, with severity colour, description and expiry time

### 🗺️ Radar & maps

- **Animated rain radar** — the last two hours of RainViewer frames with play/pause, a scrubbable timeline, pan, zoom and recenter
- **No map SDK, no API key** — the radar draws its own Web-Mercator raster tiles (RainViewer radar over a CARTO dark base) on plain `Image` components, so there is no Google Maps dependency, no key and no billing account
- **Layer maps** — precipitation, temperature, wind, cloud and more, plus warning overlays

### 🛠️ Tools & planning

- **Trip planner** — pick a saved city, a start date and a trip length for a day-by-day outlook with a *“2 of 5 days look wet”* verdict
- **Calendar integration** — upcoming events with their forecast
- **Saved cities** — favourites with live conditions, one tap away
- **Settings backup & restore** — export and import your settings as JSON
- **Data export** — CSV and JSON export of the app's own forecast log
- **Deep dives** — dedicated screens for wind, air quality, UV, humidity, visibility, pressure, precipitation, moon, pollen, day detail and the graph explorer

### 🎨 Customisation & platform

- **10 colour themes**, including AMOLED black and **Material You** (wallpaper-derived, Android 12+)
- **Style** — material or glass · **Density** — comfortable or compact
- **Icon styles** — outline, filled or colourful
- **Tile animations** — fade, slide, zoom or push, plus per-section visibility under *Adjust tiles*
- **Home backgrounds** — dynamic weather, aurora, sunset, ocean, midnight, forest
- **Home-screen widgets** — 2×2 and 4×2 (with hourly strips), 30-minute background refresh, themed like the app
- **App shortcuts** — `muweather://radar` · `muweather://search` · `muweather://favorites`
- **Accessibility** — TalkBack labels throughout, reduced-motion support, font-fitting for long translated labels
- **Offline-friendly** — the last snapshot, caches and history live on the device and are served without a connection

## 🌍 Languages

| Language | Code | Language | Code |
| --- | --- | --- | --- |
| English | `en` | Ελληνικά (Greek) | `el` |
| हिन्दी (Hindi) | `hi` | Magyar (Hungarian) | `hu` |
| বাংলা (Bengali) | `bn` | Bahasa Indonesia | `id` |
| Español (Spanish) | `es` | Italiano (Italian) | `it` |
| Français (French) | `fr` | Nederlands (Dutch) | `nl` |
| Deutsch (German) | `de` | | |

Translations are **strictly typed against the English catalog** (`i18n/en.ts`), so missing keys fail the TypeScript build instead of silently rendering raw key names. Adding a language = one new file + one entry in `utils/i18n.ts`.

## 🧱 Tech stack

| Layer | Choice |
| --- | --- |
| Framework | [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) · React Native 0.86 (Hermes) · React 19 |
| Language | TypeScript in **strict** mode — no `any` in app code |
| UI | Hand-built themed components · `react-native-svg` charts · `react-native-reanimated` motion · `lucide-react-native` icons · Outfit font |
| Radar & maps | Custom Web-Mercator tile renderer — **no map SDK** |
| Widgets | `react-native-android-widget` (2×2 and 4×2) |
| Theming | 10 themes, including `react-native-material-you-colors` for the Android 12+ wallpaper palette |
| Storage | `@react-native-async-storage/async-storage` — settings, snapshot caches, forecast logs, alert history |
| Platform APIs | `expo-location` · `expo-notifications` · `expo-background-task` · `expo-calendar` · `expo-speech` · `expo-file-system` · `expo-sharing` · `expo-haptics` · `expo-blur` · `expo-sensors` |

> There is **no `expo-dev-client`** in this project: it runs in plain **Expo Go** during development. Add a dev client only if you introduce custom native modules.

## 📁 Project structure

```text
api/         Open-Meteo, MET Norway, MeteoAlarm, providers, wire types
components/  cards, charts, deep-dive screens, settings sheet
config/      feature flags, tile registry, colour themes
hooks/       data hooks — weather, alerts, caches, settings
i18n/        11 typed language catalogs (en.ts is canonical)
plugins/     Expo config plugins (ABI splits, app shortcuts)
screens/     Home, radar, layer map, compare, alerts, model comparison…
tasks/       background task — widgets, digest, alerts
theme/       palettes, typography, density
utils/       formatting, astronomy, alerts, caches, radar, i18n…
widget/      home-screen widget task handler
```

## 🚀 Getting started

**Requirements:** Node 20+ · npm · the [Expo Go](https://expo.dev/go) app on an Android device (or emulator).

```bash
git clone https://github.com/Avithegod2010/MU-Weather.git
cd MU-Weather
npm install
npx expo start
```

Scan the QR code with Expo Go. There is **no `.env`, no API key and no account** to set up — every data source used is free and keyless.

**Type-check** (the project's single automated gate — also run by CI on every push):

```bash
npx tsc --noEmit
```

## 📦 Building an APK

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

`app.json` ships two config plugins:

- **`plugins/withAbiSplits.js`** — Gradle ABI splits, so the build emits per-architecture APKs (`arm64-v8a`, `armeabi-v7a`, `x86_64`) plus a universal APK. The arm64 APK is roughly half the size of the universal one.
- **`plugins/withAndroidShortcuts.js`** — Android app shortcuts, with labels translated into all 11 languages.

## 🌐 Data sources & attribution

All data comes from free, **keyless** public APIs, fetched directly from your device:

| Provider | Used for |
| --- | --- |
| [Open-Meteo](https://open-meteo.com/) | Forecast (16-day, hourly, minutely), historical archive (ERA5), climate normals, air quality & pollen (CAMS), ensemble spread, multi-model comparison, geocoding |
| [MET Norway](https://www.met.no/en) | Independent cross-check of the local forecast |
| [MeteoAlarm](https://meteoalarm.org/) | Official European severe-weather warnings (CAP feeds) |
| [RainViewer](https://www.rainviewer.com/api.html) | Animated rain-radar frames |
| [NOAA SWPC](https://www.swpc.noaa.gov/) | Geomagnetic Kp index and forecast, solar-wind speed, interplanetary magnetic field Bz |
| [CARTO](https://carto.com/attributions) · [OpenStreetMap](https://www.openstreetmap.org/copyright) | Raster base-map tiles drawn under the radar |
| [Windy](https://www.windy.com/) | Layer-map views opened from the app |

If you fork the project, please keep the in-app attribution footers — several of these providers require attribution, and Open-Meteo asks for a reference back.

## 🔒 Privacy & permissions

**No accounts · no sign-up · no analytics · no tracking · no advertising.** The app talks only to the weather providers above, over HTTPS, with the coordinates you are viewing.

Everything the app stores — settings, caches, the forecast log, alert history, saved cities — lives locally on your device and disappears when you uninstall the app or clear its data.

| Permission | Why it is requested |
| --- | --- |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | Weather for where you are — optional; saved cities work without it |
| Notifications | The alerts you opt into, and the daily digest |
| `READ_CALENDAR`, `WRITE_CALENDAR` | Forecast rows for upcoming events — optional, unused until you use the feature |

## 🧪 Development notes

- **TypeScript is the test suite.** CI runs `tsc --noEmit` on every push — keep it green.
- **Code style:** strict types, no `any`, no non-null assertions, typed i18n keys, and components that take a `theme: AppTheme` prop.
- **Data flow convention:** `api/` wire types → cache (`utils/*Cache.ts`, AsyncStorage, TTL/LRU) → hook (`hooks/*`) → component. New data must never break a screen: it is best-effort, cached, and the UI renders normally without it.
- **i18n:** add a key to `i18n/en.ts` first, then to every other catalog, each in its own commented block.
- **Dependencies:** please discuss in an issue before adding one. The project deliberately keeps its dependency surface small — it once carried a native map SDK, which was removed in favour of a self-contained tile renderer.

## 🗺️ Roadmap

- [x] **Marine / wave data upgrade** — wave height, period and direction, swell height/period/direction, sea-surface temperature, sea-state bands and a 6-hour per-location cache (Open-Meteo Marine API)
- [x] Historical explorer — weather on any past date
- [ ] Further translation polish and additional languages

## 🤝 Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `npx tsc --noEmit` passes.
2. New user-facing strings exist in **all 11** catalogs.
3. No new runtime dependency without an issue first.
4. One feature or fix per pull request, with a clear description.

## ⚠️ Disclaimer

Weather data is supplied by third parties and may be inaccurate, incomplete or delayed. Never rely on this app for safety-critical decisions. Radar and layer imagery is illustrative, not navigational. Health-index estimates are simple heuristics and are **not medical advice**. Aurora visibility is an estimate based on geomagnetic activity and latitude.

## 📄 License

[MIT](./LICENSE) © Avithegod2010 — created and maintained by [Avithegod2010](https://github.com/Avithegod2010). The entire commit history is authored under that account's GitHub noreply address.

Thanks to the teams behind Open-Meteo, MET Norway, MeteoAlarm, RainViewer, NOAA SWPC, CARTO, OpenStreetMap, and the Expo & React Native communities.
