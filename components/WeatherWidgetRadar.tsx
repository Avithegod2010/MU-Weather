import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { describeFreshness, widgetUpdatedLabel } from '../utils/widgetFreshness';
import {
  applyFrameToLayout,
  computeRadarWidgetTiles,
  type RadarWidgetLayout,
} from '../utils/radarWidget';
import type { RadarFrameSet } from '../utils/radar';

/**
 * Radar-snapshot widget (2×2): a FIXED 4×2-tile Web-Mercator window (CARTO
 * dark base + the newest OBSERVED RainViewer frame on top), centred on the
 * location. Tiles are remote https ImageWidgets the library loads natively —
 * no map SDK, no Skia, no files.
 *
 * LAYOUT CONSTRAINT: widget styles have margins but NO absolute positioning,
 * so the tile grid is built from row/column FlexWidgets; the sub-tile offset
 * (the viewport is never tile-aligned) is expressed as negative margins on
 * the first row/column, and Android clips the overflow at the widget bounds.
 * Tapping opens the in-app animated radar. Stale frames dim the snapshot.
 */

const RADAR_ATTRIBUTION = 'RainViewer · CARTO';
const ROOT_W = 220;
const ROOT_H = 148;
const COLS = 4;
const ROWS = 2;
/** Map strip under the header text; rows*SCALE must fit inside. */
const SCALE = 56;

const C = {
  bg: 'rgba(10, 16, 30, 0.92)',
  subtle: 'rgba(220, 228, 245, 0.62)',
  faint: 'rgba(220, 228, 245, 0.42)',
  staleTint: 'rgba(10, 16, 30, 0.55)',
  accent: '#7FB5F0',
} as const;

interface WeatherWidgetRadarProps {
  /** Base + radar tiles, positioned for the widget surface. */
  layout: RadarWidgetLayout | null;
  /** Frame label, e.g. "-45 min" / "Now" (composed by the caller). */
  frameLabel: string;
  /** "Updated {time}" line for the footer, already composed. */
  updatedLabel: string;
  stale: boolean;
  /** False renders the no-data placeholder (no frames, or nothing cached). */
  hasData: boolean;
  cityName: string;
  themeKey?: string;
  isLight?: boolean;
}

