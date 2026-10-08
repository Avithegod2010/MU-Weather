import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BlurMask,
  BlurStyle,
  Canvas,
  Circle,
  Group,
  Image as SkiaImage,
  LinearGradient as SkiaLinearGradient,
  Path,
  Points,
  Rect,
  Skia,
  useCanvasRef,
  vec,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ParticleLayer, type ParticleKind } from './WeatherParticles';
import { useReducedMotion } from '../utils/reduceMotion';
import { hasSkia } from '../utils/skiaWeb';
import { setSkyBackdrop } from '../utils/skyBackdrop';
import type { WeatherCondition } from '../theme/palettes';

interface AnimatedBackgroundProps {
  gradient: readonly [string, string, string];
  particles?: { kind: ParticleKind; intensity: number } | null;
  /**
   * Current sky condition. When set, the sky draws condition effects:
   * sun or stars, drifting clouds, fog banks and lightning.
   */
  condition?: WeatherCondition | null;
  /** Day or night. Chooses the sun or the stars. Defaults to day. */
  isDay?: boolean;
  /** False keeps the sky still: no sun, star, cloud, fog or lightning motion, and no rain or snow. */
  animated?: boolean;
}

type GradientTuple = [string, string, string];

/** Cloud banks drifting across the sky for each condition. */
const CLOUD_COUNT: Partial<Record<WeatherCondition, number>> = {
  partlyCloudy: 3,
  cloudy: 5,
  fog: 2,
  drizzle: 4,
  rain: 5,
  showers: 5,
  freezing: 4,
  snow: 4,
  thunder: 6,
};

/** One lightning cycle, in ms. The flash fires at FLASH_AT inside each cycle. */
const LIGHTNING_PERIOD_MS = 5200;
const LIGHTNING_FLASH_AT_MS = 3200;

function sameColors(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

/** Small deterministic PRNG so the sky layout is identical on every render. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * The single clock for the whole sky. One frame callback advances it, and every
 * element in the canvas derives its position or opacity from it on the UI thread.
 * When inactive, the clock stays put and the sky is drawn once, still.
 */
export function useSkyClock(active: boolean): SharedValue<number> {
  const clock = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    clock.value = info.timeSinceFirstFrame;
  }, false);
  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);
  return clock;
}

