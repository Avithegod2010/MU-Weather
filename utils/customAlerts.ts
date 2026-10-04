import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertSeverity, TriggeredAlert } from './alertRules';
import { peakCape } from './storm';
import { getUnits, pressureUnitLabel, windUnitLabel } from './format';
import { t } from './i18n';
import type { StringKey } from './i18n';
import type { DayPoint, WeatherBundle } from '../api/types';

/** Storage key for the user-defined alert rules. */
export const CUSTOM_ALERTS_STORAGE_KEY = '@mu_weather/custom_alerts_v1';
/** At most 5 rules - adding past the cap evicts the oldest (first created). */
export const MAX_CUSTOM_ALERTS = 5;
/** Optional user note: capped so a reminder stays one notification line. */
export const MAX_NOTE_LENGTH = 80;

export type CustomMetric = 'uv' | 'wind' | 'temp' | 'humidity' | 'pressure' | 'aqi' | 'cape';
export type CustomOp = 'gte' | 'lte';

export interface CustomAlertRule {
  /** Stable unique id (creation timestamp, base 36) - the cooldown namespace per rule. */
  id: string;
  metric: CustomMetric;
  op: CustomOp;
  /**
   * In the USER's units as they were when the rule was created; converted to
   * the API's unit at evaluation time (see ruleValueToBase).
   */
  value: number;
  enabled: boolean;
  /**
   * Optional user-authored reminder ("close the windows"). Shown VERBATIM in
   * the notification when present - never translated, it is the user's own
   * words. Absent/empty means the generic metric template is used.
   */
  note?: string;
}

const METRICS: readonly CustomMetric[] = [
  'uv',
  'wind',
  'temp',
  'humidity',
  'pressure',
  'aqi',
  'cape',
];

/** Localized metric names, shared by the builder UI and the notification text. */
export const CUSTOM_METRIC_KEYS: Record<CustomMetric, StringKey> = {
  uv: 'custom_metric_uv',
  wind: 'custom_metric_wind',
  temp: 'custom_metric_temp',
  humidity: 'custom_metric_humidity',
  pressure: 'custom_metric_pressure',
  aqi: 'custom_metric_aqi',
  cape: 'custom_metric_cape',
};

/**
 * Severity mapped from the metric itself: how urgent the quantity is when it
 * crosses a user-chosen line. Storm instability is the most urgent (severe
 * also turns on the notification sound), temperature/wind/UV/pressure/AQI
 * warn, humidity is informational.
 */
const METRIC_SEVERITY: Record<CustomMetric, AlertSeverity> = {
  cape: 'severe',
  wind: 'warning',
  temp: 'warning',
  uv: 'warning',
  pressure: 'warning',
  aqi: 'warning',
  humidity: 'info',
};

export function isCustomMetric(value: unknown): value is CustomMetric {
  return typeof value === 'string' && (METRICS as readonly string[]).includes(value);
}

function isCustomOp(value: unknown): value is CustomOp {
  return value === 'gte' || value === 'lte';
}

function isValidRule(value: unknown): value is CustomAlertRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<CustomAlertRule>;
  return (
    typeof rule.id === 'string' &&
    rule.id.length > 0 &&
    isCustomMetric(rule.metric) &&
    isCustomOp(rule.op) &&
    typeof rule.value === 'number' &&
    Number.isFinite(rule.value) &&
    typeof rule.enabled === 'boolean'
  );
}

/** Stable unique rule id: the creation timestamp in base 36 (no counter to reset). */
export function newCustomRuleId(): string {
  return `custom-${Date.now().toString(36)}`;
}

/**
 * Normalizes the optional note: non-string/blank -> undefined, whitespace
 * collapsed, capped at MAX_NOTE_LENGTH. A corrupt note never invalidates the
 * rule itself - it just falls back to the generic template.
 */
function sanitizeRule(rule: CustomAlertRule): CustomAlertRule {
  if (rule.note === undefined) return rule;
  if (typeof rule.note !== 'string') {
    const { note: _dropped, ...rest } = rule;
    return rest;
  }
  const note = rule.note.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE_LENGTH);
  if (!note) {
    const { note: _dropped, ...rest } = rule;
    return rest;
  }
  return { ...rule, note };
}

/** Stored rules (oldest first), fully validated. Corrupt storage is treated absent. */
export async function loadCustomAlerts(): Promise<CustomAlertRule[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRule).map(sanitizeRule);
  } catch {
    return [];
  }
}

