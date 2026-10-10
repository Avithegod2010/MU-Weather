import { aggregateWeatherImpacts } from './impactTimeline';
import type { ImpactBasis, ImpactSeverity, ImpactSignal, WeatherImpact } from './impactTimeline';
import type { TriggeredAlert } from './alertRules';
import { formatAlertEvidence } from './alertEvidence';
import { METEOALARM_CACHE_TTL_MS, type MeteoAlarmWarning } from './meteoalarm';
import { WEATHER_CACHE_FRESH_FOR_MS } from './freshnessPolicy';

export interface ImpactSourceLabels {
  forecast: string;
  official: string;
  observation?: string;
}

function hazardForAlert(key: string): string {
  if (key === 'rain' || key === 'raineasing') return 'rain';
  if (key === 'thunder' || key === 'cape') return 'storm';
  if (key === 'frost' || key === 'blackice' || key === 'coldsnap') return 'ice';
  if (key === 'heat' || key === 'tempdrop') return 'temperature';
  if (key === 'aqi' || key === 'pollen') return 'air-quality';
  return key;
}

/** Conservative English/Latin-script aliases; unknown feed text stays distinct. */
function hazardForOfficialWarning(warning: MeteoAlarmWarning): string {
  const text = `${warning.event} ${warning.headline}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(flood|rain|rainfall|precipitation|pluie|lluvia|regen|pioggia|chuva|hujan)\b/.test(text)) return 'rain';
  if (/\b(thunder|thunderstorm|storm|lightning|gewitter|tempete|tormenta|temporale|vihar)\b/.test(text)) return 'storm';
  if (/\b(wind|gale|gust|windig|vent|vento|viento|szel|angin)\b/.test(text)) return 'wind';
  if (/\b(snow|ice|icy|frost|glaze|neige|nieve|schnee|ghiaccio|eis|ijzel)\b/.test(text)) return 'ice';
  if (/\b(heat|hot|temperature|hitz|chaleur|calor|caldo|meleg)\b/.test(text)) return 'temperature';
  if (/\b(fog|mist|nebel|brouillard|niebla|nebbia|kod)\b/.test(text)) return 'fog';
  return `official:${warning.id}`;
}

function officialSeverity(severity: MeteoAlarmWarning['severity']): ImpactSeverity {
  if (severity === 'Severe' || severity === 'Extreme') return 'severe';
  if (severity === 'Moderate') return 'warning';
  return 'info';
}

/**
 * Build a combined current-impact timeline from app alert rules and active
 * official warnings. Each source is independently omitted after its freshness
 * window; forecast-rule timestamps denote the bundle update time, while
 * official warning intervals begin when they are observed and use CAP expiry.
 */
export function buildCurrentImpactTimeline(
  alerts: TriggeredAlert[],
  warnings: MeteoAlarmWarning[],
  fetchedAt: number | null,
  officialFetchedAt: number | null,
  now: number,
  labels: ImpactSourceLabels,
): WeatherImpact[] {
  if (!Number.isFinite(now)) return [];
  const freshTimestamp = (updatedAt: number | null, maxAge: number): number | null => {
    if (updatedAt === null || !Number.isFinite(updatedAt)) return null;
    const age = now - updatedAt;
    return age >= -5 * 60_000 && age < maxAge ? Math.min(updatedAt, now) : null;
  };
  const freshForecastAt = freshTimestamp(fetchedAt, WEATHER_CACHE_FRESH_FOR_MS);
  const freshOfficialAt = freshTimestamp(officialFetchedAt, METEOALARM_CACHE_TTL_MS);
  const signals: ImpactSignal[] = [];
  if (freshForecastAt !== null) {
    alerts.forEach((alert, index) => {
      if (
        !alert ||
        typeof alert.key !== 'string' ||
        typeof alert.title !== 'string' ||
        typeof alert.message !== 'string' ||
        (alert.severity !== 'info' && alert.severity !== 'warning' && alert.severity !== 'severe')
      ) return;
      const hazard = hazardForAlert(alert.key);
      const evidence = alert.evidence ? formatAlertEvidence(alert.evidence) : '';
      const evidenceSource = alert.evidence?.source ?? '';
      const basis: ImpactBasis = /current conditions?|current observation/i.test(evidenceSource)
        ? 'observed'
        : 'forecast-exposure';
      signals.push({
        id: `forecast:${alert.key}:${index}:${freshForecastAt}`,
        hazard,
        source: basis === 'observed'
          ? labels.observation ?? (evidenceSource || labels.forecast)
          : labels.forecast,
        basis,
        severity: alert.severity,
        startsAt: freshForecastAt,
        endsAt: freshForecastAt,
        sourceUpdatedAt: freshForecastAt,
        title: alert.title,
        expected: alert.message,
        whyItMatters: evidence ? `${alert.message} · ${evidence}` : alert.message,
        action: alert.message,
        ...(alert.severity === 'severe' ? { safetyCopy: alert.message } : {}),
      });
    });
  }

  if (freshOfficialAt !== null) {
    warnings.forEach((warning) => {
      const expiresAt = Date.parse(warning.expires);
      if (!Number.isFinite(expiresAt) || expiresAt <= now || !warning.id) return;
      const severity = officialSeverity(warning.severity);
      const title = warning.event || warning.headline || warning.id;
      const copy = warning.description || warning.headline || title;
      const instruction = warning.instruction || '';
      signals.push({
        id: `official:${warning.id}`,
        hazard: hazardForOfficialWarning(warning),
        source: labels.official,
        basis: 'official-warning',
        severity,
        startsAt: now,
        endsAt: expiresAt,
        sourceUpdatedAt: freshOfficialAt,
        title,
        expected: copy,
        whyItMatters: copy,
        action: instruction || copy,
        ...(severity === 'severe' && (instruction || copy)
          ? { safetyCopy: instruction || copy }
          : {}),
      });
    });
  }
  const severityRank: Record<ImpactSeverity, number> = { info: 0, warning: 1, severe: 2 };
  return aggregateWeatherImpacts(signals).sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity] || a.startsAt - b.startsAt,
  );
}
