import { aggregateWeatherImpacts } from './impactTimeline';
import type { ImpactSeverity, ImpactSignal, WeatherImpact } from './impactTimeline';

/** Minimal history shape, kept independent of AsyncStorage and React Native. */
export interface AlertHistorySignalInput {
  key: string;
  title: string;
  message: string;
  severity: ImpactSeverity;
  city?: string;
  at: number;
}

/**
 * Group repeated delivered notifications into a compact history timeline.
 * History rows have point timestamps (not forecast validity intervals), so
 * grouping only smooths repeated notifications for the same rule and city.
 */
export function aggregateAlertHistoryImpacts(
  entries: AlertHistorySignalInput[],
): WeatherImpact[] {
  const signals: ImpactSignal[] = [];
  entries.forEach((entry, index) => {
    if (
      !entry ||
      typeof entry.key !== 'string' ||
      !entry.key ||
      typeof entry.title !== 'string' ||
      !entry.title ||
      typeof entry.message !== 'string' ||
      !entry.message ||
      (entry.severity !== 'info' && entry.severity !== 'warning' && entry.severity !== 'severe') ||
      !Number.isFinite(entry.at)
    ) {
      return;
    }
    const scope = entry.city?.trim() || 'current-location';
    const at = entry.at;
    signals.push({
      id: `history:${scope}:${entry.key}:${at}:${index}`,
      // Different alert rules and cities are not assumed to be the same event.
      hazard: `${scope}:${entry.key}`,
      source: entry.city?.trim() || 'current-location',
      severity: entry.severity,
      startsAt: at,
      endsAt: at,
      sourceUpdatedAt: at,
      title: entry.title,
      expected: entry.message,
      whyItMatters: entry.message,
      action: entry.message,
      ...(entry.severity === 'severe' ? { safetyCopy: entry.message } : {}),
    });
  });
  return aggregateWeatherImpacts(signals);
}
