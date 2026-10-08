import { parseColor, type Rgba } from './color';

/**
 * WCAG 2.x contrast helpers. Pure functions, so the theme code and the audit script
 * (scripts/visual/contrast-audit.ts) share one definition.
 */

export type Rgb = [number, number, number];

/** Body-text minimum for normal-size text (WCAG 2.x AA). */
export const MIN_TEXT_CONTRAST = 4.5;

export const INK_DARK = '#1C2431';
export const INK_LIGHT = '#FFFFFF';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0 black .. 1 white) of an opaque sRGB colour. */
export function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over composite of a colour with alpha onto an opaque background. */
export function composite(fg: Rgba, bg: Rgb): Rgb {
  return [
    fg.r * fg.a + bg[0] * (1 - fg.a),
    fg.g * fg.a + bg[1] * (1 - fg.a),
    fg.b * fg.a + bg[2] * (1 - fg.a),
  ];
}

export function toRgb(color: string): Rgb {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`contrast: unsupported colour ${color}`);
  return [parsed.r, parsed.g, parsed.b];
}

/**
 * Text colour for a surface set: the ink (dark or white) that keeps the worst-case contrast
 * highest. The sky's brightness decides it: dark ink on bright skies, white on dark skies.
 */
export function pickInk(surfaces: readonly Rgb[]): string {
  const worst = (ink: Rgb) => Math.min(...surfaces.map((surface) => contrastRatio(ink, surface)));
  return worst(toRgb(INK_LIGHT)) >= worst(toRgb(INK_DARK)) ? INK_LIGHT : INK_DARK;
}

/**
 * Lowest alpha in [from, 1] at which `ink` reaches `minimum` against every surface.
 * Contrast rises with alpha because the ink is the far end of the luminance range. Returns 1
 * when even full ink falls short, so the caller can see the failure.
 */
export function alphaForContrast(ink: string, surfaces: readonly Rgb[], from: number, minimum: number): number {
  const parsed = parseColor(ink);
  if (!parsed) throw new Error(`contrast: unsupported ink ${ink}`);
  const meets = (alpha: number) =>
    surfaces.every((surface) => contrastRatio(composite({ ...parsed, a: alpha }, surface), surface) >= minimum);
  if (meets(from)) return from;
  let lo = from;
  let hi = 1;
  if (!meets(hi)) return 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (meets(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}

export interface TextTiers {
  primary: string;
  secondary: string;
  tertiary: string;
  /** Lowest contrast across all tiers and surfaces after the fix. */
  worstContrast: number;
}

/**
 * Primary, secondary and tertiary text colours for a set of surfaces. The ink comes from the
 * sky's brightness; each tier starts at its design alpha and rises only as far as the minimum
 * requires, so colours that already pass keep their look.
 */
export function textTiers(
  surfaces: readonly Rgb[],
  design: { secondary: number; tertiary: number },
  minimum = MIN_TEXT_CONTRAST,
): TextTiers {
  const ink = pickInk(surfaces);
  const parsed = parseColor(ink);
  if (!parsed) throw new Error('contrast: ink');
  const primaryAlpha = alphaForContrast(ink, surfaces, 1, minimum);
  const secondaryAlpha = alphaForContrast(ink, surfaces, design.secondary, minimum);
  const tertiaryAlpha = alphaForContrast(ink, surfaces, design.tertiary, minimum);
  const at = (alpha: number) =>
    alpha >= 1 ? ink : `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`;
  const tiers = { primary: at(primaryAlpha), secondary: at(secondaryAlpha), tertiary: at(tertiaryAlpha) };
  const worstContrast = Math.min(
    ...[primaryAlpha, secondaryAlpha, tertiaryAlpha].flatMap((alpha) =>
      surfaces.map((surface) => contrastRatio(composite({ ...parsed, a: alpha }, surface), surface)),
    ),
  );
  return { ...tiers, worstContrast };
}
