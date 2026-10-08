import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  type SkImage,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { parseColor } from '../utils/color';
import type { SkyBackdrop } from '../utils/skyBackdrop';

/**
 * Liquid-glass highlight for the sliding selection, as a Skia runtime shader.
 *
 * What it does, per pixel of the highlight:
 *  - An edge lens: near the rim the backdrop is sampled from further toward the centre,
 *    so the background bends under the glass, the way clear glass refracts.
 *  - A specular rim on the edges that face up and to the left, plus a faint edge glow.
 *  - Premultiplied alpha, so the items under the highlight still read.
 *
 * Two shaders share this look:
 *  - GLASS_SKSL refracts the theme's sky gradient. It is the fallback, and the look the
 *    highlight had before the sky was readable.
 *  - GLASS_BACKDROP_SKSL refracts the real sky: a snapshot of the Home sky canvas (see
 *    utils/skyBackdrop.ts), sampled at the pill's window position. It is used whenever a
 *    snapshot exists.
 * The shaders have no motion of their own. The backdrop follows the slide through `origin`.
 */
export const GLASS_SKSL = `
uniform float2 size;
uniform float radius;
uniform float refraction;
uniform float4 tint;
uniform float3 skyTop;
uniform float3 skyMid;
uniform float3 skyBot;
uniform float rimStrength;

half4 main(float2 p) {
  float2 h = size * 0.5;
  float r = min(radius, min(size.x, size.y) * 0.5);
  float2 q = abs(p - h) - (h - float2(r));
  float d = length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - r;
  float cover = 1.0 - smoothstep(-0.8, 0.8, d);
  if (cover <= 0.0) {
    return half4(0.0);
  }
  float depth = clamp(-d / max(r, 1.0), 0.0, 1.0);
  float edge = 1.0 - depth;
  float2 g = (p - h) / max(h, float2(1.0));
  float lens = edge * edge;
  float v = clamp((p.y - g.y * lens * refraction * size.y) / size.y, 0.0, 1.0);
  float3 backdrop = v < 0.5 ? mix(skyTop, skyMid, v * 2.0) : mix(skyMid, skyBot, (v - 0.5) * 2.0);
  float3 col = mix(backdrop, tint.rgb, tint.a);
  col += edge * edge * 0.10;

  float2 n = -g;
  n = n / max(length(n), 0.001);
  float facing = clamp(dot(n, normalize(float2(-0.55, -0.85))), 0.0, 1.0);
  float rim = pow(edge, 5.0) * facing * rimStrength;
  col += float3(rim);
  col = min(col, float3(1.0));

  float a = cover * 0.92;
  return half4(half3(col * a), half(a));
}
`;

/**
 * The same glass as GLASS_SKSL, with the real sky as a child shader. `origin` is the pill's
 * window position, so `backdrop.eval` reads the sky pixel that lies behind each fragment.
 */
export const GLASS_BACKDROP_SKSL = `
uniform shader backdrop;
uniform float2 size;
uniform float2 origin;
uniform float radius;
uniform float refraction;
uniform float4 tint;
uniform float rimStrength;

half4 main(float2 p) {
  float2 h = size * 0.5;
  float r = min(radius, min(size.x, size.y) * 0.5);
  float2 q = abs(p - h) - (h - float2(r));
  float d = length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - r;
  float cover = 1.0 - smoothstep(-0.8, 0.8, d);
  if (cover <= 0.0) {
    return half4(0.0);
  }
  float depth = clamp(-d / max(r, 1.0), 0.0, 1.0);
  float edge = 1.0 - depth;
  float2 g = (p - h) / max(h, float2(1.0));
  float lens = edge * edge;
  float2 sampleAt = origin + p - g * lens * refraction * size;
  float3 behind = backdrop.eval(sampleAt).rgb;
  float3 col = mix(behind, tint.rgb, tint.a);
  col += edge * edge * 0.10;

  float2 n = -g;
  n = n / max(length(n), 0.001);
  float facing = clamp(dot(n, normalize(float2(-0.55, -0.85))), 0.0, 1.0);
  float rim = pow(edge, 5.0) * facing * rimStrength;
  col += float3(rim);
  col = min(col, float3(1.0));

  float a = cover * 0.92;
  return half4(half3(col * a), half(a));
}
`;

