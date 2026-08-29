import { buildTheme, type AppTheme, type Palette, type StyleMode } from '../theme/palettes';

export type HomeBackgroundKey =
  | 'dynamic'
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'forest'
  | 'midnight';

export interface BackgroundOption {
  key: HomeBackgroundKey;
  label: string;
  /** Preview/fixed gradient. For 'dynamic' this is just a preview - the live
   * weather palette is used at runtime. */
  gradient: readonly [string, string, string];
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { key: 'dynamic', label: 'Dynamic', gradient: ['#2C5F8A', '#4E86B4', '#7FA9C9'] },
  { key: 'aurora', label: 'Aurora', gradient: ['#070D24', '#123B63', '#1E8A6E'] },
  { key: 'sunset', label: 'Sunset', gradient: ['#31173F', '#A34A6B', '#F0964E'] },
  { key: 'ocean', label: 'Ocean', gradient: ['#052A42', '#0E5A85', '#2FA3AC'] },
  { key: 'forest', label: 'Forest', gradient: ['#0F2A1B', '#245736', '#5C9E68'] },
  { key: 'midnight', label: 'Midnight', gradient: ['#04060E', '#101828', '#28324A'] },
];

export function getBackgroundOption(key: string): BackgroundOption | null {
  return BACKGROUND_OPTIONS.find((option) => option.key === key) ?? null;
}

/**
 * 'dynamic' keeps the live weather-driven theme untouched. A fixed design
 * rebuilds the whole theme from that gradient (all fixed designs are dark),
 * so text, chips and Material You card tints stay coherent and readable.
 */
export function applyHomeBackground(
  theme: AppTheme,
  key: string,
  styleMode: StyleMode,
): AppTheme {
  if (key === 'dynamic' || key === '') return theme;
  const option = getBackgroundOption(key);
  if (!option) return theme;
  const palette: Palette = { gradient: option.gradient, light: false, accent: theme.accent };
  return buildTheme(palette, styleMode);
}
