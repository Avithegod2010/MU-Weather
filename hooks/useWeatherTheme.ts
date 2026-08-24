import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, getPalette } from '../theme/palettes';
import type { AppTheme, StyleMode, ThemeMode, WeatherCondition } from '../theme/palettes';
import { describeWmo } from '../utils/wmo';
import type { WeatherBundle } from '../api/types';

export interface WeatherThemeInfo {
  theme: AppTheme;
  condition: WeatherCondition;
  conditionLabel: string;
  isDay: boolean;
}

export function useWeatherTheme(
  data: WeatherBundle | null,
  themeMode: ThemeMode = 'system',
  styleMode: StyleMode = 'material',
): WeatherThemeInfo {
  const colorScheme = useColorScheme();
  const weatherIsDay = data ? data.current.isDay : true;

  let isDay = weatherIsDay;
  if (themeMode === 'light') isDay = true;
  else if (themeMode === 'dark') isDay = false;
  else if (colorScheme === 'dark') isDay = false;
  else if (colorScheme === 'light') isDay = true;

  const info = describeWmo(data?.current.weatherCode);
  const condition: WeatherCondition = data ? info.condition : 'clear';

  const themeKey = `${condition}-${isDay ? 'day' : 'night'}-${styleMode}`;
  const theme = useMemo(
    () => buildTheme(getPalette(condition, isDay), styleMode),
    [themeKey],
  );

  return { theme, condition, conditionLabel: data ? info.label : 'Loading', isDay };
}
