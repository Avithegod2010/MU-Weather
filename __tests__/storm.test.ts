/// <reference types="jest" />
import { capeBand, peakCape } from '../utils/storm';
import type { HourPoint } from '../api/types';

const hour = (time: string, cape: number | null): HourPoint =>
  ({ time, cape }) as unknown as HourPoint;

describe('capeBand', () => {
  it('splits the J/kg bands at 1000 and 2500', () => {
    expect(capeBand(0)).toBe('low');
    expect(capeBand(999)).toBe('low');
    expect(capeBand(1000)).toBe('moderate');
    expect(capeBand(2499)).toBe('moderate');
    expect(capeBand(2500)).toBe('high');
    expect(capeBand(6000)).toBe('high');
  });
});

describe('peakCape', () => {
  it('finds the strongest hour inside the window', () => {
    const hourly = [
      hour('2026-10-24T10:00', 800),
      hour('2026-10-24T11:00', 1500),
      hour('2026-10-24T12:00', 2600),
      hour('2026-10-24T13:00', 1200),
    ];
    expect(peakCape(hourly, 4)).toEqual({ cape: 2600, time: '2026-10-24T12:00' });
  });

  it('ignores null hours', () => {
    const hourly = [hour('a', null), hour('b', null), hour('c', 700)];
    expect(peakCape(hourly)).toEqual({ cape: 700, time: 'c' });
  });

  it('returns null when no hour carries CAPE', () => {
    expect(peakCape([hour('a', null), hour('b', null)])).toBeNull();
    expect(peakCape([])).toBeNull();
  });

  it('only looks inside the requested window', () => {
    const hourly = [hour('in', 100), hour('out', 9999)];
    expect(peakCape(hourly, 1)).toEqual({ cape: 100, time: 'in' });
  });
});
