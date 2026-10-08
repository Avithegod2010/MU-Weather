import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { WeatherParticles, type ParticleKind } from './WeatherParticles';
import { useReducedMotion } from '../utils/reduceMotion';
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

function sameColors(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

/** Small deterministic PRNG so the sky layout is identical on every render. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
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

  // Fallback orbs for screens that do not pass a condition.
  const orbDriftX = useSharedValue(0);
  const orbDriftY = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion || condition) return;
    orbDriftX.value = withRepeat(
      withTiming(-26, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    orbDriftY.value = withRepeat(
      withTiming(18, { duration: 7000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [orbDriftX, orbDriftY, reducedMotion, condition]);

  const orbOneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: orbDriftX.value }, { translateY: orbDriftY.value }],
  }));
  const orbTwoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: orbDriftY.value }, { translateY: orbDriftX.value }],
  }));

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
      {condition ? (
        <SkyEffects
          condition={condition}
          isDay={isDay}
          width={width}
          height={height}
          reducedMotion={reducedMotion}
        />
      ) : (
        <>
          <Animated.View style={[styles.abs, styles.orb, styles.orbOne, orbOneStyle]} />
          <Animated.View style={[styles.abs, styles.orb, styles.orbTwo, orbTwoStyle]} />
        </>
      )}
      {particles && !reducedMotion ? (
        <WeatherParticles kind={particles.kind} intensity={particles.intensity} />
      ) : null}
    </View>
  );
}

interface LayerProps {
  width: number;
  height: number;
  reducedMotion: boolean;
}

function SkyEffects({
  condition,
  isDay,
  width,
  height,
  reducedMotion,
}: LayerProps & { condition: WeatherCondition; isDay: boolean }) {
  const clearSky = condition === 'clear' || condition === 'partlyCloudy';
  const cloudCount = CLOUD_COUNT[condition] ?? 0;
  return (
    <>
      {clearSky && isDay ? (
        <SunLayer width={width} height={height} reducedMotion={reducedMotion} />
      ) : null}
      {clearSky && !isDay ? (
        <StarLayer width={width} height={height} reducedMotion={reducedMotion} />
      ) : null}
      {cloudCount > 0 ? (
        <CloudLayer count={cloudCount} width={width} height={height} reducedMotion={reducedMotion} />
      ) : null}
      {condition === 'fog' ? (
        <FogLayer width={width} height={height} reducedMotion={reducedMotion} />
      ) : null}
      {condition === 'thunder' ? <LightningLayer reducedMotion={reducedMotion} /> : null}
    </>
  );
}

/** Warm sun glow in the upper right with slowly turning rays. */
function SunLayer({ width, height, reducedMotion }: LayerProps) {
  const breathe = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    breathe.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    spin.value = withRepeat(withTiming(1, { duration: 90000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(spin);
    };
  }, [breathe, spin, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.82 + breathe.value * 0.18,
    transform: [{ scale: 0.97 + breathe.value * 0.06 }],
  }));
  const raysStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const extent = Math.max(width, height);
  const glowSize = extent * 0.9;
  const raySize = extent * 0.8;
  const centerX = width * 0.8;
  const centerY = height * 0.12;
  const rays = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        const inner = raySize * 0.2;
        const outer = raySize * (index % 2 === 0 ? 0.5 : 0.42);
        return {
          x1: raySize / 2 + Math.cos(angle) * inner,
          y1: raySize / 2 + Math.sin(angle) * inner,
          x2: raySize / 2 + Math.cos(angle) * outer,
          y2: raySize / 2 + Math.sin(angle) * outer,
        };
      }),
    [raySize],
  );

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            width: glowSize,
            height: glowSize,
            left: centerX - glowSize / 2,
            top: centerY - glowSize / 2,
          },
          glowStyle,
        ]}
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="muSunGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.6" />
              <Stop offset="0.3" stopColor="#FFF4D6" stopOpacity="0.22" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill="url(#muSunGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            width: raySize,
            height: raySize,
            left: centerX - raySize / 2,
            top: centerY - raySize / 2,
          },
          raysStyle,
        ]}
      >
        <Svg width={raySize} height={raySize}>
          <G>
            {rays.map((ray, index) => (
              <Line
                key={index}
                x1={ray.x1}
                y1={ray.y1}
                x2={ray.x2}
                y2={ray.y2}
                stroke="rgba(255,255,255,0.17)"
                strokeWidth={index % 2 === 0 ? 3 : 2}
                strokeLinecap="round"
              />
            ))}
          </G>
        </Svg>
      </Animated.View>
    </>
  );
}

