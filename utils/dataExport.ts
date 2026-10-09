import { File, Paths } from 'expo-file-system';
import { loadForecastLog } from './forecastLog';
import {
  buildForecastLogCsv,
  buildForecastLogJson,
  DEFAULT_FORECAST_LOG_EXPORT_OPTIONS,
} from './forecastLogExportFormat';
import type { ForecastLogExportOptions } from './forecastLogExportFormat';

export type DataExportFormat = 'csv' | 'json';

function todayStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${month}${day}`;
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
  format: DataExportFormat,
  options: ForecastLogExportOptions = DEFAULT_FORECAST_LOG_EXPORT_OPTIONS,
): Promise<ExportResult> {
  try {
    if (!options.includeTemperature && !options.includePrecipitation) return { status: 'empty' };
    const entries = await loadForecastLog();
    if (entries.length === 0) return { status: 'empty' };
    const content = format === 'csv'
      ? buildForecastLogCsv(entries, options)
      : buildForecastLogJson(entries, options);
    const file = new File(Paths.cache, `mu-weather-forecast-log-${todayStamp()}.${format}`);
    file.write(content);
    return { status: 'ok', uri: file.uri };
  } catch {
    return { status: 'error' };
  }
}
