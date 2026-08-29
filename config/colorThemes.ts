import { buildTheme, type AppTheme, type Palette, type StyleMode } from '../theme/palettes';

export type ColorThemeKey =
  | 'default'
  | 'white'
  | 'skyblue'
  | 'midnight'
  | 'forest'
  | 'lavender'
  | 'sunset'
  | 'sepia'
  | 'amoled';

export interface ColorThemeOption {
  key: ColorThemeKey;
  label: string;
  /** Single circle color shown in the settings grid */
  swatch: string;
  gradient: readonly [string, string, string];
  light: boolean;
}

export const COLOR_THEMES: ColorThemeOption[] = [
  { key: 'default', label: 'Default', swatch: '#4E86B4', gradient: ['#3E8ED8', '#79BEF0', '#FCD08A'], light: false },
  { key: 'white', label: 'White', swatch: '#FDFDFE', gradient: ['#F7F8FA', '#EFF1F4', '#E3E6EB'], light: true },
  { key: 'skyblue', label: 'Sky Blue', swatch: '#A9D0F2', gradient: ['#D9ECFB', '#C3E0F6', '#A9D0F2'], light: true },
  { key: 'midnight', label: 'Midnight', swatch: '#141D33', gradient: ['#0A0F1C', '#141D33', '#233150'], light: false },
  { key: 'forest', label: 'Forest', swatch: '#31614A', gradient: ['#122A1E', '#1F4634', '#31614A'], light: false },
  { key: 'lavender', label: 'Lavender', swatch: '#C6B4F0', gradient: ['#F0EBFC', '#E4DCF9', '#D3C7F3'], light: true },
  { key: 'sunset', label: 'Sunset', swatch: '#F2AC6E', gradient: ['#FDF1E6', '#F8DCC3', '#F2AC6E'], light: true },
  { key: 'sepia', label: 'Sepia', swatch: '#D9CEB9', gradient: ['#F7F2E8', '#EEE6D6', '#D9CEB9'], light: true },
  { key: 'amoled', label: 'AMOLED', swatch: '#000000', gradient: ['#000000', '#000000', '#070707'], light: false },
];

export function getColorTheme(key: string): ColorThemeOption | null {
  return COLOR_THEMES.find((option) => option.key === key) ?? null;
}

/**
 * 'default' keeps whatever the weather/home-background pipeline produced.
 * A fixed theme rebuilds the whole theme from its gradient so cards, chips
 * and text colors all match the chosen look.
 */
export function applyColorTheme(
  theme: AppTheme,
  key: string,
  styleMode: StyleMode,
): AppTheme {
  if (key === 'default' || key === '') return theme;
  const option = getColorTheme(key);
  if (!option) return theme;
  const palette: Palette = { gradient: option.gradient, light: option.light, accent: theme.accent };
  return buildTheme(palette, styleMode);
}
