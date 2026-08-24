export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * Catmull-Rom spline through points, emitted as cubic bezier path data.
 */
export function smoothPath(points: CurvePoint[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function scaleY(
  value: number,
  min: number,
  max: number,
  top: number,
  bottom: number,
): number {
  const range = Math.max(max - min, 0.001);
  return top + (1 - (value - min) / range) * (bottom - top);
}
