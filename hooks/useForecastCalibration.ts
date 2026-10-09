import { useEffect, useState } from 'react';
import { fetchHourlyWeatherActuals } from '../api/providers';
import type { EnsembleSpread, GeoLocation } from '../api/types';
import {
  computeRainCalibrationSummary,
  rainVerificationDateRange,
  roundedRainCoord,
  type RainCalibrationSummary,
} from '../utils/rainCalibrationMath';
import {
  computeEnsembleCalibrationSummary,
  ensembleVerificationDateRange,
  type EnsembleCalibrationSummary,
} from '../utils/ensembleCalibrationMath';
import {
  isRainObservationFetchDue,
  loadRainForecastLog,
  logRainForecast,
  markRainObservationFetchAttempt,
  saveRainObservations,
} from '../utils/rainCalibration';
import {
  loadEnsembleCalibrationLog,
  logEnsembleCalibrationForecast,
  saveEnsembleCalibrationObservations,
} from '../utils/ensembleCalibration';

export interface ForecastCalibrationSummary {
  rain: RainCalibrationSummary;
  ensemble: EnsembleCalibrationSummary;
}

interface CalibrationSnapshot {
  locationKey: string;
  summary: ForecastCalibrationSummary;
}

function locationKey(location: GeoLocation | null): string | null {
  if (!location) return null;
  return `${roundedRainCoord(location.latitude)}|${roundedRainCoord(location.longitude)}`;
}

function mergeDateRanges(
  first: { startDate: string; endDate: string } | null,
  second: { startDate: string; endDate: string } | null,
): { startDate: string; endDate: string } | null {
  if (!first) return second;
  if (!second) return first;
  return {
    startDate: first.startDate < second.startDate ? first.startDate : second.startDate,
    endDate: first.endDate > second.endDate ? first.endDate : second.endDate,
  };
}

function emptySummary(location: GeoLocation | null): ForecastCalibrationSummary {
  return {
    rain: computeRainCalibrationSummary([], location),
    ensemble: computeEnsembleCalibrationSummary([], location),
  };
}

/**
 * Locally records ICON-EPS hourly rain probabilities and temperature/wind
 * distributions, then verifies eligible hours against the Archive API.
 * Logging is bounded and location-scoped; scoring waits for the usual archive
 * publication delay and requires many hourly cases across multiple dates.
 */
export function useForecastCalibration(
  location: GeoLocation | null,
  spread: EnsembleSpread | null,
  utcOffsetSeconds: number | null,
  refreshKey = 0,
): ForecastCalibrationSummary {
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;
  const key = locationKey(location);
  const [snapshot, setSnapshot] = useState<CalibrationSnapshot | null>(null);

  useEffect(() => {
    if (lat === null || lon === null || key === null) return;
    let cancelled = false;
    const anchor = { latitude: lat, longitude: lon };
    void (async () => {
      try {
        if (spread && utcOffsetSeconds !== null) {
          await Promise.all([
            logRainForecast(spread, anchor, utcOffsetSeconds),
            logEnsembleCalibrationForecast(spread, anchor, utcOffsetSeconds),
          ]);
        }

        const [rainEntries, ensembleEntries] = await Promise.all([
          loadRainForecastLog(anchor),
          loadEnsembleCalibrationLog(anchor),
        ]);
        const range = mergeDateRanges(
          rainVerificationDateRange(rainEntries),
          ensembleVerificationDateRange(ensembleEntries),
        );
        if (range && (await isRainObservationFetchDue(anchor))) {
          try {
            const observations = await fetchHourlyWeatherActuals(
              lat,
              lon,
              range.startDate,
              range.endDate,
            );
            if (observations && observations.length > 0) {
              await Promise.all([
                saveRainObservations(
                  anchor,
                  observations.flatMap((row) =>
                    row.precipitation === null ? [] : [{ time: row.time, precipitation: row.precipitation }],
                  ),
                ),
                saveEnsembleCalibrationObservations(anchor, observations),
              ]);
            }
          } finally {
            // Share the per-location Archive request TTL across all calibration
            // metrics, including failed/empty provider responses.
            await markRainObservationFetchAttempt(anchor);
          }
        }
      } catch {
        // Network/persistence issues only delay local calibration, never weather.
      }

      const [currentRainEntries, currentEnsembleEntries] = await Promise.all([
        loadRainForecastLog(anchor),
        loadEnsembleCalibrationLog(anchor),
      ]);
      if (!cancelled) {
        setSnapshot({
          locationKey: key,
          summary: {
            rain: computeRainCalibrationSummary(currentRainEntries, anchor),
            ensemble: computeEnsembleCalibrationSummary(currentEnsembleEntries, anchor),
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, key, spread, utcOffsetSeconds, refreshKey]);

  if (!location || !key) return emptySummary(null);
  return snapshot?.locationKey === key ? snapshot.summary : emptySummary(location);
}
