import React, { useMemo } from 'react';
import { BlurMask, Canvas, Circle, Group, Oval, Rect, Skia } from '@shopify/react-native-skia';

interface MoonPhaseVisualProps {
  /** 0..1 lit fraction */
  fraction: number;
  /** true while moon is growing toward full */
  waxing: boolean;
  size?: number;
}

/** Cheap but readable moon: light disc with a dark disc sliding across, clipped to the disc. */
export function MoonPhaseVisual({ fraction, waxing, size = 84 }: MoonPhaseVisualProps) {
  const r = size / 2;
  const clamped = Math.min(1, Math.max(0, fraction));
  const offset = (1 - clamped) * size * (waxing ? -1 : 1);
  const disc = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(r, r, r - 1);
    return path;
  }, [r]);
  return (
    <Canvas
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Soft halo: a blurred disc behind the moon, in place of the old SVG glow. */}
      <Circle cx={r} cy={r} r={r * 0.92} color="rgba(232,233,237,0.22)">
        <BlurMask blur={r * 0.32} style="normal" />
      </Circle>
      <Circle cx={r} cy={r} r={r - 1} color="#E8E9ED" />
      <Group clip={disc}>
        <Circle cx={r + offset} cy={r} r={r} color="#23252B" />
      </Group>
      <Circle cx={r} cy={r} r={r - 1} color="rgba(255,255,255,0.14)" style="stroke" strokeWidth={1} />
    </Canvas>
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
  const tank = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(r, r, r - 2);
    return path;
  }, [r]);
  return (
    <Canvas
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={r} cy={r} r={r - 2} color={trackColor} />
      <Circle cx={r} cy={r} r={r - 2} color={strokeColor} style="stroke" strokeWidth={1.5} />
      <Group clip={tank}>
        <Rect x={0} y={waterY} width={size} height={size - waterY} color={color} opacity={0.75} />
        <Oval x={0} y={waterY - 3} width={size} height={6} color={color} opacity={0.9} />
      </Group>
    </Canvas>
  );
}
