/// <reference types="jest" />
// yearDaysCache imports AsyncStorage at module scope; stub the storage surface
// these stamp tests never touch.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
import { localDateStampYear, utcDaysAgoStampYear } from '../utils/yearDaysCache';

describe('yearDaysCache stamps', () => {
  it('produces a local YYYY-MM-DD for today', () => {
    expect(localDateStampYear()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localDateStampYear()).toBe(
      new Date().toLocaleDateString('sv-SE'), // sv-SE formats as YYYY-MM-DD
    );
  });

  it('steps back exactly n UTC days', () => {
    const today = new Date();
    const expected = new Date(today.getTime() - 366 * 86_400_000).toISOString().slice(0, 10);
    expect(utcDaysAgoStampYear(366)).toBe(expected);
    expect(utcDaysAgoStampYear(0)).toBe(today.toISOString().slice(0, 10));
  });

  it('keeps the YYYY-MM-DD shape across month and year boundaries', () => {
    for (const n of [1, 28, 31, 366]) {
      expect(utcDaysAgoStampYear(n)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
