/**
 * Web-Mercator tile math for the built-in radar renderer (components/RadarTileMap).
 *
 * Deliberately a pure module - no React, no imports - so the projection can be
 * checked from a plain Node script and reused without pulling in the renderer.
 * All world coordinates are measured in TILES (fractional) at the given integer
 * zoom; multiply by the tile size for pixels:
 *
 *   worldX = (lon + 180) / 360 * 2^z
 *   worldY = (1 - ln(tan(lat) + 1 / cos(lat)) / pi) / 2 * 2^z
 *
 * Longitude wraps (tile columns are taken modulo the tile count); latitude is
 * clamped inside the Mercator range, which is infinite at the poles.
 */

/** Web-Mercator cuts off here (the projection diverges towards the poles). */
export const MAX_MERCATOR_LAT = 85.05112878;

/** Clamp a latitude into the projectable range. NaN maps to the equator. */
export function clampMercatorLat(latitude: number): number {
  if (Number.isNaN(latitude)) return 0;
  if (latitude > MAX_MERCATOR_LAT) return MAX_MERCATOR_LAT;
  if (latitude < -MAX_MERCATOR_LAT) return -MAX_MERCATOR_LAT;
  return latitude;
}

/** Tiles per axis at an integer zoom: 2^zoom. */
export function tileCount(zoom: number): number {
  return 2 ** Math.round(zoom);
}

/** Fractional world X (tiles) for a longitude. Non-finite input maps to Greenwich. */
export function worldX(longitude: number, zoom: number): number {
  const lon = Number.isFinite(longitude) ? longitude : 0;
  return ((lon + 180) / 360) * tileCount(zoom);
}

/** Fractional world Y (tiles) for a latitude, clamped to the Mercator range. */
export function worldY(latitude: number, zoom: number): number {
  const lat = clampMercatorLat(latitude);
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * tileCount(zoom);
}

/**
 * Wrap a possibly out-of-range tile column into [0, count) - the world repeats
 * horizontally, so a viewport that straddles the antimeridian keeps drawing.
 */
export function wrapTileX(tileX: number, zoom: number): number {
  const count = tileCount(zoom);
  return ((Math.round(tileX) % count) + count) % count;
}
