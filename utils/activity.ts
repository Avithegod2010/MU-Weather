import { describeWmo } from './wmo';
import type { WeatherBundle } from '../api/types';

export type ActivityKey = 'running' | 'cycling' | 'laundry' | 'stargazing' | 'photography';

export interface ActivityScore {
  key: ActivityKey;
  label: string;
  score: number;
  verdict: 'Great' | 'Okay' | 'Poor';
  reason: string;
}

function clamp(value: number, min = 5, max = 95): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function verdictFor(score: number): ActivityScore['verdict'] {
  if (score >= 70) return 'Great';
  if (score >= 45) return 'Okay';
  return 'Poor';
}

function tempScore(temp: number, idealMin: number, idealMax: number, falloff: number): number {
  if (temp >= idealMin && temp <= idealMax) return 100;
  const distance = temp < idealMin ? idealMin - temp : temp - idealMax;
  return Math.max(0, 100 - (distance / falloff) * 100);
}

export function computeActivities(data: WeatherBundle): ActivityScore[] {
  const current = data.current;
  const next12 = data.hourly.slice(0, 12);
  const avgPrecip = next12.length
    ? next12.reduce((sum, hour) => sum + hour.precipProbability, 0) / next12.length
    : 0;
  const maxPrecip = next12.reduce((max, hour) => Math.max(max, hour.precipProbability), 0);
  const anyWetHour = next12.some((hour) => hour.precipProbability >= 50);

  const scores: ActivityScore[] = [];

  const runningScore =
    tempScore(current.apparentTemperature, 6, 24, 14) * 0.5 +
    (100 - Math.min(avgPrecip * 1.6, 100)) * 0.3 +
    (100 - Math.min((current.windSpeed / 30) * 100, 100)) * 0.2;
  scores.push({
    key: 'running',
    label: 'Running',
    score: clamp(runningScore),
    verdict: verdictFor(clamp(runningScore)),
    reason:
      avgPrecip >= 50
        ? 'Rain likely during the day'
        : current.apparentTemperature > 30
          ? 'Too hot for a comfortable run'
          : current.apparentTemperature < 0
            ? 'Freezing out there'
            : 'Conditions look good for a run',
  });

  const cyclingScore =
    tempScore(current.apparentTemperature, 10, 28, 14) * 0.4 +
    (100 - Math.min(avgPrecip * 1.8, 100)) * 0.3 +
    (100 - Math.min((current.windSpeed / 22) * 100, 100)) * 0.3;
  scores.push({
    key: 'cycling',
    label: 'Cycling',
    score: clamp(cyclingScore),
    verdict: verdictFor(clamp(cyclingScore)),
    reason:
      current.windSpeed >= 25
        ? 'Strong winds will fight you'
        : avgPrecip >= 50
          ? 'Wet roads likely'
          : 'Good wheels-out weather',
  });

  const dryingScore =
    (100 - Math.min(maxPrecip * 1.5, 100)) * 0.55 +
    (100 - Math.min((current.humidity / 80) * 100, 100)) * 0.25 +
    (current.windSpeed >= 4 && current.windSpeed <= 30 ? 100 : 55) * 0.2;
  scores.push({
    key: 'laundry',
    label: 'Laundry drying',
    score: clamp(dryingScore),
    verdict: verdictFor(clamp(dryingScore)),
    reason:
      anyWetHour
        ? 'Rain may pass through - keep an eye out'
        : current.humidity > 80
          ? 'Humid air means slow drying'
          : 'Good drying conditions',
  });

  const nightHours = data.hourly.filter((hour, index) => index >= 6 && !hour.isDay);
  const nightClear = nightHours.length
    ? nightHours.filter((hour) => {
        const { condition } = describeWmo(hour.weatherCode);
        return condition === 'clear' || condition === 'partlyCloudy';
      }).length / nightHours.length
    : 0;
  const stargazingScore =
    nightClear * 100 * 0.6 +
    (100 - Math.min((data.daily[0]?.precipProbabilityMax ?? 0) * 1.2, 100)) * 0.4;
  scores.push({
    key: 'stargazing',
    label: 'Stargazing',
    score: clamp(stargazingScore),
    verdict: verdictFor(clamp(stargazingScore)),
    reason:
      nightClear >= 0.7
        ? 'Clear skies expected tonight'
        : nightClear >= 0.4
          ? 'Some clouds passing through tonight'
          : 'Cloudy skies will hide the stars',
  });

  const photoScore =
    (current.cloudCover >= 15 && current.cloudCover <= 75 ? 100 : 55) * 0.5 +
    (100 - Math.min(avgPrecip * 1.4, 100)) * 0.3 +
    (current.visibility === null || current.visibility >= 8000 ? 100 : 55) * 0.2;
  scores.push({
    key: 'photography',
    label: 'Photography',
    score: clamp(photoScore),
    verdict: verdictFor(clamp(photoScore)),
    reason:
      current.cloudCover >= 15 && current.cloudCover <= 75
        ? 'Dramatic skies in the forecast'
        : current.cloudCover > 75
          ? 'Flat grey light today'
          : 'Clear but plain skies',
  });

  return scores;
}
