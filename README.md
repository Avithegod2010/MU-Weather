# MU Weather ⛅

A beautiful, offline-friendly weather app for Android built with React Native and Expo.

**MU** stands for **Material You**. The app's look is built around Material You: rounded card surfaces, ten selectable colour themes, and a **Material You** theme option (Android 12+) that lifts its palette straight from your wallpaper — with the home-screen widgets and the notification surfaces themed to match.

## Features

- **Live conditions** — current weather, feels-like, and animated condition icons
- **Hourly & 16-day forecast** — tap any hour or day for a full breakdown
- **Nowcast** — minute-level rain bands and "rain starting soon" alerts
- **Severe weather warnings** — official MeteoAlarm CAP feed coverage for Europe
- **Air quality** — US EPA & European EEA scales, PM2.5/PM10/O₃/NO₂/SO₂ breakdown, pollen (Europe)
- **Personal forecast accuracy** — the app logs its own predictions and shows how far off they were on average
- **Model leaderboard** — ranks ECMWF, GFS, ICON, Météo-France, JMA and MET Nordic by how often they were right over the last 30 days
- **Weather on this day** — observed high/low for today's date over the past 10 years
- **Climate normals** — "What's normal here" per month, from the ERA5 archive
- **30-day history** — archive-based actuals vs. logged forecasts
- **Spoken forecast** — the app reads your forecast aloud; the daily digest notification has a "Read my forecast" action
- **Home-screen widgets** — 2×2 and 4×2 (with hourly strip), Android 12+ Material You theming
- **Alert rules** — rain, thunder, frost, heat, wind, UV, CAPE storm index, pressure drops, pollen, AQI, aurora, fog, black ice, cold snaps, temperature drops, stargazing, rain easing
- **Saved-city alerts** — the same rules can also run for your saved cities ("rain starting in Paris" while you are elsewhere)
- **Alert history** — the last 20 alerts with the city and time they fired
- **Animated rain radar** — the last two hours of RainViewer frames on a built-in keyless slippy map (pan, zoom, recenter; scrubbable timeline) — no native map module and no API key
- **Health indices** — migraine / respiratory / flu risk estimates from live data
- **Trip planner, storm distance meter, golden hour, calendar integration**
- **11 languages** — English, Hindi, Bengali, Spanish, French, German, Dutch, Greek, Hungarian, Indonesian, Italian
- **Settings backup/restore, CSV/JSON data export**

## Tech stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86 (Hermes)
- TypeScript (strict), no `any`
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for local alerts, [expo-speech](https://docs.expo.dev/versions/latest/sdk/speech/) for spoken forecasts, [react-native-android-widget](https://github.com/sAleksovski/react-native-android-widget) for widgets
- Charts with `react-native-svg`, animations with `react-native-reanimated`; the radar draws its own Web-Mercator raster tiles over plain `Image` components — the earlier `react-native-maps` dependency was removed, so the project carries no map SDK, API key, or billing account
- Weather data: [Open-Meteo](https://open-meteo.com/) (forecast, archive, air quality, geocoding), [MET Norway](https://www.met.no/en) cross-check, [Windy](https://www.windy.com/) layer maps, [MeteoAlarm](https://meteoalarm.org/) warnings, [RainViewer](https://www.rainviewer.com/api.html) radar frames, [NOAA SWPC](https://www.swpc.noaa.gov/) space weather

> **Note:** there is no `expo-dev-client` in this project — run it with the Expo Go app, or add a dev client if you need custom native modules.

## Getting started

```bash
npm install
npx expo start
```

Then scan the QR code with the [Expo Go](https://expo.dev/go) app (Android).

### Building an APK

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

`app.json` ships with per-ABI APK splits (`plugins/withAbiSplits.js`) and Android app shortcuts (`plugins/withAndroidShortcuts.js`) as config plugins.

## Privacy

All app data (settings, forecast log, caches) stays on the device. The only network traffic is weather data from the providers above. No accounts, no analytics, no tracking.

## Author

Created and maintained by [Avithegod2010](https://github.com/Avithegod2010).
The entire commit history of this repository is authored under that account's GitHub noreply address — the authorship record is the commit history itself.

MIT © Avithegod2010 — see [LICENSE](./LICENSE).