/** Validate, cap at MAX_CUSTOM_ALERTS (oldest evicted) and persist. Never throws. */
export async function saveCustomAlerts(rules: CustomAlertRule[]): Promise<void> {
  try {
    const valid = rules.filter(isValidRule).map(sanitizeRule).slice(-MAX_CUSTOM_ALERTS);
    await AsyncStorage.setItem(CUSTOM_ALERTS_STORAGE_KEY, JSON.stringify(valid));
  } catch {
    // Non-critical: the in-memory state still drives this session.
  }
}
/**
 * The stored value is in the USER's units (the number they typed in the
 * builder); evaluation converts it to the API's unit so it compares against
 * the raw reading. UV, AQI and CAPE are unitless - no conversion. Wind converts
 * mph -> km/h, temperature °F -> °C, pressure mmHg/inHg -> hPa.
 * Trade-off: switching the app's units re-interprets existing rules' values
 * (the number stays, its unit meaning follows the current setting).
 */
function ruleValueToBase(metric: CustomMetric, value: number): number {
  const units = getUnits();
  switch (metric) {
    case 'temp':
      return units.temp === 'fahrenheit' ? ((value - 32) * 5) / 9 : value;
    case 'wind':
      return units.wind === 'mph' ? value / 0.621371 : value;
    case 'pressure':
      if (units.pressure === 'mmHg') return value / 0.750062;
      if (units.pressure === 'inHg') return value / 0.02953;
      return value;
    default:
      return value;
  }
}

/**
 * Format a rule's stored value for the builder row and the notification body.
 * The value already carries the user's unit, so the label comes from the
 * current unit setting.
 */
export function formatCustomValue(metric: CustomMetric, value: number): string {
  switch (metric) {
    case 'temp':
      return `${Math.round(value)}°`;
    case 'wind':
      return `${Math.round(value)} ${windUnitLabel()}`;
    case 'humidity':
      return `${Math.round(value)}%`;
    case 'pressure': {
      const number = getUnits().pressure === 'inHg' ? value.toFixed(2) : String(Math.round(value));
      return `${number} ${pressureUnitLabel()}`;
    }
    case 'cape':
      return `${Math.round(value).toLocaleString('en-US')} J/kg`;
    default:
      return String(Math.round(value));
  }
}

/**
 * Where each metric reads its value:
 * - temp / wind / humidity / pressure: the CURRENT conditions
 * - uv: today's UV max (the same place the built-in UV rule reads;
 *   CurrentConditions carries no UV, and the daily max avoids the night question)
 * - aqi: the current US AQI (null -> the rule cannot fire - fail closed)
 * - cape: the next-12h peak (peakCape, the same helper as the built-in CAPE
 *   rule - the instantaneous value is too spiky for a 30-minute sweep to catch)
 */
function customMetricValue(
  metric: CustomMetric,
  data: WeatherBundle,
  today: DayPoint | null,
  capePeak: { cape: number; time: string } | null,
): number | null {
  switch (metric) {
    case 'temp':
      return data.current.temperature;
    case 'wind':
      return data.current.windSpeed;
    case 'humidity':
      return data.current.humidity;
    case 'pressure':
      return data.current.pressure;
    case 'aqi':
      return data.aqi?.usAqi ?? null;
    case 'uv':
      return today ? today.uvIndexMax : null;
    case 'cape':
      return capePeak ? capePeak.cape : null;
  }
}

/**
 * Evaluate the user's custom rules against one city's data. Pure: everything
 * derives from the WeatherBundle (the v1 metric set needs no AlertExtras).
 *
 * One condition per rule for v1: several enabled rules act as OR - each fires
 * its own alert with its own `custom:<id>` cooldown namespace, so rules never
 * silence each other. AND semantics would need a multi-condition rule.
 */
export function evaluateCustomRules(
  rules: CustomAlertRule[],
  data: WeatherBundle,
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];
  const today = data.daily[0] ?? null;
  const capePeak = peakCape(data.hourly, 12);

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const actual = customMetricValue(rule.metric, data, today, capePeak);
    if (actual === null) continue;
    const threshold = ruleValueToBase(rule.metric, rule.value);
    const hit = rule.op === 'gte' ? actual >= threshold : actual <= threshold;
    if (!hit) continue;
    const metricName = t(CUSTOM_METRIC_KEYS[rule.metric]);
    const valueText = formatCustomValue(rule.metric, rule.value);
    const body =
      rule.op === 'gte'
        ? t('notif_custom_gte').split('{metric}').join(metricName).split('{value}').join(valueText)
        : t('notif_custom_lte').split('{metric}').join(metricName).split('{value}').join(valueText);
    triggered.push({
      key: `custom:${rule.id}`,
      // With a note, the notification carries the user's own words verbatim
      // (title = "Reminder", body = the note); the condition still fires it.
      title: rule.note ? t('custom_reminder') : t('notif_custom_title').split('{metric}').join(metricName),
      message: rule.note ?? body,
      severity: METRIC_SEVERITY[rule.metric],
    });
  }
  return triggered;
}