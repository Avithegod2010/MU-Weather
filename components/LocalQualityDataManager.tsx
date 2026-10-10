import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Database } from '../utils/uiIcons';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import {
  clearAllLocalQualityData,
  clearLocalQualityDataForLocation,
  loadLocalQualityDataSummary,
} from '../utils/localDataManager';
import type { LocalQualityDataSummary, LocalQualityLocationSummary } from '../utils/localDataManager';

function substitute(key: Parameters<typeof t>[0], values: Record<string, string | number>): string {
  let result = t(key);
  for (const [name, value] of Object.entries(values)) result = result.replace(`{${name}}`, String(value));
  return result;
}

function locationLabel(location: LocalQualityLocationSummary): string {
  if (location.latitude === null || location.longitude === null) {
    const scope = location.feedbackScopes[0] ?? '';
    return substitute('local_data_legacy_location', { scope });
  }
  return `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`;
}

function locationCounts(location: LocalQualityLocationSummary): string {
  return substitute('local_data_location_counts', {
    rainHours: location.rainHourly,
    verifiedRainHours: location.rainHourlyVerified,
    rainDays: location.rainDaily,
    verifiedRainDays: location.rainDailyVerified,
    ensemble: location.ensemble,
    verifiedEnsemble: location.ensembleVerified,
    outdoor: location.outdoorFeedback,
    storm: location.stormFeedback,
  });
}

function hasData(summary: LocalQualityDataSummary | null): boolean {
  return Boolean(summary && summary.totals.total > 0);
}

export function LocalQualityDataManager({
  theme,
  visible,
}: {
  theme: AppTheme;
  visible: boolean;
}) {
  const [summary, setSummary] = useState<LocalQualityDataSummary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    void loadLocalQualityDataSummary()
      .then((updated) => {
        if (cancelled) return;
        setSummary(updated);
        setStatusMessage(null);
      })
      .catch(() => {
        if (!cancelled) setStatusMessage(t('local_data_load_failed'));
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const clearLocation = useCallback((location: LocalQualityLocationSummary) => {
    if (busyKey !== null) return;
    const label = locationLabel(location);
    Alert.alert(
      t('local_data_clear_confirm_title'),
      substitute('local_data_clear_location_confirm', {
        records: location.total,
        location: label,
      }),
      [
        { text: t('backup_cancel'), style: 'cancel' },
        {
          text: t('local_data_clear_location'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyKey(location.key);
              setStatusMessage(null);
              try {
                await clearLocalQualityDataForLocation(location);
                const updated = await loadLocalQualityDataSummary();
                setSummary(updated);
                setStatusMessage(updated.locations.some((row) => row.key === location.key && row.total > 0)
                  ? t('local_data_clear_partial')
                  : t('local_data_cleared'));
              } catch {
                setStatusMessage(t('local_data_clear_partial'));
              } finally {
                setBusyKey(null);
              }
            })();
          },
        },
      ],
    );
  }, [busyKey]);

  const clearAll = useCallback(() => {
    if (!summary || busyKey !== null) return;
    Alert.alert(
      t('local_data_clear_confirm_title'),
      substitute('local_data_clear_all_confirm', { records: summary.totals.total }),
      [
        { text: t('backup_cancel'), style: 'cancel' },
        {
          text: t('local_data_clear_all'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyKey('all');
              setStatusMessage(null);
              try {
                await clearAllLocalQualityData();
                const updated = await loadLocalQualityDataSummary();
                setSummary(updated);
                setStatusMessage(updated.totals.total > 0
                  ? t('local_data_clear_partial')
                  : t('local_data_cleared'));
              } catch {
                setStatusMessage(t('local_data_clear_partial'));
              } finally {
                setBusyKey(null);
              }
            })();
          },
        },
      ],
    );
  }, [busyKey, summary]);

  const totalsLabel = summary
    ? substitute('local_data_total', {
        records: summary.totals.total,
        locations: summary.locations.length,
      })
    : '';

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
      <View style={styles.heading}>
        <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
          <Database size={18} color={theme.textPrimary} strokeWidth={2} />
        </View>
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {t('local_data_manager_title')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
            {t('local_data_manager_subtitle')}
          </Text>
        </View>
      </View>

      {summary === null ? (
        <Text style={[styles.empty, { color: theme.textTertiary }]}>
          {statusMessage ?? t('local_data_loading')}
        </Text>
      ) : summary.locations.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textTertiary }]}>{t('local_data_empty')}</Text>
      ) : (
        <>
          {summary ? (
            <Text style={[styles.total, { color: theme.textSecondary }]}>{totalsLabel}</Text>
          ) : null}
          {summary?.locations.map((location) => {
            const isBusy = busyKey === location.key || busyKey === 'all';
            return (
              <View key={location.key} style={[styles.locationRow, { borderColor: theme.cardBorder }]}>
                <View style={styles.locationText}>
                  <Text style={[styles.locationTitle, { color: theme.textPrimary }]}>
                    {locationLabel(location)}
                  </Text>
                  <Text style={[styles.locationCounts, { color: theme.textTertiary }]}>
                    {locationCounts(location)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => clearLocation(location)}
                  disabled={busyKey !== null}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={substitute('local_data_clear_location', { location: locationLabel(location) })}
                  accessibilityState={{ disabled: busyKey !== null }}
                  style={({ pressed }) => [
                    styles.clearButton,
                    { backgroundColor: theme.chipBg, opacity: busyKey !== null ? 0.5 : pressed ? 0.65 : 1 },
                  ]}
                >
                  <Text style={[styles.clearText, { color: theme.textSecondary }]}>
                    {isBusy ? '…' : t('alert_history_clear')}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}

      {statusMessage && summary !== null ? (
        <Text style={[styles.status, { color: theme.textSecondary }]} accessibilityRole="text">
          {statusMessage}
        </Text>
      ) : null}

      <Pressable
        onPress={clearAll}
        disabled={!hasData(summary) || busyKey !== null}
        accessibilityRole="button"
        accessibilityLabel={t('local_data_clear_all')}
        accessibilityState={{ disabled: !hasData(summary) || busyKey !== null }}
        style={({ pressed }) => [
          styles.clearAllButton,
          {
            backgroundColor: theme.chipBg,
            opacity: !hasData(summary) || busyKey !== null ? 0.45 : pressed ? 0.65 : 1,
          },
        ]}
      >
        <Text style={[styles.clearAllText, { color: theme.textPrimary }]}>
          {busyKey === 'all' ? '…' : t('local_data_clear_all')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, marginHorizontal: 16, marginTop: 8, padding: 12, gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontFamily: F.semibold },
  subtitle: { fontSize: 11, lineHeight: 15, fontFamily: F.regular },
  total: { fontSize: 11.5, fontFamily: F.medium },
  empty: { fontSize: 11.5, lineHeight: 16 },
  locationRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { flex: 1, gap: 2 },
  locationTitle: { fontSize: 11.5, fontFamily: F.medium },
  locationCounts: { fontSize: 10, lineHeight: 14 },
  clearButton: { minHeight: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  clearText: { fontSize: 10.5, fontFamily: F.medium },
  status: { fontSize: 11.5, lineHeight: 16 },
  clearAllButton: { minHeight: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  clearAllText: { fontSize: 11.5, fontFamily: F.semibold },
});
