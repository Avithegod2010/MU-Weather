import React from 'react';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
  Clock,
  MapPin,
  ArrowUp,
  ArrowDown,
  Droplet,
  Droplets,
  Wind,
  Gauge,
  Eye,
  Umbrella,
  WifiOff,
  RefreshCw,
  SearchX,
  Search,
  Star,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Vibrate,
  Thermometer,
  Database,
  Info,
  Map,
  Bell,
  Settings,
  TriangleAlert,
  Navigation2,
  Radar,
  Flower2,
  TrendingDown,
  Navigation,
  Sunrise,
  Sunset,
} from '../utils/uiIcons';
import type { AppTheme } from '../theme/palettes';
import { formatTime12, localIsoToEpoch } from '../utils/format';

interface SunArcProps {
  theme: AppTheme;
  sunrise: string;
  sunset: string;
  utcOffsetSeconds: number;
}

const WIDTH = 280;
const HEIGHT = 118;
const CX = WIDTH / 2;
const CY = 104;
const R = 88;
const ARC_LENGTH = Math.PI * R;

export function SunArc({ theme, sunrise, sunset, utcOffsetSeconds }: SunArcProps) {
  const localNowMs = Date.now() + utcOffsetSeconds * 1000;
  const rise = sunrise ? localIsoToEpoch(sunrise) : NaN;
  const set = sunset ? localIsoToEpoch(sunset) : NaN;

  let progress: number;
  if (Number.isNaN(rise) || Number.isNaN(set) || set <= rise) {
    progress = 0;
  } else {
    progress = (localNowMs - rise) / (set - rise);
  }
  progress = Math.min(1, Math.max(0, progress));
  const isDaytime = progress > 0 && progress < 1;

  const angle = Math.PI * (1 - progress);
  const sunX = CX - R * Math.cos(Math.PI - angle);
  const sunY = CY - R * Math.sin(angle);

  const daylightMs = Number.isNaN(rise) || Number.isNaN(set) ? 0 : set - rise;
  const daylightHours = Math.floor(daylightMs / 3600000);
  const daylightMinutes = Math.round((daylightMs % 3600000) / 60000);
  const daylightLabel =
    daylightHours > 0
      ? `${daylightHours}h ${String(daylightMinutes).padStart(2, '0')}m of daylight`
      : 'Sun is below the horizon';

  return (
    <View>
      <Svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          stroke={theme.trackColor}
          strokeWidth={3}
          fill="none"
          strokeDasharray="1 9"
          strokeLinecap="round"
        />
        <Path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          stroke={theme.accent}
          strokeWidth={3.5}
          fill="none"
          strokeDasharray={`${progress * ARC_LENGTH} ${ARC_LENGTH}`}
          strokeLinecap="round"
        />
        <Circle cx={sunX} cy={sunY} r={isDaytime ? 7 : 4} fill={theme.accent} opacity={isDaytime ? 1 : 0.45} />
      </Svg>

      <View style={styles.timesRow}>
        <View style={styles.timeBlock}>
          <View style={styles.timeLabelRow}>
            <Sunrise size={14} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.timeLabelText, { color: theme.textTertiary }]}>
              {t('sunrise').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.timeValue, { color: theme.textPrimary }]}>
            {formatTime12(sunrise)}
          </Text>
        </View>
        <View style={[styles.timeBlock, styles.rightBlock]}>
          <View style={styles.timeLabelRow}>
            <Sunset size={14} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.timeLabelText, { color: theme.textTertiary }]}>
              {t('sunset').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.timeValue, { color: theme.textPrimary }]}>
            {formatTime12(sunset)}
          </Text>
        </View>
      </View>

      <Text style={[styles.daylight, { color: theme.textTertiary }]}>{daylightLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
    paddingHorizontal: 6,
  },
  timeBlock: {
    gap: 3,
  },
  rightBlock: {
    alignItems: 'flex-end',
  },
  timeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timeLabelText: {
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 1.2,
  },
  timeValue: {
    fontSize: 17,
    fontFamily: F.semibold,
  },
  daylight: {
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
