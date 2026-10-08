/**
 * Colour helpers shared by the Skia drawing code and the contrast checks.
 * Only the two forms the theme uses are supported: #RRGGBB and rgba(r,g,b,a).
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-fA-F]{6})$/;
const HEX_ALPHA = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/;
const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/** Parses #RRGGBB or rgb()/rgba() into channels 0-255 and alpha 0-1. Null for other forms. */
export function parseColor(color: string): Rgba | null {
  const hexAlpha = HEX_ALPHA.exec(color);
  if (hexAlpha) {
    const value = parseInt(hexAlpha[1], 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
      a: parseInt(hexAlpha[2], 16) / 255,
    };
  }
  const hex = HEX.exec(color);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 1 };
  }
  const rgba = RGBA.exec(color);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return null;
}

/** Same colour with a new alpha. Unknown forms are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${Math.round(parsed.r)},${Math.round(parsed.g)},${Math.round(parsed.b)},${a.toFixed(3)})`;
}

/**
 * Linear mix of two #RRGGBB colours, returned as #RRGGBB. lerpColor in utils/format returns
 * rgb() strings, which cannot be mixed again; chaining two mixes needs this form.
 */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return from;
  const k = Math.min(1, Math.max(0, t));
  const channel = (x: number, y: number) => Math.round(x + (y - x) * k);
  const hex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${hex(channel(a.r, b.r))}${hex(channel(a.g, b.g))}${hex(channel(a.b, b.b))}`;
}
