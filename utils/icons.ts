import { describeWmo } from './wmo';
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRainWind,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudHail,
} from './uiIcons';
import type { LucideIcon } from 'lucide-react-native';

export function getWeatherIcon(code: number | null | undefined, isDay: boolean): LucideIcon {
  if (code === 95) return CloudLightning;
  if (code === 96 || code === 99) return CloudHail;
  const { condition } = describeWmo(code);
  switch (condition) {
    case 'clear':
      return isDay ? Sun : Moon;
    case 'partlyCloudy':
      return isDay ? CloudSun : CloudMoon;
    case 'cloudy':
      return Cloud;
    case 'fog':
      return CloudFog;
    case 'drizzle':
      return CloudDrizzle;
    case 'rain':
      return CloudRain;
    case 'showers':
      return CloudRainWind;
    case 'freezing':
      return CloudSnow;
    case 'snow':
      return CloudSnow;
    case 'thunder':
      return CloudLightning;
    default:
      return Cloud;
  }
}

export type IconStyle = 'outline' | 'filled' | 'colorful';

let iconStyle: IconStyle = 'outline';

export function setIconStyle(style: IconStyle): void {
  iconStyle = style;
}

export function getIconStyle(): IconStyle {
  return iconStyle;
}

/** Semantic hues for the 'colorful' style - weather-true, theme-independent. */
function weatherSemanticColor(code: number, isDay: boolean): string {
  if (code === 95 || code === 96 || code === 99) return '#F0B440';
  const { condition } = describeWmo(code);
  switch (condition) {
    case 'clear':
      return isDay ? '#F5B843' : '#B7B1F0';
    case 'partlyCloudy':
      return isDay ? '#EFB25C' : '#A9A5E0';
    case 'fog':
      return '#A8ADB8';
    case 'drizzle':
    case 'rain':
    case 'showers':
      return '#6FA8E8';
    case 'freezing':
    case 'snow':
      return '#8FD4F0';
    case 'thunder':
      return '#F0B440';
    default:
      return '#9DB8D9';
  }
}

export interface ResolvedWeatherIconProps {
  color: string;
  fill: string;
  strokeWidth: number;
}

/** Render props for a lucide weather icon under the active icon style. */
export function resolveWeatherIconProps(
  code: number | null | undefined,
  isDay: boolean,
  themeColor: string,
): ResolvedWeatherIconProps {
  switch (getIconStyle()) {
    case 'filled':
      return { color: themeColor, fill: themeColor, strokeWidth: 1.6 };
    case 'colorful':
      return {
        color: weatherSemanticColor(code ?? 3, isDay),
        fill: 'none',
        strokeWidth: 2,
      };
    default:
      return { color: themeColor, fill: 'none', strokeWidth: 2 };
  }
}