export function AnimatedBackground({
  gradient,
  particles = null,
  condition = null,
  isDay = true,
  animated = true,
}: AnimatedBackgroundProps) {
  // Still when the OS asks for less motion or the sky animation is switched off.
  // Decorative rain and snow are skipped entirely in that case.
  const reducedMotion = useReducedMotion() || !animated;
  const { width, height } = useWindowDimensions();
  // The sky is published to the liquid-glass highlight as a snapshot. Taken once shortly after
  // mount, then every 1.5 s while the sky moves. Under reduced motion the first snapshot stands.
  const skiaReady = hasSkia();
  const skyRef = useCanvasRef();
  useEffect(() => {
    if (!skiaReady || width <= 0 || height <= 0) return;
    let cancelled = false;
    const publish = () => {
      if (cancelled) return;
      const image = skyRef.current?.makeImageSnapshot();
      if (image) setSkyBackdrop({ image, width, height });
    };
    const first = setTimeout(publish, 300);
    const timer = reducedMotion ? null : setInterval(publish, 1500);
    return () => {
      cancelled = true;
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [skiaReady, width, height, reducedMotion, skyRef]);
  useEffect(() => () => setSkyBackdrop(null), []);
  const [layerA, setLayerA] = useState<GradientTuple>([...gradient] as GradientTuple);
  const [layerB, setLayerB] = useState<GradientTuple | null>(null);
  const frontIsA = useRef(true);

  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);

  useEffect(() => {
    const current = frontIsA.current ? layerA : layerB;
    if (current && sameColors(current, gradient)) return;

    if (frontIsA.current) {
      setLayerB([...gradient] as GradientTuple);
      frontIsA.current = false;
      opacityB.value = 0;
      opacityB.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) });
    } else {
      setLayerA([...gradient] as GradientTuple);
      frontIsA.current = true;
      opacityA.value = 0;
      opacityA.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradient]);

  const styleA = useAnimatedStyle(() => ({ opacity: opacityA.value }));
  const styleB = useAnimatedStyle(() => ({ opacity: opacityB.value }));

  // Skipped entirely when still: the clock never starts, so the canvas draws one frame.
  const clock = useSkyClock(!reducedMotion);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, styleA]}>
        <LinearGradient
          colors={layerA}
          locations={[0, 0.52, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {layerB ? (
        <Animated.View style={[StyleSheet.absoluteFill, styleB]}>
          <LinearGradient
            colors={layerB}
            locations={[0, 0.52, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {skiaReady ? (
        <Canvas ref={skyRef} style={StyleSheet.absoluteFill} pointerEvents="none">
          {condition ? (
            <SkyEffects
              condition={condition}
              isDay={isDay}
              width={width}
              height={height}
              clock={clock}
              reducedMotion={reducedMotion}
            />
          ) : (
            <Orbs width={width} height={height} clock={clock} reducedMotion={reducedMotion} />
          )}
          {particles && !reducedMotion ? (
            <ParticleLayer
              kind={particles.kind}
              intensity={particles.intensity}
              width={width}
              height={height}
              clock={clock}
            />
          ) : null}
        </Canvas>
      ) : null}
    </View>
  );
}

interface LayerProps {
  width: number;
  height: number;
  clock: SharedValue<number>;
  reducedMotion: boolean;
}

/** Time the effects read from: frozen at 0 when still, so the layout is the same every frame. */
function timeOf(clock: SharedValue<number>, reducedMotion: boolean): number {
  'worklet';
  return reducedMotion ? 0 : clock.value;
}

function SkyEffects({
  condition,
  isDay,
  width,
  height,
  clock,
  reducedMotion,
}: LayerProps & { condition: WeatherCondition; isDay: boolean }) {
  const clearSky = condition === 'clear' || condition === 'partlyCloudy';
  const cloudCount = CLOUD_COUNT[condition] ?? 0;
  return (
    <>
      {clearSky && isDay ? (
        <SunLayer width={width} height={height} clock={clock} reducedMotion={reducedMotion} />
      ) : null}
      {clearSky && !isDay ? (
        <StarLayer width={width} height={height} clock={clock} reducedMotion={reducedMotion} />
      ) : null}
      {cloudCount > 0 ? (
        <CloudLayer
          count={cloudCount}
          width={width}
          height={height}
          clock={clock}
          reducedMotion={reducedMotion}
        />
      ) : null}
      {condition === 'fog' ? (
        <FogLayer width={width} height={height} clock={clock} reducedMotion={reducedMotion} />
      ) : null}
      {condition === 'thunder' ? (
        <Lightning width={width} height={height} clock={clock} reducedMotion={reducedMotion} />
      ) : null}
    </>
  );
}

/** Warm sun glow in the upper right, blurred with a Skia mask, with slowly turning rays. */
/**
 * The sun's glow is two large blurred discs. Their blur does not change over time (only the
 * group opacity breathes), so they are drawn once into an offscreen image per size and blitted
 * each frame. Blurring them live every frame was the most expensive part of the clear-sky scene.
 */
function useSunGlowImage(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  glowRadius: number,
): SkImage | null {
  return useMemo(() => {
    if (width <= 0 || height <= 0) return null;
    const surface = Skia.Surface.MakeOffscreen(Math.ceil(width), Math.ceil(height));
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const soft = Skia.Paint();
    soft.setColor(Skia.Color('rgba(255,244,214,0.42)'));
    soft.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, glowRadius * 0.32, true));
    canvas.drawCircle(centerX, centerY, glowRadius * 0.55, soft);
    const core = Skia.Paint();
    core.setColor(Skia.Color('rgba(255,255,255,0.55)'));
    core.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, glowRadius * 0.08, true));
    canvas.drawCircle(centerX, centerY, glowRadius * 0.16, core);
    surface.flush();
    return surface.makeImageSnapshot();
  }, [width, height, centerX, centerY, glowRadius]);
}

