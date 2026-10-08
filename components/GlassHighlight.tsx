import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, Shader, Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { parseColor } from '../utils/color';

/**
 * Liquid-glass highlight for the sliding selection, as a Skia runtime shader.
 *
 * What it does, per pixel of the highlight:
 *  - An edge lens: near the rim the backdrop is sampled from further toward the centre,
 *    so the background bends under the glass, the way clear glass refracts.
 *  - A specular rim on the edges that face up and to the left, plus a faint edge glow.
 *  - Premultiplied alpha, so the items under the highlight still read.
 *
 * Limitation: the backdrop is the theme's sky gradient, not the pixels behind the card.
 * Sampling the real background needs it rendered into an image the card can read, which
 * this does not do yet. The shader is static, so it has no motion to reduce.
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

let cachedEffect: SkRuntimeEffect | null | undefined;

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
