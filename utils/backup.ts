import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { DEFAULT_SETTINGS, type AppSettings } from '../hooks/useSettings';

export type ImportResult =
  | { outcome: 'canceled' }
  | { outcome: 'invalid' }
  | { outcome: 'ok'; settings: Partial<AppSettings> };

function todayStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${month}${day}`;
}

/** Writes every current setting to a dated JSON file in the cache dir; returns its URI. */
export function exportSettings(settings: AppSettings): string {
  const file = new File(Paths.cache, `mu-weather-backup-${todayStamp()}.json`);
  file.write(JSON.stringify(settings, null, 2));
  return file.uri;
}

/**
 * Picks a JSON file and sanitizes it against DEFAULT_SETTINGS: unknown keys are
 * dropped and wrong-typed values are rejected per key, so a hostile or stale
 * backup can only ever produce a valid Partial<AppSettings>. Never throws.
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
    const sanitized: Partial<AppSettings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>) {
      const expected = DEFAULT_SETTINGS[key];
      const value = input[key];
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
    return { outcome: 'ok', settings: sanitized };
  } catch {
    return { outcome: 'invalid' };
  }
}
