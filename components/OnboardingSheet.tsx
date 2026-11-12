import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudSun, Globe2, ShieldCheck } from 'lucide-react-native';
import { Overlay } from './Overlay';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';

const SLIDES = [
  { icon: CloudSun, titleKey: 'ob_welcome_title', bodyKey: 'ob_welcome_body' },
  { icon: ShieldCheck, titleKey: 'ob_privacy_title', bodyKey: 'ob_privacy_body' },
  { icon: Globe2, titleKey: 'ob_explore_title', bodyKey: 'ob_explore_body' },
] as const;

interface OnboardingSheetProps {
  theme: AppTheme;
  visible: boolean;
  /** Persist the flag + close. */
  onComplete: () => void;
}

/**
 * First-launch intro: three short slides (welcome, privacy, where things
 * live) on the same bottom-sheet surface as Settings. Skippable at any point
 * via the action button or the sheet's own backdrop close - both complete the
 * flag, so it never shows twice.
 */
export function OnboardingSheet({ theme, visible, onComplete }: OnboardingSheetProps) {
  const [step, setStep] = useState(0);
  const last = step === SLIDES.length - 1;
  const slide = SLIDES[step];
  const Icon = slide.icon;

  const finish = () => {
    setStep(0);
    onComplete();
  };

  return (
    <Overlay theme={theme} visible={visible} onClose={finish} panelStyle="bottom">
      <View style={styles.wrap}>
        <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
          <Icon size={30} color={theme.accent} strokeWidth={1.9} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t(slide.titleKey)}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{t(slide.bodyKey)}</Text>

        <View style={styles.dots}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                { backgroundColor: index === step ? theme.accent : theme.trackColor },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={() => {
            if (last) finish();
            else setStep(step + 1);
          }}
          accessibilityRole="button"
          accessibilityLabel={last ? t('ob_done') : t('ob_next')}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.actionText, { color: theme.isLight ? '#FFFFFF' : '#0A122B' }]}>
            {last ? t('ob_done') : t('ob_next')}
          </Text>
        </Pressable>
        {!last ? (
          <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel={t('ob_skip')}>
            <Text style={[styles.skip, { color: theme.textTertiary }]}>{t('ob_skip')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingBottom: 12,
  },
  iconBox: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: F.semibold,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  action: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 999,
    marginBottom: 10,
  },
  actionText: {
    fontSize: 15,
    fontFamily: F.semibold,
  },
  skip: {
    fontSize: 13,
    fontFamily: F.medium,
    padding: 6,
  },
});
