/// <reference types="jest" />
import { inCanadaArea, parseCanadaAlerts } from '../api/canada';

const body = [
  {
    displayName: 'The Forks',
    alert: {},
  },
  {
    displayName: 'Winnipeg',
    alert: {
      zoneId: 'loc1-44',
      alerts: [
        {
          type: 'warning',
          bannerText: 'WINTER STORM WARNING IN EFFECT',
          colour: 'red',
          text: '<b>Heavy snow</b> expected. Total amounts 25&nbsp;cm &amp; drifting.',
          alertCode: 'WSW',
          issueTime: '2026-11-12T10:00:00.000Z',
          expiryTime: '2026-11-13T02:00:00.000Z',
        },
        {
          type: 'advisory',
          bannerText: 'SNOWFALL ADVISORY IN EFFECT',
          colour: 'weird-colour',
          alertCode: 'WSA',
          issueTime: '2026-11-12T09:00:00.000Z',
          eventEndTime: '2026-11-12T20:00:00.000Z',
        },
        {
          bannerText: 'WINTER STORM WARNING IN EFFECT',
          alertCode: 'WSW',
          issueTime: '2026-11-12T10:00:00.000Z',
        },
      ],
    },
  },
];

describe('parseCanadaAlerts', () => {
  it('returns [] for non-arrays and empty alert objects', () => {
    expect(parseCanadaAlerts(null, null)).toEqual([]);
    expect(parseCanadaAlerts([{ displayName: 'X', alert: {} }], null)).toEqual([]);
    expect(parseCanadaAlerts([{ displayName: 'X' }], null)).toEqual([]);
  });

  it('uses the first location whose zone carries alerts', () => {
    const rows = parseCanadaAlerts(body, null);
    expect(rows).toHaveLength(2);
    expect(rows[0].areaDesc).toBe('Winnipeg');
  });

  it('maps banner text, strips tags and strips "IN EFFECT"', () => {
    const rows = parseCanadaAlerts(body, null);
    expect(rows[0].headline).toBe('WINTER STORM WARNING IN EFFECT');
    expect(rows[0].event).toBe('Winter storm warning');
    expect(rows[0].description).toBe('Heavy snow expected. Total amounts 25 cm & drifting.');
  });

  it('maps colours to severity with a type fallback for unknown colours', () => {
    const rows = parseCanadaAlerts(body, null);
    expect(rows[0].severity).toBe('Extreme');
    expect(rows[1].severity).toBe('Moderate');
  });

  it('prefers expiryTime and falls back to eventEndTime; drops unparseable dates', () => {
    const rows = parseCanadaAlerts(body, null);
    expect(rows[0].expires).toBe('2026-11-13T02:00:00.000Z');
    expect(rows[1].expires).toBe('2026-11-12T20:00:00.000Z');
  });

  it('dedupes identical alertCode|issueTime|headline rows', () => {
    const rows = parseCanadaAlerts(body, null);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(rows.length);
  });

  it('sorts by severity then expiry', () => {
    const rows = parseCanadaAlerts(body, null);
    expect(rows[0].severity).toBe('Extreme');
    expect(rows[1].severity).toBe('Moderate');
  });
});

describe('inCanadaArea', () => {
  it('gates on the CA country code', () => {
    expect(inCanadaArea({ latitude: 49.9, longitude: -97.1, countryCode: 'CA' })).toBe(true);
    expect(inCanadaArea({ latitude: 49.9, longitude: -97.1, countryCode: 'US' })).toBe(false);
    expect(inCanadaArea({ latitude: 49.9, longitude: -97.1 })).toBe(false);
  });
});
