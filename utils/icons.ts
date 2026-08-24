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
