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
 * Outcome of {@link writeForecastLogExport}:
 * - `empty`: the forecast log has no entries (no file was written),
 * - `error`: reading, building or writing the file failed (the function never throws),
 * - `ok`: the file was written successfully; `uri` points at it.
 */
export type ExportResult =
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ok'; uri: string };

/**
 * Writes the forecast log to a dated file in the cache dir and returns an
 * {@link ExportResult}. Empty log → `{ status: 'empty' }` before any write is
 * attempted; any failure while reading, building or writing → `{ status: 'error' }`
 * (the function never throws).
 */
export async function writeForecastLogExport(
  format: DataExportFormat
): Promise<ExportResult> {
  try {
    const entries = await loadForecastLog();
    if (entries.length === 0) return { status: 'empty' };
    const content =
      format === 'csv' ? buildForecastLogCsv(entries) : buildForecastLogJson(entries);
    const file = new File(Paths.cache, `mu-weather-forecast-log-${todayStamp()}.${format}`);
    file.write(content);
    return { status: 'ok', uri: file.uri };
  } catch {
    return { status: 'error' };
  }
}
