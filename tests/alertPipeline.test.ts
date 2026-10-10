import { DEFAULT_ALERT_SETTINGS, normalizeAlertSettings, type AlertSettings, type TriggeredAlert } from '../utils/alertRules';
import {
  favoriteCitySweepIntervalMs,
  fireFavoriteCityAlerts,
  MAX_FAVORITE_CHECKS,
  type FavoriteCitySweepState,
} from '../utils/favoriteCityAlerts';
import {
  deliverAlerts,
  type AlertDeliveryPorts,
  type DeliverAlertsOptions,
} from '../utils/fireAlertNotifications';
import type { AlertHistoryEntry } from '../utils/alertHistory';
import type { GeoLocation, WeatherBundle } from '../api/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const start = Date.UTC(2026, 9, 9, 10);
const rainAlert: TriggeredAlert = {
  key: 'rain',
  title: 'Rain expected',
  message: 'Rain is likely soon.',
  severity: 'warning',
};

interface MemoryDelivery {
  now: number;
  permission: string;
  quiet: boolean;
  fired: Record<string, unknown>;
  history: AlertHistoryEntry[];
  scheduled: unknown[];
  failScheduling: boolean;
}

function deliveryPorts(memory: MemoryDelivery): AlertDeliveryPorts {
  return {
    now: () => memory.now,
    getPermissionStatus: async () => memory.permission,
    ensureChannel: async () => undefined,
    ensureCategory: async () => undefined,
    inQuietHours: async () => memory.quiet,
    loadFiredMap: async () => ({ ...memory.fired }),
    saveFiredMap: async (fired) => { memory.fired = { ...fired }; },
    scheduleNotification: async (request) => {
      if (memory.failScheduling) throw new Error('synthetic scheduler failure');
      memory.scheduled.push(request);
    },
    appendHistory: async (entries) => { memory.history.push(...entries); },
  };
}

function memory(): MemoryDelivery {
  return { now: start, permission: 'granted', quiet: false, fired: {}, history: [], scheduled: [], failScheduling: false };
}

async function testPermissionsQuietHoursFailuresEscalationAndExpiry(): Promise<void> {
  const permissionMemory = memory();
  permissionMemory.permission = 'denied';
  const permissionPorts = deliveryPorts(permissionMemory);
  await deliverAlerts([rainAlert], {}, permissionPorts);
  equal(permissionMemory.history[0]?.deliveryStatus, 'permission-denied', 'missing permission is recorded as an explicit outcome');
  equal(Object.keys(permissionMemory.fired).length, 0, 'permission denial does not consume cooldown');
  permissionMemory.now += 60_000;
  permissionMemory.permission = 'granted';
  await deliverAlerts([rainAlert], {}, permissionPorts);
  equal(permissionMemory.history[1]?.deliveryStatus, 'scheduled', 'a later grant allows a retry after a cold permission-denied start');
  equal(permissionMemory.scheduled.length, 1, 'granted permission reaches the notification scheduler');

  const quietMemory = memory();
  quietMemory.quiet = true;
  const quietPorts = deliveryPorts(quietMemory);
  await deliverAlerts([rainAlert], {}, quietPorts);
  equal(quietMemory.history[0]?.deliveryStatus, 'quiet-hours', 'quiet hours are represented separately from failures');
  assert(Object.keys(quietMemory.fired).length === 1, 'quiet-hours suppression consumes cooldown to avoid a delayed surprise');
  quietMemory.quiet = false;
  quietMemory.now += 60_000;
  await deliverAlerts([rainAlert], {}, quietPorts);
  equal(quietMemory.scheduled.length, 0, 'the same event remains suppressed after quiet hours when its cooldown was consumed');

  const failureMemory = memory();
  failureMemory.failScheduling = true;
  const failurePorts = deliveryPorts(failureMemory);
  await deliverAlerts([rainAlert], {}, failurePorts);
  equal(failureMemory.history[0]?.deliveryStatus, 'scheduling-failed', 'scheduler failure is persisted');
  equal(Object.keys(failureMemory.fired).length, 0, 'scheduler failure leaves cooldown open for retry');
  failureMemory.failScheduling = false;
  failureMemory.now += 30_000;
  await deliverAlerts([rainAlert], {}, failurePorts);
  equal(failureMemory.history[1]?.deliveryStatus, 'scheduled', 'a later refresh retries a failed schedule');

  const escalationMemory = memory();
  escalationMemory.fired.rain = { at: start, severity: 'warning' };
  escalationMemory.now += 1_000;
  const escalation = { ...rainAlert, severity: 'severe' as const };
  await deliverAlerts([escalation], {}, deliveryPorts(escalationMemory));
  equal(escalationMemory.history[0]?.escalated, true, 'a severity rise bypasses cooldown and is marked as an escalation');
  equal(escalationMemory.scheduled.length, 1, 'an escalation reaches the scheduler immediately');

  const expiryMemory = memory();
  const expired = { ...rainAlert, expiresAt: start - 1 };
  await deliverAlerts([expired], {}, deliveryPorts(expiryMemory));
  equal(expiryMemory.history[0]?.deliveryStatus, 'expired', 'expired forecast events are recorded, not silently dropped');
  equal(expiryMemory.scheduled.length, 0, 'an expired event is never scheduled retroactively');
  equal(Object.keys(expiryMemory.fired).length, 0, 'an expired event does not consume cooldown');
  expiryMemory.now += 1_000;
  await deliverAlerts([{ ...rainAlert, expiresAt: expiryMemory.now + 60_000 }], {}, deliveryPorts(expiryMemory));
  equal(expiryMemory.history[1]?.deliveryStatus, 'scheduled', 'a newer valid event can follow an expired event with the same rule key');
}

