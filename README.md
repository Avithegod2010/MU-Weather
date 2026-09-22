# MU Weather ⛅

A beautiful, offline-friendly weather app for Android built with React Native and Expo.

## Features

- **Live conditions** — current weather, feels-like, and animated condition icons
- **Hourly & 16-day forecast** — tap any hour or day for a full breakdown
- **Nowcast** — minute-level rain bands and "rain starting soon" alerts
- **Severe weather warnings** — official MeteoAlarm CAP feed coverage for Europe
- **Air quality** — US EPA & European EEA scales, PM2.5/PM10/O₃/NO₂/SO₂ breakdown, pollen (Europe)
- **Personal forecast accuracy** — the app logs its own predictions and shows how far off they were on average
- **Weather on this day** — observed high/low for today's date over the past 10 years
- **Climate normals** — "What's normal here" per month, from the ERA5 archive
- **30-day history** — archive-based actuals vs. logged forecasts
- **Spoken forecast** — the app reads your forecast aloud; the daily digest notification has a "Read my forecast" action
- **Home-screen widgets** — 2×2 and 4×2 (with hourly strip), Android 12+ Material You theming
- **Alert rules** — rain, thunder, frost, heat, wind, UV, CAPE storm index, pressure drops, pollen, AQI
- **Health indices** — migraine / respiratory / flu risk estimates from live data
- **Trip planner, storm distance meter, golden hour, calendar integration**
- **11 languages** — English, Hindi, Bengali, Spanish, French, German, Dutch, Greek, Hungarian, Indonesian, Italian
- **Settings backup/restore, CSV/JSON data export**

## Tech stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86 (Hermes)
- TypeScript (strict), no `any`
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for local alerts, [expo-speech](https://docs.expo.dev/versions/latest/sdk/speech/) for spoken forecasts, [react-native-android-widget](https://github.com/sAleksovski/react-native-android-widget) for widgets
- Charts with `react-native-svg`, animations with `react-native-reanimated`
- Weather data: [Open-Meteo](https://open-meteo.com/) (forecast, archive, air quality, geocoding), [MET Norway](https://www.met.no/en) cross-check, [Windy](https://www.windy.com/) radar links, [MeteoAlarm](https://meteoalarm.org/) warnings

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

## License

[MIT](./LICENSE)
