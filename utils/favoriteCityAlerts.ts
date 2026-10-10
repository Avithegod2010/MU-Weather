import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWeather } from '../api/openMeteo';
import { evaluateAlerts, type AlertExtras, type AlertSettings, type TriggeredAlert } from './alertRules';
import { evaluateCustomRules, loadCustomAlerts } from './customAlerts';
import { buildAlertExtras, deliverAlerts, COOLDOWN_MS } from './fireAlertNotifications';
import { loadFavorites } from './favoritesStore';
import { t } from './i18n';
import type { GeoLocation, WeatherBundle } from '../api/types';

/** At most this many saved cities per sweep - every city costs a full fetch. */
export const MAX_FAVORITE_CHECKS = 3;
const MINUTE_MS = 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MINUTES = 20;
/** Saved cities are quieter than the active location: 12 h per alert, not 6 h. */
const FAVORITE_COOLDOWN_MS = 2 * COOLDOWN_MS;
const SWEEP_STAMP_KEY = '@mu_weather/fav_alert_sweep_v1';

/**
 * Sweep bookkeeping: when the last sweep ran, plus the rotation offset - which
 * city the next sweep starts at. The offset is what lets more saved cities
 * exist than one sweep can check.
 */
export interface FavoriteCitySweepState {
  at: number;
  next: number;
}

type SweepState = FavoriteCitySweepState;

/** Integration ports allow the persisted sweep and per-city failures to be tested deterministically. */
export interface FavoriteCityAlertPorts {
  now?: () => number;
  loadSweepState?: () => Promise<FavoriteCitySweepState>;
  saveSweepState?: (state: FavoriteCitySweepState) => Promise<void>;
  loadFavorites?: () => Promise<GeoLocation[]>;
  fetchWeather?: (city: GeoLocation) => Promise<WeatherBundle>;
  loadCustomAlerts?: typeof loadCustomAlerts;
  evaluateCityAlerts?: (settings: AlertSettings, data: WeatherBundle, extras: AlertExtras) => Promise<TriggeredAlert[]> | TriggeredAlert[];
  buildAlertExtras?: (settings: AlertSettings, data: WeatherBundle) => Promise<AlertExtras>;
  deliverAlerts?: (triggered: TriggeredAlert[], options: import('./fireAlertNotifications').DeliverAlertsOptions) => Promise<TriggeredAlert[]>;
}

/** User cadence affects saved-city work only; active-location notifications are not gated here. */
export function favoriteCitySweepIntervalMs(settings: AlertSettings): number {
  const requested = settings.favoriteRefreshIntervalMinutes;
  const minutes = requested === 30 || requested === 60 ? requested : DEFAULT_SWEEP_INTERVAL_MINUTES;
  return minutes * MINUTE_MS;
}

/**
 * Same place? The forecast only depends on the coordinates, and the tolerance
 * is deliberately ~1 km (two decimal places). The earlier 1e-4° (~11 m) missed
 * whenever the saved-city coordinates and the live fix came from different
 * geocoders, so a user already standing in a saved city could still be told
 * "rain starting in <that city>". Trade-off: two genuinely different saved
 * cities less than ~1 km apart are treated as one place - acceptable, because
 * at city scale the forecast is the same for both.
 */
function isSamePlace(a: GeoLocation, b: GeoLocation): boolean {
  return Math.abs(a.latitude - b.latitude) < 1e-2 && Math.abs(a.longitude - b.longitude) < 1e-2;
}

/**
 * Persisted sweep state. The stamp used to be a bare epoch number; that shape
 * still parses (offset 0) instead of throwing away the rate limit on upgrade.
 */