function SunLayer({ width, height, clock, reducedMotion }: LayerProps) {
  const extent = Math.max(width, height);
  const glowRadius = extent * 0.45;
  const rayInner = extent * 0.8 * 0.2;
  const centerX = width * 0.8;
  const centerY = height * 0.12;
  const glowImage = useSunGlowImage(width, height, centerX, centerY, glowRadius);

  // Breathing glow: 0.82 to 1.0 over an 8.4 s cycle.
  const glowOpacity = useDerivedValue(() => {
    const breathe = 0.5 - 0.5 * Math.cos((2 * Math.PI * timeOf(clock, reducedMotion)) / 8400);
    return 0.82 + breathe * 0.18;
  });
  // One full turn every 90 s.
  const rayTransform = useDerivedValue(() => [
    { rotate: ((timeOf(clock, reducedMotion) / 90000) % 1) * Math.PI * 2 },
  ]);

  const rays = useMemo(() => {
    const even: { x: number; y: number }[] = [];
    const odd: { x: number; y: number }[] = [];
    const outerFor = (index: number) => extent * 0.8 * (index % 2 === 0 ? 0.5 : 0.42);
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2;
      const target = index % 2 === 0 ? even : odd;
      const outer = outerFor(index);
      target.push(
        { x: centerX + Math.cos(angle) * rayInner, y: centerY + Math.sin(angle) * rayInner },
        { x: centerX + Math.cos(angle) * outer, y: centerY + Math.sin(angle) * outer },
      );
    }
    return { even, odd };
  }, [extent, centerX, centerY, rayInner]);

  return (
    <>
      {glowImage ? (
        // The breathing alpha goes on the image itself. A group opacity over a full-screen child
        // would force an offscreen layer every frame.
        <SkiaImage image={glowImage} x={0} y={0} width={width} height={height} fit="fill" opacity={glowOpacity} />
      ) : (
        // Fallback when an offscreen surface is unavailable: the same discs, drawn live.
        <Group opacity={glowOpacity}>
          <Circle cx={centerX} cy={centerY} r={glowRadius * 0.55} color="rgba(255,244,214,0.42)">
            <BlurMask blur={glowRadius * 0.32} style="normal" />
          </Circle>
          <Circle cx={centerX} cy={centerY} r={glowRadius * 0.16} color="rgba(255,255,255,0.55)">
            <BlurMask blur={glowRadius * 0.08} style="normal" />
          </Circle>
        </Group>
      )}
      <Group origin={vec(centerX, centerY)} transform={rayTransform}>
        <Points points={rays.even} mode="lines" color="rgba(255,255,255,0.17)" style="stroke" strokeWidth={3} strokeCap="round" />
        <Points points={rays.odd} mode="lines" color="rgba(255,255,255,0.17)" style="stroke" strokeWidth={2} strokeCap="round" />
      </Group>
    </>
  );
}

/** Night sky: stars that twinkle at their own pace. */
function StarLayer({ width, height, clock, reducedMotion }: LayerProps) {
  const stars = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: 28 }, () => ({
      x: random() * width,
      y: random() * height * 0.62,
      size: 1.4 + random() * 2.2,
      duration: 1800 + random() * 2600,
      delay: random() * 3000,
    }));
  }, [width, height]);

  return (
    <>
      {stars.map((star, index) => (
        <Star key={index} {...star} clock={clock} reducedMotion={reducedMotion} />
      ))}
    </>
  );
}

function Star({
  x,
  y,
  size,
  duration,
  delay,
  clock,
  reducedMotion,
}: { x: number; y: number; size: number; duration: number; delay: number } & Pick<LayerProps, 'clock' | 'reducedMotion'>) {
  // Ping-pong between 0.25 and 1, starting after the star's own delay.
  const opacity = useDerivedValue(() => {
    if (reducedMotion) return 0.8;
    const elapsed = clock.value - delay;
    if (elapsed <= 0) return 0.25;
    const phase = (elapsed % (duration * 2)) / duration;
    const ease = phase <= 1 ? phase : 2 - phase;
    return 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(Math.PI * ease));
  });
  return (
    <Group opacity={opacity}>
      <Circle cx={x + size / 2} cy={y + size / 2} r={size / 2} color="#FFFFFF" />
    </Group>
  );
}

/** Soft cloud banks that drift left to right, each at its own speed. */
function CloudLayer({ count, width, height, clock, reducedMotion }: LayerProps & { count: number }) {
  const clouds = useMemo(() => {
    const random = seeded(count * 131 + 17);
    return Array.from({ length: count }, (_, index) => ({
      y: height * (0.05 + (index / Math.max(count, 1)) * 0.5) + random() * height * 0.05,
      scale: 0.7 + random() * 0.7,
      duration: 38000 + random() * 26000,
      phase: random(),
      opacity: 0.3 + random() * 0.25,
    }));
  }, [count, height]);

  return (
    <>
      {clouds.map((cloud, index) => (
        <Cloud key={index} {...cloud} width={width} clock={clock} reducedMotion={reducedMotion} />
      ))}
    </>
  );
}

/** Four overlapping circles and a base bar, unioned into one path in local coordinates. */
function cloudPath(scale: number): SkPath {
  const path = Skia.Path.Make();
  path.addCircle(62 * scale, 52 * scale, 24 * scale);
  path.addCircle(100 * scale, 40 * scale, 32 * scale);
  path.addCircle(142 * scale, 52 * scale, 26 * scale);
  path.addRRect(Skia.RRectXY(Skia.XYWHRect(36 * scale, 50 * scale, 132 * scale, 26 * scale), 13 * scale, 13 * scale));
  return path;
}

