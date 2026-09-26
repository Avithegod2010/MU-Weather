import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { LocateFixed, MapPin, Minus, Plus } from '../utils/uiIcons';
import { haptics } from '../utils/haptics';
import { t } from '../utils/i18n';
import { tileCount, worldX, worldY, wrapTileX } from '../utils/tileMath';
import type { AppTheme } from '../theme/palettes';

/**
 * Keyless slippy-map renderer for the rain radar, built from core React Native
 * primitives: a grid of raster `Image` cells positioned with Web-Mercator math
 * (utils/tileMath), dragged with `PanResponder`, and zoomed/recentred with
 * on-screen controls. No native map SDK, no Google Maps API key, no billing -
 * it renders identically in Expo Go and in a release APK.
 *
 * Two tile layers are stacked: the keyless CARTO raster base map underneath and,
 * while a radar frame is supplied, the RainViewer radar tiles on top. The layers
 * are separate memoized components, and the base layer's props do not change
 * while frames play, so a frame switch swaps only the radar layer's tile URLs;
 * every cell keeps a stable `${zoom}:{col}:{row}` key, so tiles that persist
 * across a pan or a frame are never re-mounted and the image cache is reused.
 *
 * Panning commits whole tiles into React state as the drag crosses tile
 * boundaries, keeping the rendered grid covering the viewport, while the
 * sub-tile remainder rides on a reanimated shared value (no re-render per
 * frame) until release folds it into the centre.
 */

/** The radar layer only exists up to RADAR_MAX_ZOOM, so zooming out has a floor. */
const MIN_ZOOM = 3;
/** One extra ring of tiles beyond the viewport so a committed drag never shows a gap. */
const PAD_TILES = 1;
const PIN_SIZE = 30;
/** Sub-tile drag remainder: below this the gesture is still a tap. */
const DRAG_SLOP_PX = 3;

interface RadarTileMapProps {
  theme: AppTheme;
  /** Point the pin marks and the recenter control snaps to. */
  latitude: number;
  longitude: number;
  /** Base raster template with {z}/{x}/{y} placeholders (utils/radar BASE_TILE_URL). */
  baseUrlTemplate: string;
  /** Radar template for the current frame, or null while frames are unavailable. */
  radarUrlTemplate: string | null;
  /** Tile edge in pixels - the grid math and the served tiles must agree (256). */
  tileSize: number;
  /** Highest usable zoom - RainViewer serves radar tiles up to 7 (RADAR_MAX_ZOOM). */
  maxZoom: number;
}

interface TileCell {
  /** Stable across frames and pans: `${zoom}:{col}:{row}`. */
  key: string;
  left: number;
  top: number;
  /** Unwrapped tile column - may be negative or >= the tile count. */
  col: number;
  /** Tile row; always inside [0, tileCount) - the world does not wrap vertically. */
  row: number;
}

/** Clamp the viewport centre so the viewport never leaves the world vertically. */
function clampCenterY(y: number, viewportHeight: number, worldPx: number): number {
  if (!Number.isFinite(y)) return worldPx / 2;
  if (viewportHeight <= 0 || worldPx <= viewportHeight) return worldPx / 2;
  const half = viewportHeight / 2;
  return Math.min(worldPx - half, Math.max(half, y));
}

/** Fill a `{z}/{x}/{y}` template. Split/join keeps `$` in URLs literal. */
function tileUrl(template: string, zoom: number, x: number, y: number): string {
  return template
    .split('{z}')
    .join(String(zoom))
    .split('{x}')
    .join(String(x))
    .split('{y}')
    .join(String(y));
}

interface TileLayerProps {
  cells: TileCell[];
  zoom: number;
  template: string;
  tileSize: number;
  opacity?: number;
}

/**
 * One raster layer. Memoized on its props: a radar-frame change (a new template)
 * re-renders only the radar layer, leaving the base layer's elements - and its
 * tile requests - untouched.
 */
