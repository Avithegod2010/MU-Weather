/// <reference types="jest" />
import { parseAlertPolygon } from '../api/nws';

describe('parseAlertPolygon', () => {
  it('reads a GeoJSON Polygon ring and swaps to [lat, lon]', () => {
    const feature = {
      geometry: { type: 'Polygon', coordinates: [[[-97, 49], [-96, 49], [-96, 50], [-97, 50], [-97, 49]]] },
    };
    expect(parseAlertPolygon(feature)).toEqual([
      [49, -97], [49, -96], [50, -96], [50, -97], [49, -97],
    ]);
  });

  it('takes the largest ring of a Polygon', () => {
    const feature = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-97, 49], [-96.9, 49], [-96.9, 49.1], [-97, 49]],
          [[-98, 48], [-95, 48], [-95, 51], [-98, 51], [-98, 48]],
        ],
      },
    };
    const pts = parseAlertPolygon(feature)!;
    expect(pts.length).toBe(5);
    expect(pts[0]).toEqual([48, -98]);
  });

  it('takes the first ring per polygon of a MultiPolygon', () => {
    const feature = {
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[-100, 45], [-99, 45], [-99, 46], [-100, 46], [-100, 45]]],
          [[[-101, 47], [-100, 47], [-100, 48], [-101, 48], [-101, 47]]],
        ],
      },
    };
    const pts = parseAlertPolygon(feature)!;
    expect(pts.length).toBe(5);
    expect(pts[0]).toEqual([45, -100]);
  });

  it('falls back to the geocode policy polygon ("lon,lat" string)', () => {
    const feature = { properties: { geocode: { policies: [{ polygon: '-97,49 -96,49 -96,50' }] } } };
    expect(parseAlertPolygon(feature)).toEqual([[49, -97], [49, -96], [50, -96]]);
  });

  it('returns null without any shape', () => {
    expect(parseAlertPolygon({})).toBeNull();
    expect(parseAlertPolygon({ geometry: { type: 'Point', coordinates: [1, 2] } })).toBeNull();
    expect(parseAlertPolygon(null)).toBeNull();
  });
});
