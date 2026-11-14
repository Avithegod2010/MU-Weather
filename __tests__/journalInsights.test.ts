/// <reference types="jest" />
// comfortJournal imports AsyncStorage at module scope; jest-expo does not
// mock it for plain utils, so stub the storage surface the tests never touch.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
import { computeJournalInsights, MAX_JOURNAL_ENTRIES } from '../utils/comfortJournal';
import type { ComfortJournalEntry } from '../utils/comfortJournal';

let dayOffset = 0;
const entry = (rating: ComfortJournalEntry['rating'], tApparent: number | null, daysAgo = 0): ComfortJournalEntry => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${month}-${day}`,
    rating,
    tMax: 15,
    tMin: 5,
    tApparent,
    humidity: null,
    wind: null,
    at: dayOffset++,
  };
};

describe('computeJournalInsights', () => {
  it('reports zero stats for an empty journal', () => {
    const result = computeJournalInsights([]);
    expect(result.total).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.coldBoundaryC).toBeNull();
    expect(result.hotBoundaryC).toBeNull();
  });

  it('counts total entries', () => {
    expect(computeJournalInsights([entry('ok', 18), entry('cold', 8, 1)]).total).toBe(2);
  });

  it('counts a streak ending today', () => {
    const result = computeJournalInsights([entry('ok', 18), entry('ok', 17, 1), entry('cold', 8, 2)]);
    expect(result.streak).toBe(3);
  });

  it('counts a streak ending yesterday when today is unrated', () => {
    const result = computeJournalInsights([entry('ok', 18, 1), entry('ok', 17, 2)]);
    expect(result.streak).toBe(2);
  });

  it('breaks the streak at the first unrated day', () => {
    const result = computeJournalInsights([entry('ok', 18, 3), entry('ok', 17, 4)]);
    expect(result.streak).toBe(0);
  });

  it('derives the cold boundary from cold-rated apparent temperatures', () => {
    const result = computeJournalInsights([entry('cold', 8, 0), entry('cold', 12, 1), entry('ok', 20, 2)]);
    expect(result.coldBoundaryC).toBe(10); // mean of 8 and 12
    expect(result.coldSamples).toBe(2);
    expect(result.hotBoundaryC).toBeNull(); // no hot ratings
  });

  it('derives the hot boundary only with enough samples', () => {
    const result = computeJournalInsights([
      entry('hot', 30, 0), entry('hot', 32, 1), entry('hot', 28, 2),
      entry('ok', 20, 3), entry('ok', 21, 4),
    ]);
    expect(result.hotBoundaryC).toBe(30); // mean of 30, 32, 28
    expect(result.hotSamples).toBe(3);
    expect(result.coldBoundaryC).toBeNull();
  });

  it('ignores ratings without an apparent temperature', () => {
    const result = computeJournalInsights([entry('cold', null, 0), entry('cold', null, 1)]);
    expect(result.coldBoundaryC).toBeNull();
    expect(result.coldSamples).toBe(0);
    expect(result.total).toBe(2);
  });

  it('caps the streak scan at the journal size', () => {
    const long: ComfortJournalEntry[] = [];
    for (let i = 0; i < MAX_JOURNAL_ENTRIES + 5; i++) long.push(entry('ok', 18, i));
    const result = computeJournalInsights(long);
    expect(result.streak).toBe(MAX_JOURNAL_ENTRIES);
  });
});