/** Night sky: stars that twinkle at their own pace. */
function StarLayer({ width, height, reducedMotion }: LayerProps) {
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
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((star, index) => (
        <Star key={index} {...star} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

function Star({
  x,
  y,
  size,
  duration,
  delay,
  reducedMotion,
}: { x: number; y: number; size: number; duration: number; delay: number } & { reducedMotion: boolean }) {
  const twinkle = useSharedValue(reducedMotion ? 0.8 : 0.25);

  useEffect(() => {
    if (reducedMotion) return;
    twinkle.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(twinkle);
  }, [twinkle, duration, delay, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: twinkle.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        styles.star,
        { left: x, top: y, width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

/** Soft cloud banks that drift left to right, each at its own speed. */
function CloudLayer({ count, width, height, reducedMotion }: LayerProps & { count: number }) {
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
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {clouds.map((cloud, index) => (
        <Cloud key={index} {...cloud} width={width} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

function Cloud({
  y,
  scale,
  duration,
  phase,
  opacity,
  width,
  reducedMotion,
}: { y: number; scale: number; duration: number; phase: number; opacity: number } & Pick<LayerProps, 'width' | 'reducedMotion'>) {
  const travel = useSharedValue(reducedMotion ? phase : 0);
  const cloudWidth = 200 * scale;
  const cloudHeight = 84 * scale;

  useEffect(() => {
    if (reducedMotion) return;
    // First lap starts from the cloud's phase; later laps restart off-screen left.
    travel.value = withSequence(
      withTiming(1, { duration: duration * (1 - phase), easing: Easing.linear }),
      withTiming(0, { duration: 0 }),
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(travel);
  }, [travel, duration, phase, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -cloudWidth + travel.value * (width + cloudWidth * 2) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.abs, { top: y, left: 0, width: cloudWidth, height: cloudHeight, opacity }, style]}
    >
      <Svg width={cloudWidth} height={cloudHeight} viewBox="0 0 200 84">
        <Circle cx={62} cy={52} r={24} fill="#FFFFFF" />
        <Circle cx={100} cy={40} r={32} fill="#FFFFFF" />
        <Circle cx={142} cy={52} r={26} fill="#FFFFFF" />
        <Rect x={36} y={50} width={132} height={26} rx={13} fill="#FFFFFF" />
      </Svg>
    </Animated.View>
  );
}

/** Two slow fog banks that sway back and forth across the sky. */
function FogLayer({ width, height, reducedMotion }: LayerProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0.2, 0.45, 0.7].map((fraction, index) => (
        <FogBand
          key={index}
          top={height * fraction}
          width={width}
          index={index}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

function FogBand({
  top,
  width,
  index,
  reducedMotion,
}: { top: number; index: number } & Pick<LayerProps, 'width' | 'reducedMotion'>) {
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration: 11000 + index * 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [drift, index, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * 0.12 + drift.value * width * 0.12 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.abs, { top, left: -width * 0.2, width: width * 1.4, height: 150 }, style]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Occasional white flashes for thunderstorms. */
function LightningLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const flash = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    flash.value = withRepeat(
      withSequence(
        withDelay(3200 + Math.random() * 2200, withTiming(0, { duration: 0 })),
        withTiming(0.32, { duration: 60 }),
        withTiming(0.05, { duration: 90 }),
        withTiming(0.22, { duration: 70 }),
        withTiming(0, { duration: 380 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(flash);
  }, [flash, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: flash.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.flash, style]}
    />
  );
}

const styles = StyleSheet.create({
  abs: {
    position: 'absolute',
  },
  star: {
    backgroundColor: '#FFFFFF',
  },
  flash: {
    backgroundColor: '#FFFFFF',
  },
  orb: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orbOne: {
    width: 320,
    height: 320,
    top: '12%',
    right: -110,
  },
  orbTwo: {
    width: 260,
    height: 260,
    bottom: '8%',
    left: -100,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
