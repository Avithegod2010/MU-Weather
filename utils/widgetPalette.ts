/**
 * Colours and shape for the Android home-screen widgets.
 *
 * Widgets are RemoteViews, so they cannot animate: colour is their only expressive
 * channel. The gradient comes from the app's own sky palette for the current weather
 * condition and day or night, so a widget matches the app's sky at that moment. Text
 * colour is chosen by contrast, and the gradient ends are nudged in lightness (never
 * in hue) until the text clears WCAG AA, so every sky stays legible.
 *
 * Pure functions only: no React, no widget-library import, no I/O.
 */
import { getPalette, type WeatherCondition } from '../theme/palettes';
import { describeWmo } from './wmo';

/** Hex colour in the form react-native-android-widget accepts (`ColorProp`). */
export type WidgetColor = `#${string}`;

export interface WidgetPalette {
  /** Top of the background gradient. */
  readonly bgFrom: WidgetColor;
  /** Bottom of the background gradient. */
  readonly bgTo: WidgetColor;
  readonly text: WidgetColor;
  readonly subtle: WidgetColor;
  readonly chip: WidgetColor;
  /** Row fill behind the hourly and dashboard strips. */
  readonly strip: WidgetColor;
  /** Warning tint for stale data. */
  readonly stale: WidgetColor;
  /** Sun arc and highlight colour. */
  readonly gold: WidgetColor;
}

/** What the sky looks like right now: the weather condition and whether it is daytime. */
export interface WidgetSky {
  condition: WeatherCondition;
  isDay: boolean;
}

export const WIDGET_CORNER_RADIUS = 24;

/** Used when a widget has no sky yet (placeholder and no-data states). Matches the night sky. */
export const WIDGET_FALLBACK_PALETTE: WidgetPalette = {
  bgFrom: '#13224A',
  bgTo: '#2F5597',
  text: '#FFFFFF',
  subtle: '#D2DFF3',
  chip: '#23407C',
  strip: '#1C3568',
  stale: '#F5B82E',
  gold: '#F2C65E',
};

const WHITE: WidgetColor = '#FFFFFF';
const INK: WidgetColor = '#14213F';
const BLACK: WidgetColor = '#000000';
const SAFE_FALLBACK: WidgetColor = '#2F5597';
// WCAG AA is 4.5:1. The small margin keeps rounding in the hex channels from dipping below it.
const AA_CONTRAST = 4.6;

/** Sky for a WMO weather code, using the same condition mapping as the app. */
export function widgetSky(weatherCode: number, isDay: boolean): WidgetSky {
  return { condition: describeWmo(weatherCode).condition, isDay };
}

/** Palette for a sky. Pure: the same sky always yields the same colours. */
export function widgetPaletteFor(sky?: WidgetSky): WidgetPalette {
  if (!sky) return WIDGET_FALLBACK_PALETTE;

  const stops = getPalette(sky.condition, sky.isDay).gradient.map(asHex);
  // Light text on dark skies, dark ink on light skies: whichever reads better
  // against the worst of the three gradient stops.
  const lightText = worstContrast(WHITE, stops) >= worstContrast(INK, stops);
  const text = lightText ? WHITE : INK;
  // Only the two ends of the gradient are drawn, so only they need to be legible.
  const from = legibleStop(stops[0], text);
  const to = legibleStop(stops[2], text);

  return {
    bgFrom: from,
    bgTo: to,
    text,
    subtle: legibleSubtle(mix(text, to, 0.2), text, [from, to]),
    chip: mix(to, WHITE, lightText ? 0.16 : 0.55),
    strip: mix(to, BLACK, lightText ? 0.2 : 0.06),
    stale: lightText ? '#F5B82E' : '#9A5B00',
    gold: lightText ? '#F2C65E' : '#8A5A00',
  };
}

/** Top-to-bottom gradient in the shape react-native-android-widget expects. */
export function widgetGradient(palette: Pick<WidgetPalette, 'bgFrom' | 'bgTo'>) {
  return { from: palette.bgFrom, to: palette.bgTo, orientation: 'TOP_BOTTOM' as const };
}

function asHex(value: string): WidgetColor {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? (value.toUpperCase() as WidgetColor) : SAFE_FALLBACK;
}

/** Moves a colour toward `to` by `amount` (0 keeps it, 1 is `to`). Hue is kept on the line between them. */
function mix(from: string, to: string, amount: number): WidgetColor {
  const channels = [1, 3, 5].map((offset) => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}` as WidgetColor;
}

/** Darkens a background for light text, or lightens it for ink, until it clears AA. */
function legibleStop(stop: WidgetColor, text: WidgetColor): WidgetColor {
  const away = text === WHITE ? BLACK : WHITE;
  let color = stop;
  for (let step = 0; step < 20 && contrast(text, color) < AA_CONTRAST; step += 1) {
    color = mix(color, away, 0.05);
  }
  return color;
}

/** Secondary text starts a little toward the background, then moves back toward the main text until it clears AA. */
function legibleSubtle(start: WidgetColor, text: WidgetColor, backgrounds: readonly WidgetColor[]): WidgetColor {
  let color = start;
  for (let step = 0; step < 12 && worstContrast(color, backgrounds) < AA_CONTRAST; step += 1) {
    color = mix(color, text, 0.25);
  }
  return color;
}

function worstContrast(text: WidgetColor, backgrounds: readonly WidgetColor[]): number {
  return Math.min(...backgrounds.map((background) => contrast(text, background)));
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16))
  );
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
