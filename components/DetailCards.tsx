import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Sun,
  Moon as MoonIcon,
  CloudLightning,
  CloudHail,
  Clock,
  ArrowUp,
  ArrowDown,
  Droplet,
  Droplets,
  Wind,
  Gauge,
  Eye,
  Umbrella,
  CalendarDays,
  Flower2,
} from '../utils/uiIcons';
import { Card } from './Card';
import { WindCompass } from './WindCompass';
import { AqiGauge } from './AqiGauge';
import { SunArc } from './SunArc';
import { getWeatherIcon } from '../utils/icons';
import type { AppTheme } from '../theme/palettes';
import { uvBand, humidityComfort } from '../utils/aqi';
import { moonPhase } from '../utils/moon';
import {
  dewPointComfort,
  formatPressureTrend,
  formatVisibility,
  formatTime12,
} from '../utils/format';
import { pollenLevel } from '../utils/aqi';
import {
  findGoldenBlueHours,
  daylightDeltaMinutes,
  moonTimes,
  formatDateClock,
} from '../utils/sunCalc';
import { StormDistanceCard } from './StormDistanceCard';
import { BarometerCard } from './BarometerCard';
import { FEATURES } from '../config/features';
import type { YearAgoState } from '../hooks/useYearAgo';
import type { PollenInfo } from '../api/types';
import type { AqiInfo, CurrentConditions, DayPoint, GeoLocation } from '../api/types';

const POLLEN_TYPES: Array<{ key: keyof PollenInfo; label: string }> = [
  { key: 'grass', label: 'Grass' },
  { key: 'birch', label: 'Birch' },
  { key: 'alder', label: 'Alder' },
  { key: 'mugwort', label: 'Mugwort' },
  { key: 'olive', label: 'Olive' },
  { key: 'ragweed', label: 'Ragweed' },
];

interface DetailCardsProps {
  theme: AppTheme;
  current: CurrentConditions;
  today: DayPoint | null;
  aqi: AqiInfo | null;
  utcOffsetSeconds: number;
  location: GeoLocation;
  yearAgo: YearAgoState;
}

