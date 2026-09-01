import { getWeatherIcon, resolveWeatherIconProps } from '../utils/icons';

interface WeatherIconProps {
  code: number | null | undefined;
  isDay: boolean;
  size: number;
  /** Theme color used by outline/filled; the colorful style picks a semantic hue instead. */
  themeColor: string;
}

/** Weather-condition icon honoring the user's icon-style setting. */
export function WeatherIcon({ code, isDay, size, themeColor }: WeatherIconProps) {
  if (code === null || code === undefined) return null;
  const Icon = getWeatherIcon(code, isDay);
  const { color, fill, strokeWidth } = resolveWeatherIconProps(code, isDay, themeColor);
  // Decorative: the glyphs carry no unique information — surfaces that do
  // state the condition label it in text.
  return (
    <Icon
      size={size}
      color={color}
      fill={fill}
      strokeWidth={strokeWidth}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
