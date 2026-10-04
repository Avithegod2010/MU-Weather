import type { AppTheme, WeatherCondition } from '../theme/palettes';

/**
 * Optional "weather-tinted accent": the UI accent colour (chips, switches,
 * active rings, focus highlights) follows the current conditions instead of
 * the colour theme. Applied as the LAST step of the HomeScreen theme chain,
 * after the colour theme and density steps, so only the accent is replaced -
 * surfaces, text and gradients stay exactly as themed.
 *
 * The dark values mirror the existing per-condition palette accents so the
 * tint matches the background; the light values are the darker readable
 * variants of the same hues (a light card background needs more contrast
 * than a dark one).
 */
const ACCENTS: Record<WeatherCondition, { light: string; dark: string }> = {
  clear: { light: '#E08700', dark: '#FFB74A' },
  partlyCloudy: { light: '#2F7FBD', dark: '#8EC9F0' },
  cloudy: { light: '#5A6B7C', dark: '#B8C6D4' },
  fog: { light: '#6B7280', dark: '#CBD2DA' },
  drizzle: { light: '#0A7EA4', dark: '#8ED0F5' },
  rain: { light: '#1D6FB8', dark: '#8ED0F5' },
  showers: { light: '#1D6FB8', dark: '#8ED0F5' },
  freezing: { light: '#0E7490', dark: '#A8E4EF' },
  snow: { light: '#3E6E9E', dark: '#E8F1FA' },
  thunder: { light: '#6D4BD0', dark: '#B9A7F5' },
};

/**
 * Replace `theme.accent` with the condition-tinted accent. Returns the theme
 * object untouched (same reference) when the feature is off, when the
 * condition is unknown, or when the accent already matches.
 */
export function applyWeatherAccent(
  theme: AppTheme,
  enabled: boolean,
  condition: WeatherCondition | string | null | undefined,
): AppTheme {
  if (!enabled || !condition) return theme;
  const entry = ACCENTS[condition as WeatherCondition];
  if (!entry) return theme;
  const accent = theme.isLight ? entry.light : entry.dark;
  if (theme.accent === accent) return theme;
  return { ...theme, accent };
}