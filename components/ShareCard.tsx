import { t } from '../utils/i18n';
import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin } from '../utils/uiIcons';
import { WeatherIcon } from './WeatherIcon';
import { formatTemp, formatHourLabel, compassLabel, windUnitLabel } from '../utils/format';
import { moonPhase } from '../utils/moon';
import type { AppTheme } from '../theme/palettes';
import type { WeatherBundle } from '../api/types';

interface ShareCardProps {
  theme: AppTheme;
  data: WeatherBundle;
  conditionLabel: string;
  cardRef: React.LegacyRef<View> | undefined;
}

export function ShareCard({ theme, data, conditionLabel, cardRef }: ShareCardProps) {
  const today = data.daily[0];
  const moon = moonPhase();

  return (
    <View ref={cardRef} style={styles.captureWrap} collapsable={false}>
      <LinearGradient
        colors={[...theme.gradient] as [string, string, string]}
        locations={[0, 0.52, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.canvas}
      >
        <View style={styles.header}>
          <MapPin size={15} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={styles.city}>{data.location.name}</Text>
        </View>

        <WeatherIcon
          code={data.current.weatherCode}
          isDay={data.current.isDay}
          size={72}
          themeColor="#FFFFFF"
        />
        <Text style={styles.temperature}>{formatTemp(data.current.temperature)}</Text>
        <Text style={styles.condition}>{conditionLabel}</Text>
        <Text style={styles.feels}>
          {t('feels_like')} {formatTemp(data.current.apparentTemperature)}
        </Text>

        {today ? (
          <View style={styles.highLowChip}>
            <Text style={styles.highLowText}>
              H {formatTemp(today.tMax)}   ·   L {formatTemp(today.tMin)}
            </Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(data.current.windSpeed)}</Text>
            <Text style={styles.statLabel}>{windUnitLabel()} {compassLabel(data.current.windDirection)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(data.current.humidity)}%</Text>
            <Text style={styles.statLabel}>{t('card_humidity')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{moon.illumination}%</Text>
            <Text style={styles.statLabel}>{t('card_moon')}</Text>
          </View>
        </View>

        {data.hourly.length ? (
          <View style={styles.hoursRow}>
            {data.hourly.slice(0, 5).map((hour, index) => {
              return (
                <View key={hour.time} style={styles.hourCol}>
                  <Text style={styles.hourTime}>{formatHourLabel(hour.time, index === 0)}</Text>
                  <WeatherIcon code={hour.weatherCode} isDay={hour.isDay} size={20} themeColor="#FFFFFF" />
                  <Text style={styles.hourTemp}>{formatTemp(hour.temperature)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <Text style={styles.credit}>MU Weather · data by Open-Meteo</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  captureWrap: {
    position: 'absolute',
    top: 0,
    left: -9999,
    width: 360,
  },
  canvas: {
    width: 360,
    borderRadius: 32,
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 24,
    paddingHorizontal: 24,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 14,
  },
  city: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: F.semibold,
  },
  temperature: {
    color: '#FFFFFF',
    fontSize: 84,
    fontFamily: F.light,
    letterSpacing: -2,
    includeFontPadding: false,
  },
  condition: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: F.medium,
  },
  feels: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  highLowChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  highLowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: F.semibold,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingVertical: 14,
    alignSelf: 'stretch',
    justifyContent: 'space-evenly',
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: F.semibold,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  hoursRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'space-evenly',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 24,
    paddingVertical: 14,
  },
  hourCol: {
    alignItems: 'center',
    gap: 6,
  },
  hourTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10.5,
  },
  hourTemp: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: F.semibold,
  },
  credit: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 16,
  },
});