const TileLayer = React.memo(function TileLayer({
  cells,
  zoom,
  template,
  tileSize,
  opacity,
}: TileLayerProps) {
  return (
    <>
      {cells.map((cell) => (
        <Image
          key={cell.key}
          source={{ uri: tileUrl(template, zoom, wrapTileX(cell.col, zoom), cell.row) }}
          style={[
            styles.tile,
            { left: cell.left, top: cell.top, width: tileSize, height: tileSize },
            opacity !== undefined && { opacity },
          ]}
          fadeDuration={0}
          accessible={false}
          accessibilityElementsHidden
        />
      ))}
    </>
  );
});

export function RadarTileMap({
  theme,
  latitude,
  longitude,
  baseUrlTemplate,
  radarUrlTemplate,
  tileSize,
  maxZoom,
}: RadarTileMapProps) {
  const [zoom, setZoom] = useState(() => Math.min(maxZoom, Math.max(MIN_ZOOM, 5)));
  /** Viewport centre in world pixels at the current zoom; null = follow the location. */
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const worldPx = tileCount(zoom) * tileSize;

  const centerX = center ? center.x : worldX(longitude, zoom) * tileSize;
  const centerY = clampCenterY(
    center ? center.y : worldY(latitude, zoom) * tileSize,
    layout.height,
    worldPx,
  );

  const grid = useMemo(() => {
    if (layout.width <= 0 || layout.height <= 0) return null;
    const left = centerX - layout.width / 2;
    const top = centerY - layout.height / 2;
    const count = tileCount(zoom);
    const firstX = Math.floor(left / tileSize) - PAD_TILES;
    const lastX = Math.floor((left + layout.width) / tileSize) + PAD_TILES;
    const firstY = Math.max(0, Math.floor(top / tileSize) - PAD_TILES);
    const lastY = Math.min(count - 1, Math.floor((top + layout.height) / tileSize) + PAD_TILES);
    if (lastY < firstY || lastX < firstX) return null;
    return { firstX, firstY, cols: lastX - firstX + 1, rows: lastY - firstY + 1 };
  }, [centerX, centerY, layout.width, layout.height, tileSize, zoom]);

  const cells = useMemo(() => {
    if (!grid) return [];
    const list: TileCell[] = [];
    for (let row = 0; row < grid.rows; row += 1) {
      const ty = grid.firstY + row;
      if (ty < 0 || ty >= tileCount(zoom)) continue;
      for (let col = 0; col < grid.cols; col += 1) {
        const tx = grid.firstX + col;
        list.push({
          key: `${zoom}:${tx}:${ty}`,
          left: col * tileSize,
          top: row * tileSize,
          col: tx,
          row: ty,
        });
      }
    }
    return list;
  }, [grid, zoom, tileSize]);

  /** Shift the committed centre by a pixel delta (negative = west / north). */
  const commitCenter = useCallback(
    (dx: number, dy: number) => {
      setCenter((current) => {
        const base = current ?? {
          x: worldX(longitude, zoom) * tileSize,
          y: worldY(latitude, zoom) * tileSize,
        };
        return {
          x: base.x + dx,
          y: clampCenterY(base.y + dy, layout.height, tileCount(zoom) * tileSize),
        };
      });
    },
    [longitude, latitude, zoom, tileSize, layout.height],
  );

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragRef = useRef({ x: 0, y: 0 });
  /** Latest commit function for the once-created responder (avoids stale props). */
  const commitRef = useRef(commitCenter);
  useEffect(() => {
    commitRef.current = commitCenter;
  }, [commitCenter]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > DRAG_SLOP_PX || Math.abs(gesture.dy) > DRAG_SLOP_PX,
        onPanResponderGrant: () => {
          dragRef.current = { x: 0, y: 0 };
        },
        onPanResponderMove: (_, gesture) => {
          const drag = dragRef.current;
          const remainingX = gesture.dx - drag.x;
          const remainingY = gesture.dy - drag.y;
          // Commit whole tiles so the rendered grid keeps covering the viewport.
          const stepsX = Math.trunc(remainingX / tileSize);
          const stepsY = Math.trunc(remainingY / tileSize);
          if (stepsX !== 0 || stepsY !== 0) {
            drag.x += stepsX * tileSize;
            drag.y += stepsY * tileSize;
            commitRef.current(-stepsX * tileSize, -stepsY * tileSize);
          }
          translateX.value = remainingX - stepsX * tileSize;
          translateY.value = remainingY - stepsY * tileSize;
        },
        onPanResponderRelease: () => {
          // Fold the visual remainder into state so the drag ends where the finger is.
          const restX = translateX.value;
          const restY = translateY.value;
          translateX.value = 0;
          translateY.value = 0;
          dragRef.current = { x: 0, y: 0 };
          if (restX !== 0 || restY !== 0) commitRef.current(-restX, -restY);
        },
        onPanResponderTerminate: () => {
          const restX = translateX.value;
          const restY = translateY.value;
          translateX.value = 0;
          translateY.value = 0;
          dragRef.current = { x: 0, y: 0 };
          if (restX !== 0 || restY !== 0) commitRef.current(-restX, -restY);
        },
      }),
    // tileSize is a module constant (RADAR_TILE_SIZE); the responder is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const zoomBy = useCallback(
    (delta: number) => {
      const next = Math.min(maxZoom, Math.max(MIN_ZOOM, zoom + delta));
      if (next === zoom) return;
      haptics.light();
      const scale = 2 ** (next - zoom);
      setCenter((current) =>
        current
          ? {
              x: current.x * scale,
              y: clampCenterY(current.y * scale, layout.height, tileCount(next) * tileSize),
            }
          : current,
      );
      setZoom(next);
    },
    [zoom, maxZoom, tileSize, layout.height],
  );

  const recenter = useCallback(() => {
    haptics.select();
    setCenter(null);
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  }, []);

  const controlStyle = ({ pressed }: { pressed: boolean }) => [
    styles.control,
    { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
    pressed && { opacity: 0.75 },
  ];

  // Pin position inside the grid container. The location can sit on the far side
  // of the antimeridian, so X uses the shortest wrapped delta.
  let pinOffsetX = worldX(longitude, zoom) * tileSize - centerX;
  if (pinOffsetX > worldPx / 2) pinOffsetX -= worldPx;
  else if (pinOffsetX < -worldPx / 2) pinOffsetX += worldPx;
  const pinOffsetY = worldY(latitude, zoom) * tileSize - centerY;
  const pinLeft = grid ? centerX + pinOffsetX - grid.firstX * tileSize : 0;
  const pinTop = grid ? centerY + pinOffsetY - grid.firstY * tileSize : 0;

  return (
    <View style={styles.root} onLayout={onLayout} {...panResponder.panHandlers}>
      {grid ? (
        <Animated.View
          style={[
            styles.grid,
            dragStyle,
            {
              width: grid.cols * tileSize,
              height: grid.rows * tileSize,
              left: grid.firstX * tileSize - (centerX - layout.width / 2),
              top: grid.firstY * tileSize - (centerY - layout.height / 2),
            },
          ]}
        >
          <TileLayer cells={cells} zoom={zoom} template={baseUrlTemplate} tileSize={tileSize} />
          {radarUrlTemplate ? (
            <TileLayer
              cells={cells}
              zoom={zoom}
              template={radarUrlTemplate}
              tileSize={tileSize}
              opacity={0.9}
            />
          ) : null}

          <View
            pointerEvents="none"
            style={[
              styles.pin,
              {
                left: pinLeft - PIN_SIZE / 2,
                top: pinTop - PIN_SIZE / 2,
                backgroundColor: theme.cardBg,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <MapPin size={16} color={theme.accent} strokeWidth={2.4} />
          </View>
        </Animated.View>
      ) : null}

      <View style={styles.controls}>
        <Pressable
          onPress={() => zoomBy(1)}
          style={controlStyle}
          accessibilityRole="button"
          accessibilityLabel={t('a11y_increase')}
        >
          <Plus size={18} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          onPress={() => zoomBy(-1)}
          style={controlStyle}
          accessibilityRole="button"
          accessibilityLabel={t('a11y_decrease')}
        >
          <Minus size={18} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          onPress={recenter}
          style={controlStyle}
          accessibilityRole="button"
          accessibilityLabel={t('a11y_back')}
        >
          <LocateFixed size={18} color={theme.textPrimary} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  tile: {
    position: 'absolute',
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    gap: 8,
  },
  control: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
