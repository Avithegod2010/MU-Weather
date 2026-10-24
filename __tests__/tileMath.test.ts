/// <reference types="jest" />
import {
  MAX_MERCATOR_LAT,
  clampMercatorLat,
  tileCount,
  worldX,
  worldY,
  wrapTileX,
} from '../utils/tileMath';

describe('clampMercatorLat', () => {
  it('keeps ordinary latitudes unchanged', () => {
    expect(clampMercatorLat(0)).toBe(0);
    expect(clampMercatorLat(51.5)).toBe(51.5);
    expect(clampMercatorLat(-33.9)).toBe(-33.9);
  });

  it('clamps into the Mercator range', () => {
    expect(clampMercatorLat(89.9)).toBe(MAX_MERCATOR_LAT);
    expect(clampMercatorLat(-89.9)).toBe(-MAX_MERCATOR_LAT);
    expect(clampMercatorLat(90)).toBe(MAX_MERCATOR_LAT);
    expect(clampMercatorLat(-90)).toBe(-MAX_MERCATOR_LAT);
  });

  it('maps NaN to the equator', () => {
    expect(clampMercatorLat(NaN)).toBe(0);
  });
});

describe('tileCount', () => {
  it('is 2^zoom', () => {
    expect(tileCount(0)).toBe(1);
    expect(tileCount(3)).toBe(8);
    expect(tileCount(7)).toBe(128);
  });
});

describe('worldX / worldY', () => {
  it('Greenwich and the equator project to half the world', () => {
    expect(worldX(0, 3)).toBeCloseTo(4, 10);
    expect(worldY(0, 3)).toBeCloseTo(4, 10);
    expect(worldX(0, 0)).toBeCloseTo(0.5, 10);
  });

  it('longitudes map linearly', () => {
    expect(worldX(-180, 3)).toBeCloseTo(0, 10);
    expect(worldX(180, 3)).toBeCloseTo(8, 10);
    expect(worldX(90, 3)).toBeCloseTo(6, 10);
  });

  it('non-finite longitude falls back to Greenwich', () => {
    expect(worldX(NaN, 3)).toBeCloseTo(4, 10);
    expect(worldX(Infinity, 3)).toBeCloseTo(4, 10);
  });

  it('latitudes saturate at the Mercator cutoff instead of diverging', () => {
    expect(worldY(90, 3)).toBeCloseTo(0, 6);
    expect(worldY(-90, 3)).toBeCloseTo(8, 6);
  });
});

describe('wrapTileX', () => {
  it('wraps columns into [0, count)', () => {
    expect(wrapTileX(8, 3)).toBe(0);
    expect(wrapTileX(-1, 3)).toBe(7);
    expect(wrapTileX(9, 3)).toBe(1);
    expect(wrapTileX(3, 3)).toBe(3);
  });
});
