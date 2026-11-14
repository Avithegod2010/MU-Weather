# MU Weather — Privacy Policy

_Last updated: 2026-11-14_

MU Weather is built to work without collecting anything.

## What we collect

**Nothing.** MU Weather has no accounts, no analytics, no advertising, no
crash-reporting services and no servers of its own. There is no "we" receiving
your data.

## What stays on your device

Everything the app stores — favourites, journal ratings, settings, cached
forecasts, alert history — lives in your device's local app storage. Removing
the app removes it all.

## What leaves your device

To show weather, the app sends **direct HTTPS requests to public weather
services**: Open-Meteo (forecast, archive, air quality), RainViewer (radar
tiles), NOAA SWPC (space weather), MeteoAlarm (European warnings), the US
National Weather Service, and Environment Canada. These requests carry only
what the weather question needs — most often a coordinate rounded to
approximately one kilometre and your chosen display language. No identifier
that could single you out is added, and no request is routed through any
server operated by MU Weather.

If you enable the optional AI digest, the summary of your day (never your
location history, never your journal) is sent to the AI provider whose API key
you supply. Without a key, this feature does not exist.

## Permissions

- **Location** — used only to fetch weather for where you are. You can use the
  app fully with a manually chosen city instead.
- **Calendar** — used only to show forecasts next to your own calendar events,
  if you enable that feature.
- **Notifications** — used for the alerts and the sunrise alarm you configure.

## Open source

The complete source code is available at
https://github.com/Avithegod2010/MU-Weather under the MIT licence. This policy
describes the code as written; verify it yourself.

## Contact

Open an issue at https://github.com/Avithegod2010/MU-Weather/issues
