import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Sun,
  Moon as MoonIcon,
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
import { Card } from './Card';
import { WindCompass } from './WindCompass';
import { AqiGauge } from './AqiGauge';
import { SunArc } from './SunArc';
import type { AppTheme } from '../theme/palettes';
import { uvBand, humidityComfort } from '../utils/aqi';
import { moonPhase } from '../utils/moon';
import {
  dewPointComfort,
  formatPressureTrend,
  formatVisibility,
} from '../utils/format';
import type { AqiInfo, CurrentConditions, DayPoint } from '../api/types';

interface DetailCardsProps {
  theme: AppTheme;
  current: CurrentConditions;
  today: DayPoint | null;
  aqi: AqiInfo | null;
  utcOffsetSeconds: number;
}

export function DetailCards({ theme, current, today, aqi, utcOffsetSeconds }: DetailCardsProps) {
  const uv = today?.uvIndexMax ?? null;
  const uvInfo = uvBand(uv);
  const uvFraction = uv === null ? 0 : Math.min(uv / 11, 1);
  const moon = moonPhase();
  const trend = formatPressureTrend(current.pressureTrend);

  return (
    <View style={styles.grid}>
      <Card revealDelay={0} theme={theme} title="Wind" icon={Wind} style={styles.half}>
        <WindCompass
          theme={theme}
          speed={current.windSpeed}
          gusts={current.windGusts}
          direction={current.windDirection}
        />
      </Card>

      <Card revealDelay={60} theme={theme} title="Air Quality" icon={Gauge} style={styles.half}>
        <AqiGauge theme={theme} usAqi={aqi?.usAqi ?? null} pm2_5={aqi?.pm2_5 ?? null} />
      </Card>

      <Card revealDelay={120} theme={theme} title="UV Index" icon={Sun} style={styles.half}>
        <View style={styles.stack}>
          <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
            {uv === null ? '--' : Math.round(uv)}
          </Text>
          <Text style={[styles.bandLabel, { color: uvInfo ? uvInfo.color : theme.textTertiary }]}>
            {uvInfo ? uvInfo.label : 'Unavailable'}
          </Text>
          <View style={[styles.uvTrack, { backgroundColor: theme.trackColor }]}>
            <View
              style={[
                styles.uvFill,
                {
                  width: `${uvFraction * 100}%`,
                  backgroundColor: uvInfo ? uvInfo.color : theme.trackColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            Max for today · {uv !== null && uv >= 6 ? 'Sunscreen advised' : 'Low concern'}
          </Text>
        </View>
      </Card>

      <Card revealDelay={180} theme={theme} title="Humidity" icon={Droplets} style={styles.half}>
        <View style={styles.stack}>
          <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
            {Math.round(current.humidity)}%
          </Text>
          <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>
            {humidityComfort(current.humidity)}
          </Text>
          <View style={[styles.uvTrack, { backgroundColor: theme.trackColor }]}>
            <View
              style={[
                styles.uvFill,
                {
                  width: `${Math.min(current.humidity, 100)}%`,
                  backgroundColor: '#8ED0F5',
                },
              ]}
            />
          </View>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            Dew point{' '}
            {current.dewPoint !== null ? `${Math.round(current.dewPoint)}°` : '--'} ·{' '}
            {current.dewPoint !== null
              ? dewPointComfort(current.temperature, current.dewPoint)
              : 'n/a'}
          </Text>
        </View>
      </Card>

      <Card revealDelay={240} theme={theme} title="Visibility" icon={Eye} style={styles.half}>
        <View style={styles.stack}>
          <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
            {formatVisibility(current.visibility)}
          </Text>
          <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>
            {current.visibility === null
              ? 'No data'
              : current.visibility >= 20000
                ? 'Crystal clear'
                : current.visibility >= 10000
                  ? 'Clear'
                  : current.visibility >= 4000
                    ? 'Moderate haze'
                    : 'Poor · fog likely'}
          </Text>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            Horizontal sight distance
          </Text>
        </View>
      </Card>

      <Card revealDelay={300} theme={theme} title="Pressure" icon={Gauge} style={styles.half}>
        <View style={styles.stack}>
          <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
            {Math.round(current.pressure)}
            <Text style={[styles.unitText, { color: theme.textSecondary }]}> hPa</Text>
          </Text>
          <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>{trend}</Text>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            {trend === 'Falling'
              ? 'Weather may worsen soon'
              : trend === 'Rising'
                ? 'Conditions settling down'
                : 'Sea-level adjusted · 3h change'}
          </Text>
        </View>
      </Card>

      <Card revealDelay={360} theme={theme} title="Precipitation" icon={Umbrella} style={styles.half}>
        <View style={styles.stack}>
          <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
            {current.precipitation.toFixed(1)}
            <Text style={[styles.unitText, { color: theme.textSecondary }]}> mm</Text>
          </Text>
          <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>
            {current.precipitation > 0 ? 'Falling right now' : 'None right now'}
          </Text>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            {today ? `${Math.round(today.precipProbabilityMax)}% chance of rain today` : 'Live accumulation'}
          </Text>
        </View>
      </Card>

      <Card revealDelay={420} theme={theme} title="Moon" icon={MoonIcon} style={styles.half}>
        <View style={styles.stack}>
          <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
            {moon.illumination}%
          </Text>
          <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>{moon.phaseName}</Text>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            Day {Math.round(moon.ageDays)} of the 29.5-day cycle
          </Text>
        </View>
      </Card>

      <Card revealDelay={480} theme={theme} title="Sunrise & Sunset" style={styles.full}>
        <SunArc
          theme={theme}
          sunrise={today?.sunrise ?? ''}
          sunset={today?.sunset ?? ''}
          utcOffsetSeconds={utcOffsetSeconds}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  half: {
    flexGrow: 1,
    flexBasis: '47.2%',
  },
  full: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  stack: {
    gap: 9,
  },
  bigValue: {
    fontSize: 40,
    fontWeight: '600',
    includeFontPadding: false,
  },
  unitText: {
    fontSize: 17,
    fontWeight: '500',
  },
  bandLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: -4,
  },
  uvTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  uvFill: {
    height: 6,
    borderRadius: 3,
  },
  caption: {
    fontSize: 12,
  },
});