async function loadSweepState(): Promise<SweepState> {
  try {
    const raw = await AsyncStorage.getItem(SWEEP_STAMP_KEY);
    if (!raw) return { at: 0, next: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number' && Number.isFinite(parsed)) return { at: parsed, next: 0 };
    if (parsed && typeof parsed === 'object') {
      const state = parsed as Partial<SweepState>;
      return {
        at: typeof state.at === 'number' && Number.isFinite(state.at) ? state.at : 0,
        next:
          typeof state.next === 'number' && Number.isFinite(state.next) && state.next >= 0
            ? Math.floor(state.next)
            : 0,
      };
    }
    return { at: 0, next: 0 };
  } catch {
    return { at: 0, next: 0 };
  }
}

async function saveSweepState(state: SweepState): Promise<void> {
  try {
    await AsyncStorage.setItem(SWEEP_STAMP_KEY, JSON.stringify(state));
  } catch {
    // Non-critical bookkeeping.
  }
}

/**
 * Run the alert rules for the user's saved cities, so the phone can say
 * "Rain starting in Paris in 40 min" while the user is somewhere else.
 *
 * Gated by the opt-in `favorites` alert key, capped at MAX_FAVORITE_CHECKS
 * cities per sweep, and rate-limited by the user's saved-city refresh cadence
 * because both the refresh path and the background task call it. The default
 * is 20 minutes; OS background scheduling may run less often.
 *
 * Rotation: a sweep starts where the previous one stopped and the offset
 * advances by the number of cities actually checked, so one sweep per 20
 * minutes eventually reaches every saved city - each city is checked at least
 * once every ceil(N / MAX_FAVORITE_CHECKS) sweeps, i.e. within roughly
 * 20 min x ceil(N/3) while the app is in use (about 40 min for 5 saved cities).
 * With the app closed, the OS background cadence (a 30-minute task minimum)
 * stretches that further.
 *
 * Delivered alerts get a per-city cooldown namespace, so an alert for one city
 * can never silence the same alert for another, a 12-hour cooldown (2x the
 * active location's) so background cities stay quieter, and the notification
 * title carries the city name.
 *
 * Aurora is deliberately skipped for saved cities: whether you can see aurora
 * depends on the sky above *you*, not on the saved city's latitude.
 */
export async function fireFavoriteCityAlerts(
  settings: AlertSettings,
  current: WeatherBundle,
  ports: FavoriteCityAlertPorts = {},
): Promise<TriggeredAlert[]> {
  if (!settings.favorites) return [];

  const now = ports.now ?? Date.now;
  const sweep = await (ports.loadSweepState ?? loadSweepState)();
  // A legacy stamp (or none) is due; the state also holds the rotation offset.
  if (sweep.at > 0 && now() - sweep.at <= favoriteCitySweepIntervalMs(settings)) return [];

  const favorites = (await (ports.loadFavorites ?? loadFavorites)()).filter(
    (favorite) => !isSamePlace(favorite, current.location),
  );
  const saveState = ports.saveSweepState ?? saveSweepState;
  if (favorites.length === 0) {
    await saveState({ at: now(), next: 0 });
    return [];
  }

  // Rotate through the stable list: pick up where the last sweep stopped.
  const start = sweep.next % favorites.length;
  const count = Math.min(MAX_FAVORITE_CHECKS, favorites.length);
  const picks = Array.from(
    { length: count },
    (_, index) => favorites[(start + index) % favorites.length],
  );

  const citySettings: AlertSettings = { ...settings, aurora: false };
  const allTriggered: TriggeredAlert[] = [];
  // Custom rules run for saved cities too - the quieter per-city cooldown
  // (12 h) keeps background cities quieter than the active one.
  const customRules = ports.evaluateCityAlerts ? [] : await (ports.loadCustomAlerts ?? loadCustomAlerts)();
  const getExtras = ports.buildAlertExtras ?? buildAlertExtras;
  const deliver = ports.deliverAlerts ?? deliverAlerts;

  for (const city of picks) {
    try {
      const data = await (ports.fetchWeather ?? fetchWeather)(city);
      const extras = await getExtras(citySettings, data);
      const cityTriggered = ports.evaluateCityAlerts
        ? await ports.evaluateCityAlerts(citySettings, data, extras)
        : [
            ...evaluateAlerts(
              citySettings,
              data.current,
              data.hourly,
              data.daily[0] ?? null,
              data.aqi,
              extras,
            ),
            ...evaluateCustomRules(customRules, data),
          ];
      if (cityTriggered.length === 0) continue;
      allTriggered.push(...cityTriggered);
      await deliver(cityTriggered, {
        city: city.name,
        cooldownPrefix: `${city.id}|`,
        cooldownMs: FAVORITE_COOLDOWN_MS,
        timezone: data.timezone,
        titleFormatter: (alert) =>
          t('alert_city_title')
            .split('{city}')
            .join(city.name)
            .split('{title}')
            .join(alert.title),
      });
    } catch {
      // One unreachable saved city must never block the others.
    }
  }

  await saveState({ at: now(), next: (start + count) % favorites.length });
  return allTriggered;
}