function city(id: string, latitude: number): GeoLocation {
  return { id, name: id.toUpperCase(), latitude, longitude: latitude, countryCode: 'IN' };
}

function weatherFor(location: GeoLocation): WeatherBundle {
  return {
    location,
    utcOffsetSeconds: 0,
    elevation: null,
    current: { temperature: 20 } as WeatherBundle['current'],
    hourly: [],
    hourlyAll: [],
    minutely: [],
    daily: [],
    aqi: null,
    aqiHourly: [],
    fetchedAt: start,
  };
}

async function testSavedCityColdWarmAndCadence(): Promise<void> {
  const cities = [city('one', 10), city('two', 20), city('three', 30), city('four', 40)];
  const current = weatherFor(city('home', 0));
  const settings: AlertSettings = {
    ...DEFAULT_ALERT_SETTINGS,
    rain: true,
    favorites: true,
    favoriteRefreshIntervalMinutes: 30,
  };
  equal(favoriteCitySweepIntervalMs(settings), 30 * 60_000, 'saved-city interval honors the explicit cadence');
  const stored: { sweep: FavoriteCitySweepState } = { sweep: { at: 0, next: 0 } };
  let now = start;
  const fetched: string[] = [];
  const delivered: { alerts: TriggeredAlert[]; options: DeliverAlertsOptions }[] = [];
  const ports = {
    now: () => now,
    loadSweepState: async () => ({ ...stored.sweep }),
    saveSweepState: async (state: FavoriteCitySweepState) => { stored.sweep = { ...state }; },
    loadFavorites: async () => cities,
    fetchWeather: async (target: GeoLocation) => {
      fetched.push(target.id);
      return weatherFor(target);
    },
    buildAlertExtras: async () => ({}),
    evaluateCityAlerts: () => [rainAlert],
    deliverAlerts: async (alerts: TriggeredAlert[], options: DeliverAlertsOptions) => {
      delivered.push({ alerts, options });
      return alerts;
    },
  };
  const first = await fireFavoriteCityAlerts(settings, current, ports);
  equal(first.length, MAX_FAVORITE_CHECKS, 'first saved-city sweep checks only the configured batch size');
  assert(fetched.join(',') === 'one,two,three', 'saved cities are checked in rotation order');
  assert(delivered.every((row) => row.options.city && row.options.cooldownPrefix?.includes('|')),
    'saved-city notifications retain their city and independent cooldown namespace');
  equal(stored.sweep.next, MAX_FAVORITE_CHECKS, 'sweep rotation offset is persisted for the next app start');

  // A new invocation represents a cold/background start: the persisted stamp still throttles it.
  now += 30 * 60_000;
  const afterRestartBeforeBoundary = await fireFavoriteCityAlerts(settings, current, ports);
  equal(afterRestartBeforeBoundary.length, 0, 'a cold start reads persisted sweep state instead of duplicating work');
  now += 1;
  const warmNext = await fireFavoriteCityAlerts(settings, current, ports);
  equal(warmNext.length, MAX_FAVORITE_CHECKS, 'the next due warm pass resumes saved-city rotation');
  assert(fetched.slice(3).join(',') === 'four,one,two', 'rotation continues across a persisted cold/warm boundary');

  const slower = { ...settings, favoriteRefreshIntervalMinutes: 60 as const };
  now += 31 * 60_000;
  const slowerPass = await fireFavoriteCityAlerts(slower, current, ports);
  equal(slowerPass.length, 0, 'a longer user-selected saved-city interval suppresses only the supplemental city sweep');
  equal(favoriteCitySweepIntervalMs(slower), 60 * 60_000, 'the 60-minute cadence is persisted and applied');
}

