import React, { useMemo } from 'react';
import { Points, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

export type ParticleKind = 'rain' | 'snow';

interface ParticleLayerProps {
  kind: ParticleKind;
  intensity: number;
  width: number;
  height: number;
  /** The sky's single clock (ms). See useSkyClock in AnimatedBackground. */
  clock: SharedValue<number>;
}

interface ParticleSpec {
  left: number;
  phase: number;
  duration: number;
  size: number;
  opacity: number;
  swayDuration: number;
  swayPhase: number;
}

function makeSpecs(count: number, seed: number): ParticleSpec[] {
  const specs: ParticleSpec[] = [];
  let state = seed || 1;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  for (let index = 0; index < count; index++) {
    specs.push({
      left: rand() * 100,
      phase: rand(),
      duration: rand(),
      size: rand(),
      opacity: 0.25 + rand() * 0.3,
      swayDuration: 2200 + rand() * 1800,
      swayPhase: rand() * Math.PI * 2,
    });
  }
  return specs;
}

/**
 * Rain and snow as Skia points, drawn inside the sky canvas. Each frame is one derived
 * array on the UI thread, so there are no per-drop views or animations.
 * Still skylines skip this layer: the caller does not mount it when reduced motion is on.
 */
export function ParticleLayer({ kind, intensity, width, height, clock }: ParticleLayerProps) {
  const speedFactor = Math.max(intensity, 0.35);
  const count = Math.round(16 + intensity * 20);
  const specs = useMemo(
    () => makeSpecs(count, kind === 'rain' ? 1234 : 4321),
    [count, kind],
  );

  if (kind === 'rain') {
    return <RainLayer specs={specs} speedFactor={speedFactor} width={width} height={height} clock={clock} />;
  }
  return <SnowLayer specs={specs} width={width} height={height} clock={clock} />;
}

function RainLayer({
  specs,
  speedFactor,
  width,
  height,
  clock,
}: { specs: ParticleSpec[]; speedFactor: number; width: number; height: number; clock: SharedValue<number> }) {
  // Each drop is a short vertical segment: its top and bottom point.
  const segments = useDerivedValue<SkPoint[]>(() => {
    const now = clock.value;
    const out: SkPoint[] = [];
    for (const spec of specs) {
      const duration = 750 + spec.duration * 550 * (1 / speedFactor);
      const fraction = ((now / duration) + spec.phase) % 1;
      const top = -60 + fraction * (height + 140);
      const length = 12 + spec.size * 12;
      const x = (spec.left / 100) * width;
      out.push({ x, y: top }, { x, y: top + length });
    }
    return out;
  });
  return <Points points={segments} mode="lines" color="rgba(255,255,255,0.5)" style="stroke" strokeWidth={2} strokeCap="round" />;
}

function SnowLayer({
  specs,
  width,
  height,
  clock,
}: { specs: ParticleSpec[]; width: number; height: number; clock: SharedValue<number> }) {
  const flakes = useDerivedValue<SkPoint[]>(() => {
    const now = clock.value;
    const out: SkPoint[] = [];
    for (const spec of specs) {
      const duration = 7000 + spec.duration * 6000;
      const fraction = ((now / duration) + spec.phase) % 1;
      const y = -40 + fraction * (height + 100);
      const sway = Math.sin((2 * Math.PI * now) / spec.swayDuration + spec.swayPhase) * 16;
      out.push({ x: (spec.left / 100) * width + sway, y });
    }
    return out;
  });
  // Flake size varies per spec; one draw call uses the mean, which reads the same at this scale.
  const meanSize = specs.reduce((sum, spec) => sum + 2.5 + spec.size * 3, 0) / Math.max(specs.length, 1);
  return (
    <Points points={flakes} mode="points" color="rgba(255,255,255,0.8)" style="stroke" strokeWidth={meanSize} strokeCap="round" />
  );
}
