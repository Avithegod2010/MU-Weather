import { useEffect, useState } from 'react';
import { fetchHourlyPrecipitationActuals } from '../api/providers';
import type { EnsembleSpread, GeoLocation } from '../api/types';
import {
  computeRainCalibrationSummary,
  rainVerificationDateRange,
  roundedRainCoord,
  type RainCalibrationSummary,
} from '../utils/rainCalibrationMath';
import {
  isRainObservationFetchDue,
  loadRainForecastLog,
  logRainForecast,
  markRainObservationFetchAttempt,
  saveRainObservations,
} from '../utils/rainCalibration';

interface CalibrationSnapshot {
  locationKey: string;
  summary: RainCalibrationSummary;
}

function locationKey(location: GeoLocation | null): string | null {
  if (!location) return null;
  return `${roundedRainCoord(location.latitude)}|${roundedRainCoord(location.longitude)}`;
}

/**
 * Locally records the latest ICON-EPS hourly rain share, then verifies eligible
 * hours against Archive API observations. Both operations are bounded,
 * location-scoped and best-effort; the home forecast never waits on the archive.
 */
export function useRainCalibration(
  location: GeoLocation | null,
  spread: EnsembleSpread | null,
  utcOffsetSeconds: number | null,
  refreshKey = 0,
): RainCalibrationSummary {
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
          await logRainForecast(spread, anchor, utcOffsetSeconds);
        }

        const entries = await loadRainForecastLog(anchor);
        const range = rainVerificationDateRange(entries);
        if (range && (await isRainObservationFetchDue(anchor))) {
          try {
            const observations = await fetchHourlyPrecipitationActuals(
              lat,
              lon,
              range.startDate,
              range.endDate,
            );
            if (observations && observations.length > 0) {
              await saveRainObservations(anchor, observations);
            }
          } finally {
            await markRainObservationFetchAttempt(anchor);
          }
        }
      } catch {
        // A network or persistence issue only delays calibration; it cannot block weather.
      }

      const currentEntries = await loadRainForecastLog(anchor);
      if (!cancelled) {
        setSnapshot({
          locationKey: key,
          summary: computeRainCalibrationSummary(currentEntries, anchor),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, key, spread, utcOffsetSeconds, refreshKey]);

  if (!location || !key) {
    return computeRainCalibrationSummary([], null);
  }
  return snapshot?.locationKey === key
    ? snapshot.summary
    : computeRainCalibrationSummary([], location);
}
