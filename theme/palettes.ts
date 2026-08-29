import { lerpColor } from '../utils/format';

export type WeatherCondition =
  | 'clear'
  | 'partlyCloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'freezing'
  | 'snow'
  | 'thunder';

export interface Palette {
  gradient: readonly [string, string, string];
  light: boolean;
  accent: string;
}

type ConditionPalettes = Record<WeatherCondition, { day: Palette; night: Palette }>;

export const PALETTES: ConditionPalettes = {
  clear: {
    day: { gradient: ['#3E8ED8', '#79BEF0', '#FCD08A'], light: false, accent: '#FFB74A' },
    night: { gradient: ['#0D1631', '#1C2B54', '#33477B'], light: false, accent: '#9FB6F2' },
  },
  partlyCloudy: {
    day: { gradient: ['#4E86B4', '#7FA9C9', '#C9D8E4'], light: false, accent: '#8EC9F0' },
    night: { gradient: ['#131C33', '#26344F', '#415270'], light: false, accent: '#8FA8D8' },
  },
  cloudy: {
    day: { gradient: ['#64798A', '#8FA2B1', '#BBC8D2'], light: false, accent: '#B8C6D4' },
    night: { gradient: ['#161D27', '#28323E', '#404C5A'], light: false, accent: '#93A3B3' },
  },
  fog: {
    day: { gradient: ['#93A0AE', '#B4BEC8', '#D8DDE3'], light: true, accent: '#CBD2DA' },
    night: { gradient: ['#20242C', '#373C46', '#545963'], light: false, accent: '#A7ADB8' },
  },
  drizzle: {
    day: { gradient: ['#47748F', '#6B94AB', '#95B9CA'], light: false, accent: '#8ED0F5' },
    night: { gradient: ['#13202D', '#24384A', '#3B5468'], light: false, accent: '#7CB8D8' },
  },
  rain: {
    day: { gradient: ['#35597A', '#507894', '#7196AE'], light: false, accent: '#8ED0F5' },
    night: { gradient: ['#0F1A26', '#1E3040', '#324A5E'], light: false, accent: '#74A8C8' },
  },
  showers: {
    day: { gradient: ['#3A6B84', '#5B8CA3', '#81ACBD'], light: false, accent: '#8ED0F5' },
    night: { gradient: ['#111F2B', '#213645', '#365165'], light: false, accent: '#78ACC9' },
  },
  freezing: {
    day: { gradient: ['#57809B', '#7BA6B9', '#A5CBDA'], light: false, accent: '#A8E4EF' },
    night: { gradient: ['#132330', '#233A4C', '#39566A'], light: false, accent: '#8CC4D8' },
  },
  snow: {
    day: { gradient: ['#7E9DBD', '#A6BFD8', '#DCE7F2'], light: true, accent: '#E8F1FA' },
    night: { gradient: ['#18222F', '#2C3E56', '#48607E'], light: false, accent: '#B4CCE8' },
  },
  thunder: {
    day: { gradient: ['#2A3044', '#40465F', '#585F80'], light: false, accent: '#B9A7F5' },
    night: { gradient: ['#101220', '#1D2030', '#303347'], light: false, accent: '#A293DE' },
  },
};

export function getPalette(condition: WeatherCondition, isDay: boolean): Palette {
  const pair = PALETTES[condition] ?? PALETTES.cloudy;
  return isDay ? pair.day : pair.night;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type StyleMode = 'material' | 'glass';

export interface AppTheme {
  gradient: readonly [string, string, string];
  isLight: boolean;
  styleMode: StyleMode;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  cardBg: string;
  cardBorder: string;
  chipBg: string;
  trackColor: string;
  accent: string;
  blurIntensity: number;
  blurTint: 'light' | 'dark';
}

function baseTheme(palette: Palette): Omit<AppTheme, 'styleMode' | 'blurIntensity' | 'blurTint'> {
  if (palette.light) {
    return {
      gradient: palette.gradient,
      isLight: true,
      textPrimary: '#1C2431',
      textSecondary: 'rgba(28,36,49,0.68)',
      textTertiary: 'rgba(28,36,49,0.45)',
      cardBg: 'rgba(255,255,255,0.52)',
      cardBorder: 'rgba(28,36,49,0.08)',
      chipBg: 'rgba(255,255,255,0.65)',
      trackColor: 'rgba(28,36,49,0.14)',
      accent: palette.accent,
    };
  }
  return {
    gradient: palette.gradient,
    isLight: false,
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.74)',
    textTertiary: 'rgba(255,255,255,0.5)',
    cardBg: 'rgba(255,255,255,0.12)',
    cardBorder: 'rgba(255,255,255,0.14)',
    chipBg: 'rgba(255,255,255,0.18)',
    trackColor: 'rgba(255,255,255,0.18)',
    accent: palette.accent,
  };
}

/**
 * Material You: solid, opaque surfaces tinted from the live weather palette
 * (Gradient-Weather style slabs). Liquid Glass: translucent blurred panels.
 */
export function buildTheme(
  palette: Palette,
  styleMode: StyleMode = 'material',
): AppTheme {
  const base = baseTheme(palette);
  if (styleMode === 'glass') {
    return {
      ...base,
      styleMode: 'glass',
      cardBg: base.isLight ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)',
      cardBorder: base.isLight ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.28)',
      chipBg: base.isLight ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.16)',
      blurIntensity: base.isLight ? 55 : 40,
      blurTint: base.isLight ? 'light' : 'dark',
    };
  }

  const mid = palette.gradient[1];
  const card = palette.light
    ? lerpColor(mid, '#FFFFFF', 0.62)
    : lerpColor(mid, '#FFFFFF', 0.13);
  const chip = palette.light
    ? lerpColor(card, '#1C2431', 0.05)
    : lerpColor(card, '#FFFFFF', 0.11);

  return {
    ...base,
    styleMode: 'material',
    cardBg: card,
    cardBorder: palette.light ? 'rgba(28,36,49,0.05)' : 'rgba(255,255,255,0.06)',
    chipBg: chip,
    blurIntensity: 0,
    blurTint: base.isLight ? 'light' : 'dark',
  };
}
