import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  LinearGradient,
  Path,
  Skia,
  vec,
  type SkPath,
} from "@shopify/react-native-skia";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";
import { smoothPath, type CurvePoint } from "../utils/curve";
import { useReducedMotion } from "../utils/reduceMotion";
import { parseColor } from "../utils/color";
import type { AppTheme } from "../theme/palettes";

export interface ChartSeries {
  color: string;
  points: CurvePoint[];
  /** Dash intervals for the line, for a secondary series such as wind. */
  dash?: number[];
  /** Indexes of the points that get a dot. Left out, every point gets one. */
  markers?: number[];
}

/** One column per hour: its x, the first series' y (null when missing), and the value text for the scrub tag. */
export interface ChartColumn {
  x: number;
  y0: number | null;
  label: string;
}

interface SkiaSeriesChartProps {
  theme: AppTheme;
  width: number;
  height: number;
  series: ChartSeries[];
  /** Primary ensemble band as SVG path data, drawn behind the series. */
  bandPath?: string;
  bandColor?: string;
  /** Additional independently scaled confidence bands (for example, wind). */
  bands?: { path: string; color: string }[];
  /** Scrub cursor on touch and drag. Turn off when the chart sits in a horizontal scroller. */
  scrub?: boolean;
  columns: ChartColumn[];
  dotFill: string;
  /** Changes when the data changes; the line draws again from zero. */
  dataKey: string;
}

const DRAW_MS = 900;

/** The colour at a given alpha, for hex and rgba() inputs alike. */
function fadeColor(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`;
}

function pathFrom(d: string): SkPath {
  return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
}

/**
 * Time-series chart drawn with Skia: the line draws on from left to right, the first
 * series gets a gradient fill, and touching or dragging the chart shows a scrub cursor
 * with the value at that hour. Reduced motion draws the final state at once.
 */
export function SkiaSeriesChart({
  theme,
  width,
  height,
  series,
  bandPath,
  bandColor,
  bands = [],
  columns,
  dotFill,
  dataKey,
  scrub = true,
}: SkiaSeriesChartProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: DRAW_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [dataKey, reduced, progress]);

  const bandsColorKey = bands.map((entry) => entry.color).join('|');
  const built = useMemo(() => {
    const lines = series.map((entry) => pathFrom(smoothPath(entry.points)));
    const first = series[0]?.points ?? [];
    let fill: SkPath | null = null;
    if (first.length >= 2) {
      const d = `${smoothPath(first)} L ${first[first.length - 1].x.toFixed(1)} ${height} L ${first[0].x.toFixed(1)} ${height} Z`;
      fill = pathFrom(d);
    }
    const bandEntries = [
      ...(bandPath ? [{ path: bandPath, color: bandColor ?? (theme.isLight ? 'rgba(245,169,98,0.16)' : 'rgba(245,169,98,0.22)') }] : []),
      ...bands,
    ].map((entry) => ({ path: pathFrom(entry.path), color: entry.color }));
    return { lines, fill, bands: bandEntries };
    // dataKey is the change signal; series and bandPath are derived from it by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, height, bandColor, bandsColorKey, theme.isLight]);

  // The PanResponder is created once, so it reads the latest columns through a ref.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const responder = useMemo(() => {
    const indexAt = (x: number) => {
      const list = columnsRef.current;
      if (list.length === 0) return null;
      let best = 0;
      let bestDistance = Infinity;
      list.forEach((column, index) => {
        const distance = Math.abs(column.x - x);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: (event) =>
        setScrubIndex(indexAt(event.nativeEvent.locationX)),
      onPanResponderMove: (event) =>
        setScrubIndex(indexAt(event.nativeEvent.locationX)),
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    });
  }, []);

  const cursor = scrub && scrubIndex !== null ? columns[scrubIndex] : undefined;
  const tagWidth = 76;
  const tagLeft = cursor
    ? Math.min(
        Math.max(cursor.x - tagWidth / 2, 0),
        Math.max(width - tagWidth, 0),
      )
    : 0;

  return (
    <View style={{ width, height }} {...(scrub ? responder.panHandlers : {})}>
      <Canvas style={{ width, height }}>
        {built.bands.map((band, index) => (
          <Group key={`band-${index}`} opacity={progress}>
            <Path path={band.path} color={band.color} />
          </Group>
        ))}
        {series.map((entry, index) => (
          <React.Fragment key={`series-${index}`}>
            {index === 0 && built.fill ? (
              <Group opacity={progress}>
                <Path path={built.fill}>
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(0, height)}
                    colors={[fadeColor(entry.color, 0.4), fadeColor(entry.color, 0)]}
                  />
                </Path>
              </Group>
            ) : null}
            {built.lines[index] ? (
              <Path
                path={built.lines[index]}
                style="stroke"
                strokeWidth={2.5}
                strokeCap="round"
                color={entry.color}
                start={0}
                end={progress}
              >
                {entry.dash ? <DashPathEffect intervals={entry.dash} /> : null}
              </Path>
            ) : null}
            <Group opacity={progress}>
              {entry.points.map((point, pointIndex) =>
                entry.markers && !entry.markers.includes(pointIndex) ? null : (
                  <React.Fragment key={`dot-${index}-${pointIndex}`}>
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={pointIndex === 0 ? 5 : 3.5}
                      color={dotFill}
                    />
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={pointIndex === 0 ? 5 : 3.5}
                      color={entry.color}
                      style="stroke"
                      strokeWidth={2}
                    />
                  </React.Fragment>
                ),
              )}
            </Group>
          </React.Fragment>
        ))}
        {cursor ? (
          <Group>
            <Line
              p1={vec(cursor.x, 0)}
              p2={vec(cursor.x, height)}
              color={theme.textSecondary}
              strokeWidth={1}
            />
            {cursor.y0 !== null ? (
              <>
                <Circle cx={cursor.x} cy={cursor.y0} r={6} color={dotFill} />
                <Circle
                  cx={cursor.x}
                  cy={cursor.y0}
                  r={6}
                  color={series[0]?.color ?? theme.accent}
                  style="stroke"
                  strokeWidth={2.5}
                />
              </>
            ) : null}
          </Group>
        ) : null}
      </Canvas>
      {cursor ? (
        <View
          pointerEvents="none"
          style={[
            styles.tag,
            {
              left: tagLeft,
              backgroundColor: theme.chipBg,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <Text
            style={[styles.tagText, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {cursor.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    position: "absolute",
    top: 0,
    width: 76,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
