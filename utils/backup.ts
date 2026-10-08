import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { DEFAULT_SETTINGS, type AppSettings } from '../hooks/useSettings';
import type { AlertSettings } from './alertRules';
import { ALERTS_STORAGE_KEY, loadAlertSettings } from './fireAlertNotifications';
import {
  COMFORT_JOURNAL_KEY,
  isValidEntry as isValidJournalEntry,
  loadComfortJournal,
  MAX_JOURNAL_ENTRIES,
} from './comfortJournal';
import type { ComfortJournalEntry } from './comfortJournal';
import { loadCustomAlerts, saveCustomAlerts } from './customAlerts';
import type { CustomAlertRule } from './customAlerts';
import {
  isValidEntry as isValidWidgetCityEntry,
  loadWidgetCities,
  saveWidgetCity,
} from './widgetCityConfig';

export type ImportResult =
  | { outcome: 'canceled' }
  | { outcome: 'invalid' }
  | { outcome: 'ok'; settings: Partial<AppSettings> };

/**
 * v2 backup: the settings blob PLUS the on-device data users create (journal,
 * custom alerts, the alert-settings blob incl. the saved-city opt-in, and the
 * multi-city widget assignments). v1 backups were a bare AppSettings object;
 * both shapes are accepted on import.
 */
export interface BackupBundle {
  version: 2;
  settings: AppSettings;
  alertSettings: Partial<AlertSettings>;
  journal: ComfortJournalEntry[];
  customAlerts: CustomAlertRule[];
  widgetCities: Awaited<ReturnType<typeof loadWidgetCities>>;
}

function todayStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${month}${day}`;
}

/**
 * Writes a v2 bundle (settings + journal + custom alerts + alert settings +
 * widget cities) to a dated JSON file in the cache dir; returns its URI.
 * Async because the extra sections are read from storage.
 */
export async function exportSettings(settings: AppSettings): Promise<string> {
  const [alertSettings, journal, customAlerts, widgetCities] = await Promise.all([
    loadAlertSettings(),
    loadComfortJournal(),
    loadCustomAlerts(),
    loadWidgetCities(),
  ]);
  const bundle: BackupBundle = {
    version: 2,
    settings,
    alertSettings,
    journal,
    customAlerts,
    widgetCities,
  };
  const file = new File(Paths.cache, `mu-weather-backup-${todayStamp()}.json`);
  file.write(JSON.stringify(bundle, null, 2));
  return file.uri;
}

/**
 * Sanitizes a settings object against DEFAULT_SETTINGS: unknown keys are
 * dropped and wrong-typed values rejected per key, so a hostile or stale
 * backup can only ever produce a valid Partial<AppSettings>. Never throws.
 */
function sanitizeSettings(input: unknown): Partial<AppSettings> {
  const sanitized: Partial<AppSettings> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return sanitized;
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const expected = DEFAULT_SETTINGS[key];
    const value = record[key];
    if (Array.isArray(expected)) {
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        (sanitized as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (typeof value === typeof expected) {
      (sanitized as Record<string, unknown>)[key] = value;
    }
  }
  return sanitized;
}

/**
 * Alert-settings blob: AlertKeys are booleans, the quiet-window fields are
 * numbers — anything else is dropped. Written as one blob so the mounted
 * hooks pick the restored values up on their next load.
 */
async function restoreAlertSettings(input: unknown): Promise<void> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    const clean: Record<string, boolean | number> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
        clean[key] = value;
      }
    }
    if (Object.keys(clean).length > 0) {
      await AsyncStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(clean));
    }
  } catch {
    // Non-critical: the alert settings keep their current values.
  }
}

/** Journal: validate, dedupe by date (newest wins), cap, write in ONE pass. */
async function restoreJournal(input: unknown): Promise<void> {
  try {
    if (!Array.isArray(input)) return;
    const byDate = new Map<string, ComfortJournalEntry>();
    for (const row of input) {
      if (!isValidJournalEntry(row)) continue;
      const existing = byDate.get(row.date);
      if (!existing || row.at > existing.at) byDate.set(row.date, row);
    }
    if (!byDate.size) return;
    const next = [...byDate.values()]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-MAX_JOURNAL_ENTRIES);
    await AsyncStorage.setItem(COMFORT_JOURNAL_KEY, JSON.stringify(next));
  } catch {
    // Non-critical: the wear line simply stays uncalibrated.
  }
}

/** Custom alerts: saveCustomAlerts validates and applies the 5-rule cap itself. */
async function restoreCustomAlerts(input: unknown): Promise<void> {
  if (!Array.isArray(input)) return;
  await saveCustomAlerts(input as CustomAlertRule[]);
}

/** Widget cities: one validated upsert per entry (capped by the store). */
async function restoreWidgetCities(input: unknown): Promise<void> {
  if (!Array.isArray(input)) return;
  for (const row of input) {
    if (!isValidWidgetCityEntry(row)) continue;
    await saveWidgetCity(row.widgetId, row.city);
  }
}

/**
 * Picks a JSON file: a v2 bundle restores settings AND every data section
 * (each validated independently — a corrupt section is skipped, the rest
 * still apply); a v1 file (bare settings object, no version field) applies
 * settings only, exactly as before. Never throws.
 */
export async function importSettings(): Promise<ImportResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return { outcome: 'canceled' };

    const file = new File(result.assets[0].uri);
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { outcome: 'invalid' };
    }

    const input = parsed as Record<string, unknown>;
    if (input.version === 2) {
      if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) {
        return { outcome: 'invalid' };
      }
      const settings = sanitizeSettings(input.settings);
      await restoreAlertSettings(input.alertSettings);
      await restoreJournal(input.journal);
      await restoreCustomAlerts(input.customAlerts);
      await restoreWidgetCities(input.widgetCities);
      return { outcome: 'ok', settings };
    }

    return { outcome: 'ok', settings: sanitizeSettings(input) };
  } catch {
    return { outcome: 'invalid' };
  }
}
