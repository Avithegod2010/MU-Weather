import React from 'react';
import Svg, { Circle, Defs, ClipPath, Ellipse, G, Rect } from 'react-native-svg';

interface MoonPhaseVisualProps {
  /** 0..1 lit fraction */
  fraction: number;
  /** true while moon is growing toward full */
  waxing: boolean;
  size?: number;
}

/** Cheap but readable moon: light disc with a dark disc sliding across. */
export function MoonPhaseVisual({ fraction, waxing, size = 84 }: MoonPhaseVisualProps) {
  const r = size / 2;
  const clamped = Math.min(1, Math.max(0, fraction));
  const offset = (1 - clamped) * size * (waxing ? -1 : 1);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <ClipPath id={`moonClip-${size}`}>
          <Circle cx={r} cy={r} r={r - 1} />
        </ClipPath>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill="#E8E9ED" />
      <Circle cx={r} cy={r} r={r - 1} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      <G clipPath={`url(#moonClip-${size})`}>
        <Circle cx={r + offset} cy={r} r={r} fill="#23252B" />
      </G>
    </Svg>
  );
}

interface RainGaugeProps {
  /** 0..1 fill level */
  fraction: number;
  size?: number;
  color?: string;
  trackColor?: string;
  strokeColor?: string;
}

/** Circular tank that fills from the bottom with a small wave crest. */
export function RainGauge({
  fraction,
  size = 84,
  color = '#4E9BD8',
  trackColor = 'rgba(78,155,216,0.12)',
  strokeColor = 'rgba(78,155,216,0.55)',
}: RainGaugeProps) {
  const r = size / 2;
  const clamped = Math.min(1, Math.max(0.04, fraction));
  const waterY = size - clamped * size;
  const id = `rainClip-${size}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <ClipPath id={id}>
          <Circle cx={r} cy={r} r={r - 2} />
        </ClipPath>
      </Defs>
      <Circle cx={r} cy={r} r={r - 2} fill={trackColor} stroke={strokeColor} strokeWidth={1.5} />
      <G clipPath={`url(#${id})`}>
        <Rect x={0} y={waterY} width={size} height={size - waterY} fill={color} opacity={0.75} />
        <Ellipse cx={r} cy={waterY} rx={r} ry={3} fill={color} opacity={0.9} />
      </G>
    </Svg>
  );
}