export function WeatherWidgetRadar({
  layout,
  frameLabel,
  updatedLabel,
  stale,
  hasData,
  cityName,
}: WeatherWidgetRadarProps) {
  return (
    <FlexWidget
      style={{
        width: ROOT_W,
        height: ROOT_H,
        borderRadius: 14,
        backgroundColor: C.bg,
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
      }}
      clickAction="openRadar"
    >
      {hasData && layout ? (
        <FlexWidget
          style={{
            width: ROOT_W,
            height: ROWS * SCALE,
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            backgroundColor: 'rgba(23, 60, 40, 0.9)',
          }}
        >
          {Array.from({ length: ROWS }, (_, row) => (
            <FlexWidget
              key={row}
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                marginTop: row === 0 ? layout.radarTiles.length ? rowMarginTop(layout) : 0 : 0,
              }}
            >
              {layout.radarTiles
                .filter((_, index) => Math.floor(index / COLS) === row)
                .map((tile, col) => (
                  <ImageWidget
                    key={tile.key}
                    image={tile.uri}
                    imageWidth={256}
                    imageHeight={256}
                    style={{
                      width: tile.size,
                      height: tile.size,
                      marginLeft: col === 0 ? colMarginLeft(layout) : 0,
                    }}
                  />
                ))}
            </FlexWidget>
          ))}
          {stale ? (
            <FlexWidget
              style={{
                width: ROOT_W,
                height: ROOT_H,
                backgroundColor: C.staleTint,
                marginTop: -(ROWS * SCALE),
              }}
            />
          ) : null}
          <FlexWidget
            style={{
              width: ROOT_W,
              flexDirection: 'row',
              justifyContent: 'flex-start',
              marginTop: -(ROWS * SCALE) + 6,
            }}
          >
            <FlexWidget style={{ marginLeft: 6, backgroundColor: 'rgba(10, 16, 30, 0.7)', borderRadius: 6, paddingLeft: 5, paddingRight: 5, paddingTop: 1, paddingBottom: 1 }}>
              <TextWidget text={frameLabel} style={{ fontSize: 10, color: C.accent, fontFamily: 'sans-serif-medium' }} />
            </FlexWidget>
            <FlexWidget style={{ marginLeft: 4, backgroundColor: 'rgba(10, 16, 30, 0.7)', borderRadius: 6, paddingLeft: 5, paddingRight: 5, paddingTop: 1, paddingBottom: 1 }}>
              <TextWidget text={cityName} style={{ fontSize: 10, color: C.subtle }} />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: ROOT_W,
            height: ROOT_H - 26,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text={cityName || 'MU Weather'}
            style={{ fontSize: 12, color: C.subtle, fontFamily: 'sans-serif-medium' }}
          />
          <TextWidget
            text={stale ? 'Radar unavailable' : 'Loading radar…'}
            style={{ fontSize: 10, color: C.faint, marginTop: 4 }}
          />
        </FlexWidget>
      )}
      <FlexWidget
        style={{
          width: ROOT_W,
          paddingHorizontal: 8,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <TextWidget text={updatedLabel} style={{ fontSize: 9, color: stale ? '#EFC25C' : C.faint }} />
        <TextWidget text={RADAR_ATTRIBUTION} style={{ fontSize: 8, color: C.faint }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Negative left margin pulling the first column to the viewport offset. */
function colMarginLeft(layout: RadarWidgetLayout): number {
  const first = layout.radarTiles[0];
  if (!first) return 0;
  // The tile's drawn left is its computed position relative to the viewport;
  // the first column sits at that offset, which is negative or zero.
  return Math.max(-first.size, Math.min(0, first.left));
}

/** Negative top margin pulling the first row to the viewport offset. */
function rowMarginTop(layout: RadarWidgetLayout): number {
  const first = layout.radarTiles[0];
  if (!first) return 0;
  return Math.max(-first.size, Math.min(0, first.top));
}

/** Frame label from a unix-seconds frame time: "Now" / "-45 min". */
export function radarFrameLabel(frameTime: number | null, nowMs: number): string {
  if (!frameTime) return '';
  const minutes = Math.round((nowMs - frameTime * 1000) / 60000);
  if (minutes <= 5 && minutes >= -5) return 'Now';
  return minutes > 0 ? `-${minutes} min` : `+${Math.abs(minutes)} min`;
}

export function renderRadarWidgetUnavailable(stale: boolean): React.JSX.Element {
  return (
    <WeatherWidgetRadar
      layout={null}
      frameLabel=""
      updatedLabel=""
      stale={stale}
      hasData={false}
      cityName=""
    />
  );
}

export function renderRadarWidgetFromBundle(
  bundle: { location: { latitude: number; longitude: number; name?: string } } | null,
  frameSet: RadarFrameSet | null,
  frameStale: boolean,
  fetchedAt: number | null,
): React.JSX.Element {
  if (!bundle || !frameSet) return renderRadarWidgetUnavailable(frameStale);
  const frame = frameSet.frames[frameSet.nowIndex] ?? null;
  if (!frame) return renderRadarWidgetUnavailable(frameStale);
  let layout = computeRadarWidgetTiles(
    bundle.location.latitude,
    bundle.location.longitude,
    COLS,
    ROWS,
    SCALE,
  );
  layout = applyFrameToLayout(layout, frameSet.host, frame);
  const nowMs = Date.now();
  const ageMinutes = Math.round((nowMs - frame.time * 1000) / 60000);
  const stale = frameStale || ageMinutes > 45 || describeFreshness(fetchedAt ?? 0, nowMs).stale;
  const updatedLabel = widgetUpdatedLabel(fetchedAt ?? 0, nowMs);
  return (
    <WeatherWidgetRadar
      layout={layout}
      frameLabel={radarFrameLabel(frame.time, nowMs)}
      updatedLabel={updatedLabel}
      stale={stale}
      hasData
      cityName={bundle.location.name ?? ''}
    />
  );
}
