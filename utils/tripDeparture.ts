import type { DayPoint } from '../api/types';
import type { OutdoorPreferences } from './outdoorPlanPolicy';

export type TripRiskMetric = 'rain' | 'temperature' | 'wind';

export interface TripDepartureSuggestion {
  startIndex: number;
  startDate: string;
  /** Only metrics that improve; all other scored risks are no worse. */
  lowerRiskMetrics: TripRiskMetric[];
}

interface TripRiskVector {
  rain: number;
  temperature: number;
  wind: number;
}

function riskForWindow(days: DayPoint[], preferences: OutdoorPreferences): TripRiskVector | null {
  if (!days.length) return null;
  const risk: TripRiskVector = { rain: 0, temperature: 0, wind: 0 };
  for (const day of days) {
    if (
      !day ||
      !Number.isFinite(day.precipProbabilityMax) ||
      !Number.isFinite(day.tMin) ||
      !Number.isFinite(day.tMax) ||
      !Number.isFinite(day.windMax)
    ) return null;
    risk.rain += Math.max(0, day.precipProbabilityMax - preferences.maxRainProbability);
    risk.temperature +=
      Math.max(0, preferences.minTemperatureC - day.tMin) +
      Math.max(0, day.tMax - preferences.maxTemperatureC);
    risk.wind += Math.max(0, day.windMax - preferences.maxWindKmh);
  }
  return risk;
}

/**
 * Find a nearby trip window that is no worse for rain, temperature and wind,
 * and strictly better for at least one. The policy intentionally avoids hidden
 * weights that would trade a hotter trip for less rain (or vice versa).
 */
export function findLowerRiskTripDeparture(
  days: DayPoint[],
  plannedStartIndex: number,
  tripLength: number,
  preferences: OutdoorPreferences,
  maxShiftDays = 3,
): TripDepartureSuggestion | null {
  if (
    !Array.isArray(days) ||
    !Number.isInteger(plannedStartIndex) ||
    !Number.isInteger(tripLength) ||
    tripLength < 1 ||
    !Number.isInteger(maxShiftDays) ||
    maxShiftDays < 1 ||
    plannedStartIndex < 0 ||
    plannedStartIndex + tripLength > days.length
  ) return null;

  const plannedDays = days.slice(plannedStartIndex, plannedStartIndex + tripLength);
  const plannedRisk = riskForWindow(plannedDays, preferences);
  if (!plannedRisk) return null;

  const candidates: TripDepartureSuggestion[] = [];
  const firstCandidate = Math.max(1, plannedStartIndex - maxShiftDays);
  const lastCandidate = Math.min(days.length - tripLength, plannedStartIndex + maxShiftDays);
  for (let startIndex = firstCandidate; startIndex <= lastCandidate; startIndex++) {
    if (startIndex === plannedStartIndex) continue;
    const risk = riskForWindow(days.slice(startIndex, startIndex + tripLength), preferences);
    if (!risk) continue;
    const lowerRiskMetrics = (['rain', 'temperature', 'wind'] as const).filter(
      (metric) => risk[metric] < plannedRisk[metric] - 1e-6,
    );
    const noWorse = (['rain', 'temperature', 'wind'] as const).every(
      (metric) => risk[metric] <= plannedRisk[metric] + 1e-6,
    );
    if (noWorse && lowerRiskMetrics.length > 0) {
      const startDate = days[startIndex]?.date;
      if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        candidates.push({ startIndex, startDate, lowerRiskMetrics });
      }
    }
  }

  candidates.sort(
    (a, b) =>
      b.lowerRiskMetrics.length - a.lowerRiskMetrics.length ||
      Math.abs(a.startIndex - plannedStartIndex) - Math.abs(b.startIndex - plannedStartIndex) ||
      a.startIndex - b.startIndex,
  );
  return candidates[0] ?? null;
}
