/// <reference types="jest" />
import { DEFAULT_ALERT_SETTINGS, evaluateAlerts, type AlertSettings } from '../utils/alertRules';
import { computeNowcast } from '../utils/nowcast';
import type { CurrentConditions, HourPoint, MinutelyPoint } from '../api/types';

const settings: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, rain: true, thunder: false };

const current: CurrentConditions = {
  temperature: 9,
  apparentTemperature: 7,
  humidity: 82,
  isDay: true,
  weatherCode: 3,
  pressure: 1008,
  cloudCover: 90,
  windSpeed: 12,
  windDirection: 180,
  windGusts: 20,
  precipitation: 0,
  dewPoint: 6,
  visibility: null,
  pressureTrend: null,
};

const hour = (time: string, precipProbability: number): HourPoint =>
  ({
    time,
    temperature: 9,
    apparent: 7,
    weatherCode: 61,
    precipProbability,
    precipitation: 0.6,
    isDay: true,
    isNow: false,
    dewPoint: 6,
    visibility: null,
    windSpeed: 12,
    windGusts: 20,
    windDirection: 180,
    uvIndex: null,
  }) as unknown as HourPoint;

const hourly = [0, 1, 2, 3].map((i) => hour(`2026-10-24T${10 + i}:00`, 70));

const minute = (index: number, precipitation: number): MinutelyPoint =>
  ({ time: `2026-10-24T10:${String(index * 15).padStart(2, '0')}`, precipitation }) as unknown as MinutelyPoint;

const minutelyStartingIn = (index: number): MinutelyPoint[] =>
  Array.from({ length: 8 }, (_, i) => minute(i, i < index ? 0 : 0.4));

describe('rain alert with minute-level nowcast', () => {
  it('prefers exact minutes when rain starts within the hour', () => {
    const nowcast = computeNowcast(minutelyStartingIn(1)); // 15 min
    const fired = evaluateAlerts(settings, current, hourly, null, null, { nowcast });
    const rain = fired.filter((a) => a.key === 'rain');
    expect(rain).toHaveLength(1);
    expect(rain[0].title).toBe('Rain starting soon');
    expect(rain[0].message).toContain('15');
    expect(rain[0].severity).toBe('warning');
  });

  it('keeps the hourly phrasing beyond the 60-minute nowcast window', () => {
    const nowcast = computeNowcast(minutelyStartingIn(6)); // 90 min
    const fired = evaluateAlerts(settings, current, hourly, null, null, { nowcast });
    const rain = fired.find((a) => a.key === 'rain');
    expect(rain?.title).toBe('Rain expected');
    expect(rain?.message).toContain('% chance.');
  });

  it('keeps the severe wording when the hourly peak is severe', () => {
    const severeHourly = [hour('2026-10-24T10:00', 92)];
    const nowcast = computeNowcast(minutelyStartingIn(1));
    const fired = evaluateAlerts(settings, current, severeHourly, null, null, { nowcast });
    const rain = fired.find((a) => a.key === 'rain');
    expect(rain?.title).toBe('Heavy rainfall expected');
    expect(rain?.severity).toBe('severe');
  });

  it('falls back to the hourly phrasing without minutely data', () => {
    const fired = evaluateAlerts(settings, current, hourly, null, null, {});
    const rain = fired.find((a) => a.key === 'rain');
    expect(rain?.title).toBe('Rain expected');
  });
});
