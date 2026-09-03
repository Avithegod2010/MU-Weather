import { t } from '../utils/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { F } from '../theme/typography';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Zap } from '../utils/uiIcons';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { capeBand } from '../utils/storm';
import { formatHourLabel } from '../utils/format';
import type { AppTheme } from '../theme/palettes';

interface StormDistanceCardProps {
  theme: AppTheme;
  stormRisk?: { cape: number; time: string } | null;
}

type Phase = 'idle' | 'counting' | 'result';

/** Speed of sound at sea level, m/s — converts flash-to-bang time to distance. */
const SOUND_SPEED_MPS = 343;

/** Matches the band colours used across the app (HealthCard / utils/aqi.ts). */
const BAND_COLORS: Record<'low' | 'moderate' | 'high', string> = {
  low: '#5BC98C',
  moderate: '#E8D05A',
  high: '#E85F5F',
};

export function StormDistanceCard({ theme, stormRisk }: StormDistanceCardProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const startTimer = () => {
    haptics.light();
    clearTimer();
    startRef.current = Date.now();
    setSeconds(0);
    setPhase('counting');
    // Fast tick so the live distance visibly climbs while counting.
    intervalRef.current = setInterval(() => {
      setSeconds((Date.now() - startRef.current) / 1000);
    }, 100);
  };

  const registerThunder = () => {
    if (phase !== 'counting') return;
    haptics.warning();
    clearTimer();
    setSeconds(Math.max((Date.now() - startRef.current) / 1000, 1));
    setPhase('result');
  };

  const reset = () => {
    haptics.select();
    clearTimer();
    setSeconds(0);
    setPhase('idle');
  };

  const distanceMeters = seconds * SOUND_SPEED_MPS;

  return (
    <Card theme={theme} title={t('card_storm')} icon={Zap} style={styles.card} revealDelay={600}>
      {phase === 'result' ? (
        <>
          <Text style={[styles.distance, { color: theme.textPrimary }]}>
            {distanceMeters < 1000
              ? `${Math.round(distanceMeters / 10) * 10} m`
              : `${(distanceMeters / 1000).toFixed(distanceMeters < 10000 ? 1 : 0)} km`}
          </Text>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            {distanceMeters < 3000
              ? 'Very close — take shelter immediately'
              : distanceMeters < 10000
                ? 'Storm is near — stay alert'
                : 'Storm is at a safe distance'}
          </Text>
          <Pressable
            onPress={reset}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.chipBg },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.textPrimary }]}>{t('storm_measure')}</Text>
          </Pressable>
        </>
      ) : phase === 'counting' ? (
        <>
          <Text style={[styles.listening, { color: theme.textPrimary }]}>
            {Math.round(seconds * SOUND_SPEED_MPS / 10) * 10} m
          </Text>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            {t('storm_counting')}
          </Text>
          <Pressable
            onPress={registerThunder}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: '#E8B44A' },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: '#1C2431' }]}>{t('storm_thunder')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {t('storm_hint')}
          </Text>
          <Pressable
            onPress={startTimer}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.chipBg },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.textPrimary }]}>{t('storm_flash')}</Text>
          </Pressable>
        </>
      )}
      {stormRisk ? (
        (() => {
          const band = capeBand(stormRisk.cape);
          const bandLabel =
            band === 'high'
              ? t('band_high')
              : band === 'moderate'
                ? t('band_moderate')
                : t('band_low');
          const color = BAND_COLORS[band];
          const valueText = `CAPE ${Math.round(stormRisk.cape).toLocaleString('en-US')} J/kg · ${t('f_peak_around')} ${formatHourLabel(stormRisk.time, false)}`;
          return (
            <View
              style={styles.riskRow}
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={`${t('storm_risk')}, ${bandLabel}, ${valueText}`}
            >
              <View style={styles.riskHead}>
                <Text style={[styles.riskLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                  {t('storm_risk')}
                </Text>
                <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                  <View style={[styles.chipDot, { backgroundColor: color }]} />
                  <Text style={[styles.chipText, { color }]}>{bandLabel}</Text>
                </View>
              </View>
              <Text style={[styles.riskValue, { color: theme.textTertiary }]}>{valueText}</Text>
            </View>
          );
        })()
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  distance: {
    fontSize: 40,
    fontFamily: F.semibold,
    includeFontPadding: false,
  },
  listening: {
    fontSize: 34,
    fontFamily: F.semibold,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  caption: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  buttonText: {
    fontSize: 13.5,
    fontFamily: F.bold,
  },
  riskRow: {
    marginTop: 12,
    gap: 3,
  },
  riskHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  riskLabel: {
    fontSize: 13.5,
    fontFamily: F.semibold,
    flexShrink: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 11.5,
    fontFamily: F.semibold,
  },
  riskValue: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
