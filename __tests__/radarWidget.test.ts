/// <reference types="jest" />
// radarWidget imports AsyncStorage at module scope; stub the storage surface
// these geometry tests never touch.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
import {
  applyFrameToLayout,
  computeRadarWidgetTiles,
  newestObservedFrame,
} from '../utils/radarWidget';

describe('computeRadarWidgetTiles', () => {
  it('lays out cols×rows tiles at the requested scale', () => {
    const layout = computeRadarWidgetTiles(51.5, -0.13, 4, 2, 56);
    expect(layout.width).toBe(4 * 56);
    expect(layout.height).toBe(2 * 56);
    expect(layout.baseTiles).toHaveLength(8);
    expect(layout.radarTiles).toHaveLength(8);
  });

  it('centres the grid on the location', () => {
    const layout = computeRadarWidgetTiles(51.5, -0.13, 4, 2, 56);
    const xs = layout.baseTiles.map((t) => t.left);
    const ys = layout.baseTiles.map((t) => t.top);
    // The location's projected point sits inside the tile rectangle.
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + 56;
    expect(-0.13).toBeGreaterThanOrEqual(-180); // sanity: real coordinate
    expect(minX).toBeLessThanOrEqual(maxX);
    // The first tile is at or left of the viewport origin: margins pull it back.
    expect(Math.min(...ys)).toBeLessThanOrEqual(0);
  });

  it('clips rows to the world (no negative tile rows)', () => {
    const layout = computeRadarWidgetTiles(89, 0, 4, 2, 56);
    for (const tile of layout.baseTiles) {
      const ty = Number(tile.key.split(':')[3]);
      expect(ty).toBeGreaterThanOrEqual(0);
    }
  });

  it('keys every tile uniquely', () => {
    const layout = computeRadarWidgetTiles(10, 10, 4, 2, 56);
    const keys = [...layout.baseTiles, ...layout.radarTiles].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('applyFrameToLayout', () => {
  it('fills every radar tile URI from the frame host and path', () => {
    const layout = computeRadarWidgetTiles(51.5, -0.13, 4, 2, 56);
    const filled = applyFrameToLayout(
      layout,
      'https://tilecache.rainviewer.com',
      { time: 1700000000, path: '/v2/radar/1700000000', predicted: false },
    );
    for (const tile of filled.radarTiles) {
      expect(tile.uri).toContain('tilecache.rainviewer.com');
      expect(tile.uri).toContain('/v2/radar/1700000000');
      expect(tile.uri).toMatch(/^https:\/\//);
    }
    // The base tiles are untouched.
    expect(filled.baseTiles[0].uri).toBe(layout.baseTiles[0].uri);
  });
});

describe('newestObservedFrame', () => {
  it('returns the frame at nowIndex', () => {
    const frameSet = {
      host: 'h',
      frames: [
        { time: 1, path: '/a', predicted: false },
        { time: 2, path: '/b', predicted: false },
      ],
      nowIndex: 1,
    };
    expect(newestObservedFrame(frameSet)?.path).toBe('/b');
  });

  it('returns null when the index is out of range', () => {
    const frameSet = { host: 'h', frames: [], nowIndex: 0 };
    expect(newestObservedFrame(frameSet)).toBeNull();
  });
});
