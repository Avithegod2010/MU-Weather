import { t } from './i18n';
import type { DayPoint, HourPoint } from '../api/types';

/**
 * Windshield-frost morning line: overnight low at or below freezing, humid
 * night air (>= 80% on the overnight hours) and a clear sky reads as frost
 * on the glass — "leave 5 min early to scrape". Appended to the existing
 * frost highlight's sentence when all three hold; the frost rule itself is
 * untouched.
 */
export function windshieldFrostLine(today: DayPoint | null, hourly: HourPoint[]): string | null {
  if (!today || today.tMin > 0) return null;
  const overnight = hourly.filter((hour) => !hour.isDay);
  if (!overnight.length) return null;
  const humidities = overnight.map((hour) => hour.humidity).filter((value) => value !== null);
  const avgHumidity = humidities.length
    ? humidities.reduce((sum, value) => sum + (value ?? 0), 0) / humidities.length
    : 0;
  const clearOvernight = overnight.every((hour) => [0, 1].includes(hour.weatherCode));
  if (avgHumidity < 80 || !clearOvernight) return null;
  return t('frost_windshield');
}
