/**
 * RainViewer weather-radar frames (keyless public API, verified live 2026-09-24).
 *
 * `weather-maps.json` returns `{ version, generated, host, radar: { past, nowcast } }`
 * where each frame is `{ time (unix seconds, UTC), path }`. The tile URL is built
 * as `{host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png` - RainViewer serves
 * radar tiles up to zoom 7 only, so the radar layer is clamped to RADAR_MAX_ZOOM
 * (higher zooms get an empty layer rather than an error).
 *
 * The base map is a keyless raster style (CARTO dark). Both layers are drawn by
 * the app's own slippy-map renderer (components/RadarTileMap) from Web-Mercator
 * math over plain `Image` tiles - no native map SDK, no Google Maps API key, and
 * no billing account anywhere in the radar stack.
 */

export interface RadarFrame {
  /** Frame time, unix SECONDS (UTC) as served by the API. */
  time: number;
  /** Tile path prefix, e.g. `/v2/radar/1790198400`. */
  path: string;
  /** true for nowcast frames (short-range prediction past the newest observation). */
  predicted: boolean;
}

export interface RadarFrameSet {
  /** Tile host from the API response (`https://tilecache.rainviewer.com`). */
  host: string;
  /** Past frames (oldest first) followed by any nowcast frames. */
  frames: RadarFrame[];
  /** Index of the newest observed frame - what "Now" means in the timeline. */
  nowIndex: number;
}

const RADAR_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
/** RainViewer radar tiles are only served up to this zoom level. */
export const RADAR_MAX_ZOOM = 7;
export const RADAR_TILE_SIZE = 256;
/** RainViewer colour scheme 2 = "Universal Blue" - readable over a dark base map. */
export const RADAR_COLOR_SCHEME = 2;
/** `{smooth}_{snow}`: smoothed tiles with snow drawn in its own colours. */
export const RADAR_TILE_OPTIONS = '1_1';
/** Keyless dark raster base map (CARTO basemaps over OpenStreetMap data). */
export const BASE_TILE_URL = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
/** Attribution shown over the map - required by both tile providers. */
export const RADAR_ATTRIBUTION = 'RainViewer · OpenStreetMap contributors / CARTO';

/** Tile template for one radar frame (consumed by components/RadarTileMap). */
export function radarTileUrl(host: string, frame: RadarFrame): string {
  return `${host}${frame.path}/${RADAR_TILE_SIZE}/{z}/{x}/{y}/${RADAR_COLOR_SCHEME}/${RADAR_TILE_OPTIONS}.png`;
}

interface RawFrame {
  time?: unknown;
  path?: unknown;
}

interface RawRadarFile {
  host?: unknown;
  radar?: {
    past?: unknown;
    nowcast?: unknown;
  };
}

function parseFrames(value: unknown, predicted: boolean): RadarFrame[] {
  if (!Array.isArray(value)) return [];
  const frames: RadarFrame[] = [];
  for (const raw of value as RawFrame[]) {
    if (!raw || typeof raw !== 'object') continue;
    const { time, path } = raw;
    if (typeof time !== 'number' || typeof path !== 'string' || path.length === 0) continue;
    frames.push({ time, path, predicted });
  }
  return frames;
}

/**
 * Fetch the current frame list (2 hours of observations at 10-minute steps plus
 * the short nowcast tail when RainViewer publishes one). Returns null on any
 * failure - the screen shows its retry state instead of a broken map.
 */
export async function fetchRadarFrameSet(): Promise<RadarFrameSet | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(RADAR_API_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Radar API responded ${response.status}`);
    const json = (await response.json()) as RawRadarFile;
    const host = typeof json?.host === 'string' ? json.host : null;
    if (!host) return null;

    const past = parseFrames(json?.radar?.past, false);
    if (past.length === 0) return null;
    const nowcast = parseFrames(json?.radar?.nowcast, true);

    return {
      host,
      frames: [...past, ...nowcast],
      nowIndex: past.length - 1,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
