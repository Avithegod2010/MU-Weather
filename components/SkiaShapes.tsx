import React, { useMemo } from 'react';
import { Circle, DashPathEffect, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';

/**
 * Small Skia wrappers that take the same SVG path strings and dot coordinates the old
 * react-native-svg charts used, so each chart's geometry stays as it was.
 */

/** Parses SVG path data once per string. Returns null for empty or invalid data. */
export function usePath(d: string | null | undefined): SkPath | null {
  return useMemo(() => (d ? Skia.Path.MakeFromSVGString(d) : null), [d]);
}

interface SvgPathProps {
  d: string | null | undefined;
  color: string;
  strokeWidth?: number;
  /** Dash pattern, e.g. [5, 5]. Stroke only. */
  dash?: number[];
  /** Fill the shape instead of stroking it. */
  filled?: boolean;
  opacity?: number;
}

export function SvgPath({ d, color, strokeWidth = 2, dash, filled = false, opacity = 1 }: SvgPathProps) {
  const path = usePath(d);
  if (!path) return null;
  return (
    <Group opacity={opacity}>
      <Path path={path} style={filled ? 'fill' : 'stroke'} strokeWidth={strokeWidth} strokeCap="round" color={color}>
        {dash && !filled ? <DashPathEffect intervals={dash} /> : null}
      </Path>
    </Group>
  );
}

interface SvgDotProps {
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/** Filled dot with an optional outline ring, matching the old Circle props. */
export function SvgDot({ cx, cy, r, fill, stroke, strokeWidth = 2 }: SvgDotProps) {
  return (
    <>
      {fill ? <Circle cx={cx} cy={cy} r={r} color={fill} /> : null}
      {stroke ? <Circle cx={cx} cy={cy} r={r} color={stroke} style="stroke" strokeWidth={strokeWidth} /> : null}
    </>
  );
}
