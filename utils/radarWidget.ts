import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_TILE_URL,
  RADAR_TILE_SIZE,
  fetchRadarFrameSet,
  radarTileUrl,
  type RadarFrame,
  type RadarFrameSet,
} from './radar';
import { tileCount, worldX, worldY, wrapTileX } from './tileMath';

/**
 * Geometry + frame resolution for the radar-snapshot widget
 * (components/WeatherWidgetRadar.tsx). Unlike the interactive radar
 * (RadarTileMap), the widget cannot pan/zoom, so it renders a FIXED window:
 * a `cols × rows` tile rectangle at a fixed zoom, centred on the location,
 * scaled into the widget's pixel budget. Tiles are rendered as remote
 * https ImageWidgets (the library loads them natively — no Skia, no files).
 */

const CACHE_KEY = '@mu_weather/widget_radar_v1';
/** Frames refresh at most every 5 minutes, same as the in-app radar. */
export const RADAR_WIDGET_TTL_MS = 5 * 60 * 1000;
export const RADAR_WIDGET_ZOOM = 5;

interface CacheShape {
  host: string;
  frames: RadarFrame[];
  nowIndex: number;
  fetchedAt: number;
}

export interface RadarWidgetTile {
  key: string;
  /** Position and size INSIDE the widget surface, in widget px. */
  left: number;
  top: number;
  size: number;
  /** Remote tile URL — ImageWidget accepts https URIs natively. */
  uri: `https://${string}`;
}

export interface RadarWidgetLayout {
  zoom: number;
  width: number;
  height: number;
  /** Base-map tiles, then radar tiles (drawn on top). */
  baseTiles: RadarWidgetTile[];
  radarTiles: RadarWidgetTile[];
}

/** Fill a `{z}/{x}/{y}` template. Split/join keeps `$` in URLs literal. */
function fillTileUrl(template: string, zoom: number, x: number, y: number): `https://${string}` {
  return fillTileUrlInner(template, zoom, x, y) as `https://${string}`;
}

function fillTileUrlInner(template: string, zoom: number, x: number, y: number): string {
  return template
    .split('{z}')
    .join(String(zoom))
    .split('{x}')
    .join(String(wrapTileX(x, zoom)))
    .split('{y}')
    .join(String(y));
}

/**
 * Tile rectangle for the widget: `cols × rows` tiles at RADAR_WIDGET_ZOOM,
 * centred on the location, each rendered at `scale` widget-px. Pure and
 * deterministic so it can be unit-tested.
 */
export function computeRadarWidgetTiles(
  latitude: number,
  longitude: number,
  cols = 3,
  rows = 2,
  scale = 80,
  zoom = RADAR_WIDGET_ZOOM,
): RadarWidgetLayout {
  const tile = RADAR_TILE_SIZE;
  const centerX = worldX(longitude, zoom) * tile;
  const centerY = worldY(latitude, zoom) * tile;
  const width = cols * scale;
  const height = rows * scale;
  // World-px of the viewport's top-left corner.
  const leftWorld = centerX - width / 2;
  const topWorld = centerY - height / 2;
  const firstX = Math.floor(leftWorld / tile);
  const firstY = Math.max(0, Math.floor(topWorld / tile));
  const count = tileCount(zoom);
  const baseTiles: RadarWidgetTile[] = [];
  const radarTiles: RadarWidgetTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = firstX + col;
      const ty = firstY + row;
      if (ty < 0 || ty >= count) continue;
      const left = Math.round((tx * tile - leftWorld) * (scale / tile));
      const top = Math.round((ty * tile - topWorld) * (scale / tile));
      baseTiles.push({
        key: `base:${zoom}:${tx}:${ty}`,
        left,
        top,
        size: scale,
        uri: fillTileUrl(BASE_TILE_URL, zoom, tx, ty),
      });
      radarTiles.push({
        key: `radar:${zoom}:${tx}:${ty}`,
        left,
        top,
        size: scale,
        // Filled per frame by applyFrameToLayout before the tiles render.
        uri: '' as `https://${string}`,
      });
    }
  }
  return { zoom, width, height, baseTiles, radarTiles };
}

/** Fill a layout's radar-tile URIs for a frame. Pure. */
export function applyFrameToLayout(
  layout: RadarWidgetLayout,
  host: string,
  frame: RadarFrame,
): RadarWidgetLayout {
  return {
    ...layout,
    radarTiles: layout.radarTiles.map((tile) => {
      // key = `radar:${zoom}:${tx}:${ty}`
      const parts = tile.key.split(':');
      const tx = Number(parts[2]);
      const ty = Number(parts[3]);
      return { ...tile, uri: fillTileUrl(radarTileUrl(host, frame), layout.zoom, tx, ty) };
    }),
  };
}

/** Newest OBSERVED frame (never a nowcast guess) plus its age in minutes. */
export function newestObservedFrame(frameSet: RadarFrameSet): RadarFrame | null {
  const frame = frameSet.frames[frameSet.nowIndex];
  if (!frame) return null;
  return frame;
}

/**
 * Cache-first frame set for the widget: 5-minute TTL, stale value kept and
 * reported (the widget dims itself) so a failed refresh never blanks it.
 */
export async function getWidgetRadarFrameSet(): Promise<{
  frameSet: RadarFrameSet;
  stale: boolean;
} | null> {
  let cached: CacheShape | null = null;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CacheShape>;
      if (
        typeof parsed.host === 'string' &&
        Array.isArray(parsed.frames) &&
        typeof parsed.nowIndex === 'number' &&
        typeof parsed.fetchedAt === 'number'
      ) {
        cached = parsed as CacheShape;
      }
    }
  } catch {
    cached = null;
  }
  const freshEnough = cached !== null && Date.now() - cached.fetchedAt < RADAR_WIDGET_TTL_MS;
  if (freshEnough && cached) {
    return { frameSet: { host: cached.host, frames: cached.frames, nowIndex: cached.nowIndex }, stale: false };
  }
  try {
    const frameSet = await fetchRadarFrameSet();
    if (frameSet) {
      const entry: CacheShape = {
        host: frameSet.host,
        frames: frameSet.frames,
        nowIndex: frameSet.nowIndex,
        fetchedAt: Date.now(),
      };
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry)).catch(() => undefined);
      return { frameSet, stale: false };
    }
    throw new Error('no frame set');
  } catch {
    if (cached) {
      return { frameSet: { host: cached.host, frames: cached.frames, nowIndex: cached.nowIndex }, stale: true };
    }
    return null;
  }
}