function Cloud({
  y,
  scale,
  duration,
  phase,
  opacity,
  width,
  clock,
  reducedMotion,
}: { y: number; scale: number; duration: number; phase: number; opacity: number } & Pick<LayerProps, 'clock' | 'reducedMotion'> & { width: number }) {
  const cloudWidth = 200 * scale;
  const path = useMemo(() => cloudPath(scale), [scale]);
  const transform = useDerivedValue(() => {
    // Start each cloud at its own phase, then wrap off-screen left.
    const fraction = (phase + timeOf(clock, reducedMotion) / duration) % 1;
    return [{ translateX: -cloudWidth + fraction * (width + cloudWidth * 2) }, { translateY: y }];
  });
  return (
    <Group transform={transform}>
      <Path path={path} color={`rgba(255,255,255,${opacity.toFixed(3)})`} />
    </Group>
  );
}

/** Two slow fog banks that sway back and forth across the sky. */
function FogLayer({ width, height, clock, reducedMotion }: LayerProps) {
  return (
    <>
      {[0.2, 0.45, 0.7].map((fraction, index) => (
        <FogBand
          key={index}
          top={height * fraction}
          width={width}
          index={index}
          clock={clock}
          reducedMotion={reducedMotion}
        />
      ))}
    </>
  );
}

function FogBand({
  top,
  width,
  index,
  clock,
  reducedMotion,
}: { top: number; index: number } & Pick<LayerProps, 'clock' | 'reducedMotion'> & { width: number }) {
  const period = 11000 + index * 2600;
  const bandWidth = width * 1.4;
  const transform = useDerivedValue(() => {
    // Ping-pong sway over one period, from -12% to 0 of the width.
    const t = timeOf(clock, reducedMotion) / period;
    const pingPong = 0.5 - 0.5 * Math.cos(Math.PI * (t % 2));
    return [{ translateX: -width * 0.12 + pingPong * width * 0.12 }];
  });
  return (
    <Group transform={transform}>
      <Rect x={-width * 0.2} y={top} width={bandWidth} height={150}>
        <SkiaLinearGradient
          start={vec(-width * 0.2, 0)}
          end={vec(-width * 0.2 + bandWidth, 0)}
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          positions={[0, 0.5, 1]}
        />
      </Rect>
    </Group>
  );
}

/** Piecewise-linear flash envelope: sharp rise, dip, second rise, then fade. */
const FLASH_KEYS: [number, number][] = [
  [0, 0],
  [60, 0.32],
  [150, 0.05],
  [220, 0.22],
  [600, 0],
];

function flashEnvelope(localMs: number): number {
  'worklet';
  if (localMs < 0) return 0;
  for (let i = 0; i < FLASH_KEYS.length - 1; i++) {
    const [t0, v0] = FLASH_KEYS[i];
    const [t1, v1] = FLASH_KEYS[i + 1];
    if (localMs <= t1) return v0 + ((localMs - t0) / (t1 - t0)) * (v1 - v0);
  }
  return 0;
}

/** Occasional white flashes for thunderstorms. */
function Lightning({ width, height, clock, reducedMotion }: LayerProps) {
  const opacity = useDerivedValue(() => {
    if (reducedMotion) return 0;
    const inCycle = clock.value % LIGHTNING_PERIOD_MS;
    return flashEnvelope(inCycle - LIGHTNING_FLASH_AT_MS);
  });
  return (
    <Rect x={0} y={0} width={width} height={height} color="#FFFFFF" opacity={opacity} />
  );
}

/** Fallback orbs for screens that do not pass a condition. */
function Orbs({ width, height, clock, reducedMotion }: LayerProps) {
  const orbOneX = width - 50;
  const orbOneY = height * 0.12 + 160;
  const orbTwoX = 30;
  const orbTwoY = height * 0.92 - 130;

  // Drift: x ping-pongs over 9 s, y over 7 s. The second orb swaps the axes.
  const driftX = useDerivedValue(() => {
    const t = timeOf(clock, reducedMotion) / 9000;
    return -26 * (0.5 - 0.5 * Math.cos(Math.PI * (t % 2)));
  });
  const driftY = useDerivedValue(() => {
    const t = timeOf(clock, reducedMotion) / 7000;
    return 18 * (0.5 - 0.5 * Math.cos(Math.PI * (t % 2)));
  });
  const orbOneTransform = useDerivedValue(() => [{ translateX: driftX.value }, { translateY: driftY.value }]);
  const orbTwoTransform = useDerivedValue(() => [{ translateX: driftY.value }, { translateY: driftX.value }]);

  return (
    <>
      <Group transform={orbOneTransform}>
        <Circle cx={orbOneX} cy={orbOneY} r={160} color="rgba(255,255,255,0.06)" />
      </Group>
      <Group transform={orbTwoTransform}>
        <Circle cx={orbTwoX} cy={orbTwoY} r={130} color="rgba(255,255,255,0.05)" />
      </Group>
    </>
  );
}

