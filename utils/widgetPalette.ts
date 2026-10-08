/**
 * Colour and shape tokens for the Android home-screen widgets.
 *
 * Widgets are rendered as RemoteViews, which cannot run animations, so colour and
 * corner radius are the only expressive channels they have. This module is pure
 * data plus two pure accessors. It has no React and no widget-library import, and
 * it does not touch the widget data path.
 *
 * `night` is the default family (deep blue, the same sky family as the app's night
 * screens). `dusk` is the Sun widget's violet. Gold is the shared accent, so the Sun
 * widget reads as one family with the in-app sun card.
 */

export type WidgetTone = 'night' | 'dusk';

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
  /** Slightly darker row fill used behind hourly and dashboard strips. */
  readonly strip: WidgetColor;
  /** Amber, used only for the stale-data warning tint. */
  readonly stale: WidgetColor;
  /** Sun arc and highlight colour. */
  readonly gold: WidgetColor;
}

export const WIDGET_CORNER_RADIUS = 24;

export const WIDGET_PALETTES: Readonly<Record<WidgetTone, WidgetPalette>> = {
  night: {
    bgFrom: '#13224A',
    bgTo: '#2F5597',
    text: '#FFFFFF',
    subtle: '#D2DFF3',
    chip: '#23407C',
    strip: '#1C3568',
    stale: '#F5B82E',
    gold: '#F2C65E',
  },
  dusk: {
    bgFrom: '#2A1B4B',
    bgTo: '#6B3F7E',
    text: '#FFFFFF',
    subtle: '#E6D3EA',
    chip: '#44305F',
    strip: '#3A2956',
    stale: '#F5B82E',
    gold: '#F2C65E',
  },
};

/** Returns the palette for a tone. Pure: the same tone always yields the same object. */
export function widgetPalette(tone: WidgetTone): WidgetPalette {
  return WIDGET_PALETTES[tone];
}

/** Top-to-bottom gradient in the shape react-native-android-widget expects. */
export function widgetGradient(palette: Pick<WidgetPalette, 'bgFrom' | 'bgTo'>) {
  return { from: palette.bgFrom, to: palette.bgTo, orientation: 'TOP_BOTTOM' as const };
}
