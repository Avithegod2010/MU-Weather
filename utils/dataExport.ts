import { File, Paths } from 'expo-file-system';
import { loadForecastLog, type ForecastLogEntry } from './forecastLog';

export type DataExportFormat = 'csv' | 'json';

function todayStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${month}${day}`;
}

/**
 * Machine-readable CSV: raw °C / mm values (unit-independent), header line first,
 * one row per logged prediction in log order (oldest first). No BOM, \n endings.
 */
export function buildForecastLogCsv(entries: ForecastLogEntry[]): string {
  const lines = ['date,t_max_c,t_min_c,precip_sum_mm'];
  for (const entry of entries) {
    lines.push(`${entry.date},${entry.tMax},${entry.tMin},${entry.precipSum}`);
  }
  return lines.join('\n');
}

/** Pretty-printed JSON array of the raw log entries. */
export function buildForecastLogJson(entries: ForecastLogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Writes the forecast log to a dated file in the cache dir and returns its URI.
 * Returns null when the log is empty (caller picks the messaging) and null (never
 * throws) on any failure while reading, building or writing the file.
 */
export async function writeForecastLogExport(
  format: DataExportFormat
): Promise<string | null> {
  try {
    const entries = await loadForecastLog();
    if (entries.length === 0) return null;
    const content =
      format === 'csv' ? buildForecastLogCsv(entries) : buildForecastLogJson(entries);
    const file = new File(Paths.cache, `mu-weather-forecast-log-${todayStamp()}.${format}`);
    file.write(content);
    return file.uri;
  } catch {
    return null;
  }
}
