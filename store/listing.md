# Play Store listing — MU Weather

Working draft for the Google Play console. Values in _italics_ are decisions
still to make.

## App details

- **App name:** MU Weather — Material You Weather (30-char limit: "MU Weather — Material You Weather" is 33, so use **"MU Weather - Material You"** or simply **"MU Weather"**)
- **Short description** (80 chars):
  Free, private weather radar & forecast. No ads, no tracking, no API keys.
- **Category:** Weather
- **Tags:** Weather forecast · Rain radar · Widgets
- **Contains ads:** No · **In-app purchases:** No · **Data collected:** None

## Full description

MU Weather is a free, open-source weather app built around Material You — it
adapts to your wallpaper and never asks for an account, an API key or your
attention with ads.

**Forecast**
• 16-day outlook with hourly detail and P10–P90 ensemble confidence bands
• Rain nowcast to the minute, with alerts that say "rain in about 15 minutes"
• Per-metric accuracy scores and a weather-model leaderboard (ECMWF, GFS, ICON…)

**Radar & warnings**
• Animated RainViewer radar with playback, scrubbing and pinch zoom
• Official government warnings: MeteoAlarm (Europe), US NWS, Environment Canada
• Warning outlines drawn right on the radar map

**Home screen**
• Five widgets (2×2 to a 4×3 dashboard) that follow your wallpaper
• Spoken daily digest — optionally upgraded with your own AI key
• A weather journal that learns the temperatures where you feel cold or hot

**Private by architecture**
• No accounts. No tracking. No analytics. No ads.
• Your data never leaves the device except as a coordinate in a weather call
• Everything is MIT-licensed open source: verify it yourself

**16 languages**, offline-friendly, and completely free.

## Graphics checklist

- [ ] App icon 512×512 (from assets/icon.png)
- [ ] Feature graphic 1024×500
- [ ] Phone screenshots ×4–8 (hero, radar, widgets, warnings, heatmap, settings) — needs the device (scripts/visual/capture.py)
- [ ] 7" / 10" tablet screenshots (optional at launch)

## Data safety questionnaire (ground truth for the form)

- Does the app collect or share any of the required user data types? **No.**
- Is all user data encrypted in transit? The app makes direct HTTPS calls to
  public weather APIs; no user data is collected, so the answer to collection
  questions is "No".
- Location: accessed via the OS permission only while fetching weather for the
  chosen location; coordinates are rounded (~1 km) and never stored off-device.
- Deletes: nothing to delete — no server storage exists.

## Content rating

- Questionnaire answers: no objectionable content → expect **Everyone** / IARC 3+.

## Release track plan

1. Internal testing track with an .apk/.aab from the `production` profile (app bundle).
2. Closed testing (opt-in) — the GitHub community.
3. Production, staged 20% → 100%.

## Before submitting

- [ ] Complete account: developer name, contact email (decide: a dedicated address?)
- [ ] Privacy policy URL: https://avithegod2010.github.io/MU-Weather/ + a policy page (see store/privacy-policy.md — host it as a site page)
- [ ] `production` EAS profile builds an .aab (`eas build -p android --profile production`) — requires the build quota decision
- [ ] App signing: Play App Signing enrolment (EAS can generate/upload the key)
