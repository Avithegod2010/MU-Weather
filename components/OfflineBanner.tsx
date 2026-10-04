import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff } from '../utils/uiIcons';
import { t } from '../utils/i18n';
import { haptics } from '../utils/haptics';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';

/** Even with a successful fetch, a bundle older than this is called out. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
/** How often the "x min ago" label is recomputed while the banner is visible. */
const TICK_MS = 30 * 1000;

/** Localized relative age: "just now" / "12 min ago" / "5 h ago" / "3 d ago". */
export function describeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return t('age_now');
  if (minutes < 60) return t('age_min').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('age_hour').replace('{n}', String(hours));
  return t('age_day').replace('{n}', String(Math.floor(hours / 24)));
}

/**
 * Slim banner under the header shown when the app cannot reach the weather
 * service (offline) or when the data on screen is more than three hours old.
 * It never blocks the forecast - it just says how old the numbers are and
 * offers a retry tap. Renders nothing in the normal case.
 */
export function OfflineBanner({
  theme,
  fetchedAt,
  offline,
  onRetry,
}: {
  theme: AppTheme;
  fetchedAt: number | null;
  offline: boolean;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const age = fetchedAt === null ? null : Math.max(0, now - fetchedAt);
  const visible = offline || (age !== null && age > STALE_AFTER_MS);
  useEffect(() => {
    if (!visible) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [visible, fetchedAt]);
  if (!visible) return null;

  const title = offline ? t('offline_banner_offline') : t('offline_banner_stale');
  const detail =
    age === null ? t('offline_banner_no_data') : `${t('offline_banner_age')} ${describeAge(age)}`;

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onRetry();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => [
        styles.wrap,
        { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
        pressed && { opacity: 0.7 },
      ]}
    >
      <CloudOff size={16} color={theme.textSecondary} strokeWidth={2} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.detail, { color: theme.textTertiary }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Text style={[styles.action, { color: theme.accent }]}>{t('err_retry')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  texts: { flex: 1 },
  title: { fontSize: 13 },
  detail: { fontSize: 12, marginTop: 1 },
  action: { fontSize: 13, fontFamily: F.bold },
});