export function DetailCards({
  theme,
  current,
  today,
  aqi,
  utcOffsetSeconds,
  location,
  yearAgo,
}: DetailCardsProps) {
  const uv = today?.uvIndexMax ?? null;
  const uvInfo = uvBand(uv);
  const uvFraction = uv === null ? 0 : Math.min(uv / 11, 1);
  const moon = moonPhase();
  const trend = formatPressureTrend(current.pressureTrend);

  const sunExtras = useMemo(
    () => ({
      hours: findGoldenBlueHours(location.latitude, location.longitude),
      delta: daylightDeltaMinutes(location.latitude, location.longitude),
    }),
    [location.latitude, location.longitude],
  );

  const moonTimesToday = useMemo(
    () => moonTimes(new Date(), location.latitude, location.longitude),
    [location.latitude, location.longitude],
  );

  const yearAgoDateLabel = yearAgo.info
    ? new Date(`${yearAgo.info.date}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const yearAgoDelta =
    yearAgo.info && today ? Math.round(yearAgo.info.tMax - today.tMax) : null;
  const YearAgoIcon = yearAgo.info ? getWeatherIcon(yearAgo.info.weatherCode, true) : null;

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
        <AqiGauge
          theme={theme}
          usAqi={aqi?.usAqi ?? null}
          pm2_5={aqi?.pm2_5 ?? null}
          pm10={aqi?.pm10 ?? null}
          ozone={aqi?.ozone ?? null}
          no2={aqi?.no2 ?? null}
          so2={aqi?.so2 ?? null}
        />
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
            Rises {moonTimesToday.rise ? formatDateClock(moonTimesToday.rise) : 'tomorrow'} ·
            Sets {moonTimesToday.set ? formatDateClock(moonTimesToday.set) : 'tomorrow'}
          </Text>
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
        <View style={styles.sunExtras}>
          <View style={styles.sunExtraRow}>
            <Text style={[styles.sunExtraLabel, { color: theme.textTertiary }]}>GOLDEN</Text>
            <Text style={[styles.sunExtraValue, { color: theme.textSecondary }]}>
              {sunExtras.hours.goldenMorning
                ? `${formatDateClock(sunExtras.hours.goldenMorning.start)} – ${formatDateClock(sunExtras.hours.goldenMorning.end)}`
                : '--'}
              {'  ·  '}
              {sunExtras.hours.goldenEvening
                ? `${formatDateClock(sunExtras.hours.goldenEvening.start)} – ${formatDateClock(sunExtras.hours.goldenEvening.end)}`
                : '--'}
            </Text>
          </View>
          <View style={styles.sunExtraRow}>
            <Text style={[styles.sunExtraLabel, { color: theme.textTertiary }]}>BLUE</Text>
            <Text style={[styles.sunExtraValue, { color: theme.textSecondary }]}>
              {sunExtras.hours.blueMorning
                ? `${formatDateClock(sunExtras.hours.blueMorning.start)} – ${formatDateClock(sunExtras.hours.blueMorning.end)}`
                : '--'}
              {'  ·  '}
              {sunExtras.hours.blueEvening
                ? `${formatDateClock(sunExtras.hours.blueEvening.start)} – ${formatDateClock(sunExtras.hours.blueEvening.end)}`
                : '--'}
            </Text>
          </View>
          {sunExtras.delta !== null ? (
            <Text style={[styles.daylightDelta, { color: theme.textTertiary }]}>
              {sunExtras.delta >= 0
                ? `+${sunExtras.delta}`
                : `${sunExtras.delta}`}{' '}
              minutes of daylight vs yesterday
            </Text>
          ) : null}
        </View>
      </Card>

      <Card revealDelay={540} theme={theme} title="A Year Ago" icon={CalendarDays} style={styles.half}>
        <View style={styles.stack}>
          {yearAgo.status === 'ok' && yearAgo.info && YearAgoIcon ? (
            <>
              <View style={styles.yearAgoRow}>
                <YearAgoIcon size={26} color={theme.textPrimary} strokeWidth={1.7} />
                <Text style={[styles.bigValue, { color: theme.textPrimary, fontSize: 30 }]}>
                  {Math.round(yearAgo.info.tMax)}°
                </Text>
              </View>
              <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>
                {yearAgoDateLabel} · low {Math.round(yearAgo.info.tMin)}°
              </Text>
              {yearAgoDelta !== null ? (
                <Text
                  style={[
                    styles.caption,
                    { color: yearAgoDelta > 1 ? '#F0964E' : yearAgoDelta < -1 ? '#7CC4F0' : theme.textTertiary },
                  ]}
                >
                  {yearAgoDelta > 0
                    ? `${yearAgoDelta}° warmer than today`
                    : yearAgoDelta < 0
                      ? `${Math.abs(yearAgoDelta)}° cooler than today`
                      : 'Same high as today'}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.bigValue, { color: theme.textTertiary }]}>--</Text>
              <Text style={[styles.caption, { color: theme.textTertiary }]}>
                {yearAgo.status === 'error'
                  ? 'Historical data unavailable'
                  : 'Loading history...'}
              </Text>
            </>
          )}
        </View>
      </Card>

      {aqi?.pollen ? (
        <Card revealDelay={600} theme={theme} title="Pollen" icon={Flower2} style={styles.half}>
          <View style={styles.stack}>
            {POLLEN_TYPES.map((type) => {
              const value = aqi.pollen?.[type.key];
              if (value === null || value === undefined) return null;
              const level = pollenLevel(value);
              return (
                <View key={type.key} style={styles.pollenRow}>
                  <Text style={[styles.pollenName, { color: theme.textSecondary }]}>{type.label}</Text>
                  <View style={[styles.pollenTrack, { backgroundColor: theme.trackColor }]}>
                    <View
                      style={[
                        styles.pollenFill,
                        {
                          width: `${Math.min((value / 100) * 100, 100)}%`,
                          backgroundColor: level.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.pollenValue, { color: theme.textPrimary }]}>
                    {Math.round(value)}
                  </Text>
                </View>
              );
            })}
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              Grains per m³ · Europe coverage
            </Text>
          </View>
        </Card>
      ) : null}

      <StormDistanceCard theme={theme} />

      {FEATURES.barometer ? (
        <BarometerCard
          theme={theme}
          forecastPressure={current.pressure}
          revealDelay={660}
        />
      ) : null}
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
  sunExtras: {
    marginTop: 12,
    gap: 7,
  },
  sunExtraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sunExtraLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    width: 52,
  },
  sunExtraValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
  },
  daylightDelta: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  yearAgoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pollenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pollenName: {
    fontSize: 12.5,
    width: 58,
  },
  pollenTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  pollenFill: {
    height: 5,
    borderRadius: 3,
  },
  pollenValue: {
    fontSize: 12,
    fontWeight: '600',
    width: 26,
    textAlign: 'right',
  },
});
