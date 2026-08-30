import { t } from '../utils/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { F } from '../theme/typography';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Zap } from '../utils/uiIcons';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import type { AppTheme } from '../theme/palettes';

interface StormDistanceCardProps {
  theme: AppTheme;
}

type Phase = 'idle' | 'counting' | 'result';

export function StormDistanceCard({ theme }: StormDistanceCardProps) {
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
    intervalRef.current = setInterval(() => {
      setSeconds((Date.now() - startRef.current) / 1000);
    }, 500);
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

  const distanceKm = seconds / 3;

  return (
    <Card theme={theme} title={t('card_storm')} icon={Zap} style={styles.card} revealDelay={600}>
      {phase === 'result' ? (
        <>
          <Text style={[styles.distance, { color: theme.textPrimary }]}>
            {distanceKm < 1 ? '<1' : Math.round(distanceKm)} km
          </Text>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            {distanceKm < 3
              ? 'Very close — take shelter immediately'
              : distanceKm < 10
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
          >
            <Text style={[styles.buttonText, { color: theme.textPrimary }]}>{t('storm_measure')}</Text>
          </Pressable>
        </>
      ) : phase === 'counting' ? (
        <>
          <Text style={[styles.listening, { color: theme.textPrimary }]}>
            {Math.floor(seconds)}s
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
          >
            <Text style={[styles.buttonText, { color: theme.textPrimary }]}>{t('storm_flash')}</Text>
          </Pressable>
        </>
      )}
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
});