let cachedEffect: SkRuntimeEffect | null | undefined;
let cachedBackdropEffect: SkRuntimeEffect | null | undefined;

/** Compiles the backdrop glass shader once. Null when the runtime cannot build it. */
export function glassBackdropEffect(): SkRuntimeEffect | null {
  if (cachedBackdropEffect === undefined) {
    cachedBackdropEffect = Skia.RuntimeEffect.Make(GLASS_BACKDROP_SKSL);
  }
  return cachedBackdropEffect;
}

/** Compiles the glass shader once. Null when the runtime cannot build it: the caller falls back. */
export function glassEffect(): SkRuntimeEffect | null {
  if (cachedEffect === undefined) {
    cachedEffect = Skia.RuntimeEffect.Make(GLASS_SKSL);
  }
  return cachedEffect;
}

function rgbTriple(color: string): [number, number, number] {
  const parsed = parseColor(color) ?? { r: 255, g: 255, b: 255, a: 1 };
  return [parsed.r / 255, parsed.g / 255, parsed.b / 255];
}

interface GlassHighlightProps {
  effect: SkRuntimeEffect;
  width: SharedValue<number>;
  height: SharedValue<number>;
  radius: number;
  /** Tint over the backdrop, as #RRGGBB or rgba(). */
  tint: string;
  /** Sky gradient, top to bottom: the backdrop the lens samples. */
  sky: readonly [string, string, string];
  rimStrength: number;
}

/** The glass surface. Fills its parent, and its uniforms follow the sliding frame. */
export function GlassHighlight({ effect, width, height, radius, tint, sky, rimStrength }: GlassHighlightProps) {
  const uniforms = useMemo(() => {
    const [tr, tg, tb] = rgbTriple(tint);
    const parsed = parseColor(tint);
    const [top, mid, bot] = sky.map(rgbTriple);
    return {
      radius,
      refraction: 0.09,
      tint: [tr, tg, tb, parsed ? parsed.a : 0.1],
      skyTop: top,
      skyMid: mid,
      skyBot: bot,
      rimStrength,
    };
  }, [tint, sky, radius, rimStrength]);

  const sized = useDerivedValue(() => ({ ...uniforms, size: [width.value, height.value] }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={sized} />
      </Fill>
    </Canvas>
  );
}

interface GlassBackdropHighlightProps {
  effect: SkRuntimeEffect;
  backdrop: SkyBackdrop;
  width: SharedValue<number>;
  height: SharedValue<number>;
  /** Window position of the pill, on the UI thread. */
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  radius: number;
  tint: string;
  rimStrength: number;
}

/** Glass that refracts the real sky snapshot behind the pill. */
export function GlassBackdropHighlight({
  effect,
  backdrop,
  width,
  height,
  originX,
  originY,
  radius,
  tint,
  rimStrength,
}: GlassBackdropHighlightProps) {
  const uniforms = useMemo(() => {
    const [tr, tg, tb] = rgbTriple(tint);
    const parsed = parseColor(tint);
    return {
      radius,
      refraction: 0.09,
      tint: [tr, tg, tb, parsed ? parsed.a : 0.1],
      rimStrength,
    };
  }, [tint, radius, rimStrength]);

  const sized = useDerivedValue(() => ({
    ...uniforms,
    size: [width.value, height.value],
    origin: [originX.value, originY.value],
  }));

  const rect = useMemo(() => Skia.XYWHRect(0, 0, backdrop.width, backdrop.height), [backdrop.width, backdrop.height]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={sized}>
          <ImageShader image={backdrop.image as SkImage} rect={rect} fit="fill" tx="clamp" ty="clamp" />
        </Shader>
      </Fill>
    </Canvas>
  );
}