async function testSavedCityFailureDoesNotBlockPeers(): Promise<void> {
  const cities = [city('offline', 10), city('reachable-a', 20), city('reachable-b', 30)];
  const settings = normalizeAlertSettings({ ...DEFAULT_ALERT_SETTINGS, favorites: true });
  const current = weatherFor(city('home', 0));
  const checked: string[] = [];
  const state = { at: 0, next: 0 };
  const sent: string[] = [];
  await fireFavoriteCityAlerts(settings, current, {
    now: () => start,
    loadSweepState: async () => ({ ...state }),
    saveSweepState: async (next) => { state.at = next.at; state.next = next.next; },
    loadFavorites: async () => cities,
    fetchWeather: async (target) => {
      checked.push(target.id);
      if (target.id === 'offline') throw new Error('synthetic saved-city outage');
      return weatherFor(target);
    },
    buildAlertExtras: async () => ({}),
    evaluateCityAlerts: () => [rainAlert],
    deliverAlerts: async (alerts, options) => {
      sent.push(options.city ?? '');
      return alerts;
    },
  });
  assert(checked.length === 3 && sent.join(',') === 'REACHABLE-A,REACHABLE-B',
    'one offline saved city cannot block notifications for later reachable cities');
}

function testPersistedSettingsNormalization(): void {
  const restored = normalizeAlertSettings(JSON.parse(JSON.stringify({
    rain: true,
    favorites: true,
    quietHoursEnabled: true,
    quietStartMinutes: 1320,
    quietEndMinutes: 420,
    favoriteRefreshIntervalMinutes: 60,
    injectedKey: true,
  })));
  assert(restored.rain && restored.favorites && restored.quietHoursEnabled, 'stored preferences restore for a cold/background launch');
  equal(restored.favoriteRefreshIntervalMinutes, 60, 'the chosen saved-city cadence survives serialization');
  equal(normalizeAlertSettings({ favoriteRefreshIntervalMinutes: 999 }).favoriteRefreshIntervalMinutes, 20,
    'malformed persisted cadence falls back to the safe default');
}

async function main(): Promise<void> {
  testPersistedSettingsNormalization();
  await testPermissionsQuietHoursFailuresEscalationAndExpiry();
  await testSavedCityColdWarmAndCadence();
  await testSavedCityFailureDoesNotBlockPeers();
  console.log('alert delivery, saved-city sweep, cadence, expiry, and cold/warm-start tests passed');
}

void main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
