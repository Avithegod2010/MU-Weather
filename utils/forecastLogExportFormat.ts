import type { ForecastLogEntry } from './forecastLog';

export interface ForecastLogExportOptions {
  includeTemperature: boolean;
  includePrecipitation: boolean;
}

export const DEFAULT_FORECAST_LOG_EXPORT_OPTIONS: ForecastLogExportOptions = {
  includeTemperature: true,
  includePrecipitation: true,
};

function timezoneSummary(entries: ForecastLogEntry[]): string {
  const zones = [...new Set(entries.map((entry) => entry.timezone || 'unknown'))].sort();
  if (zones.length === 0) return 'unknown';
  return zones.length === 1 ? zones[0] : 'mixed';
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV includes only chosen categories and carries explicit schema/timezone metadata. */
export function buildForecastLogCsv(
  entries: ForecastLogEntry[],
  options: ForecastLogExportOptions = DEFAULT_FORECAST_LOG_EXPORT_OPTIONS,
  exportedAt = Date.now(),
): string {
  if (!options.includeTemperature && !options.includePrecipitation) return '';
  const zones = timezoneSummary(entries);
  const categories = [
    ...(options.includeTemperature ? ['temperature_c'] : []),
    ...(options.includePrecipitation ? ['precipitation_mm'] : []),
  ].join(',');
  const lines = [
    '# schema_version=1',
    `# exported_at=${new Date(exportedAt).toISOString()}`,
    `# time_zone=${zones}`,
    '# coordinates_included=false',
    `# categories=${categories}`,
    [
      'date',
      'timezone',
      ...(options.includeTemperature ? ['t_max_c', 't_min_c'] : []),
      ...(options.includePrecipitation ? ['precip_sum_mm'] : []),
    ].join(','),
  ];
  for (const entry of entries) {
    lines.push([
      csvCell(entry.date),
      csvCell(entry.timezone || 'unknown'),
      ...(options.includeTemperature ? [entry.tMax, entry.tMin] : []),
      ...(options.includePrecipitation ? [entry.precipSum] : []),
    ].join(','));
  }
  return lines.join('\n');
}

/** JSON envelope is versioned; coordinates are excluded by construction. */
export function buildForecastLogJson(
  entries: ForecastLogEntry[],
  options: ForecastLogExportOptions = DEFAULT_FORECAST_LOG_EXPORT_OPTIONS,
  exportedAt = Date.now(),
): string {
  if (!options.includeTemperature && !options.includePrecipitation) return '';
  return JSON.stringify({
    schemaVersion: 1,
    metadata: {
      exportedAt: new Date(exportedAt).toISOString(),
      timeZone: timezoneSummary(entries),
      coordinatesIncluded: false,
      categories: [
        ...(options.includeTemperature ? ['temperature_c'] : []),
        ...(options.includePrecipitation ? ['precipitation_mm'] : []),
      ],
    },
    forecasts: entries.map((entry) => ({
      date: entry.date,
      timezone: entry.timezone || 'unknown',
      ...(options.includeTemperature ? { temperatureC: { max: entry.tMax, min: entry.tMin } } : {}),
      ...(options.includePrecipitation ? { precipitationMm: entry.precipSum } : {}),
    })),
  }, null, 2);
}
