import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Circle, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { getLanguage, t } from '../utils/i18n';
import type { AppTheme } from '../theme/palettes';
import type { EnsembleRainEpisodePoint, EnsembleSpreadPoint, HourPoint } from '../api/types';
import { alignEnsembleRainProbabilities } from '../utils/rainChartOverlay';
import { formatHourLabel } from '../utils/format';
import { F } from '../theme/typography';
import { useReducedMotion } from '../utils/reduceMotion';
import type { RainCalibrationSummary } from '../utils/rainCalibrationMath';
import { ENSEMBLE_TTL_MS } from '../utils/ensembleCache';
import { assessSignalFreshness } from '../utils/freshnessPolicy';

interface RainProbabilityChartProps {
  theme: AppTheme;
  hours: HourPoint[];
  calibration?: RainCalibrationSummary;
  /** Direct daily ensemble-event probabilities; null means no ensemble snapshot is available. */
  rainEpisodes?: EnsembleRainEpisodePoint[] | null;
  /** Optional hourly raw ICON-EPS rain shares, aligned by local timestamp. */
  ensemblePoints?: EnsembleSpreadPoint[] | null;
  ensembleFetchedAt?: number | null;
  now: number;
}

const BAR_COUNT = 12;
const CHART_HEIGHT = 132;
const BAR_WIDTH = 9;
const GUTTER_LEFT = 48;
const GUTTER_RIGHT = 4;
/** Each bar grows in turn, this many ms apart. */
const STAGGER_MS = 35;
const GROW_MS = 520;

export function RainProbabilityChart({
  theme,
  hours,
  calibration,
  rainEpisodes,
  ensemblePoints,
  ensembleFetchedAt = null,
  now,
}: RainProbabilityChartProps) {
  const slice = hours.slice(0, BAR_COUNT);
  const reduced = useReducedMotion();
  const [plotWidth, setPlotWidth] = useState(0);
  const grow = useSharedValue(reduced ? 1 : 0);
  const dataKey = slice.map((item) => `${item.time}:${item.precipProbability}`).join('|');

  useEffect(() => {
    if (reduced) {
      grow.value = 1;
      return;
    }
    grow.value = 0;
    grow.value = withDelay(120, withTiming(1, { duration: GROW_MS + STAGGER_MS * BAR_COUNT, easing: Easing.out(Easing.cubic) }));
  }, [dataKey, reduced, grow]);

  // Touch and drag over the plot picks a column. The responder is created once and reads the
  // geometry through a ref, so it can sit above the early return below.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const geometry = useRef({ plotLeft: GUTTER_LEFT, columnWidth: 0, count: 0 });
  const responder = useMemo(() => {
    const indexAt = (x: number) => {
      const { plotLeft: left, columnWidth: step, count } = geometry.current;
      if (step <= 0 || count === 0) return null;
      return Math.min(count - 1, Math.max(0, Math.floor((x - left) / step)));
    };
    const pick = (event: { nativeEvent: { locationX: number } }) => setScrubIndex(indexAt(event.nativeEvent.locationX));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: pick,
      onPanResponderMove: pick,
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    });
  }, []);

  if (!slice.length) return null;

  const peak = slice.reduce(
    (best, item) => (item.precipProbability > best.precipProbability ? item : best),
    slice[0],
  );
  const peakIndex = slice.indexOf(peak);
  const ensembleRain = alignEnsembleRainProbabilities(slice, ensemblePoints);
  const hasEnsembleSnapshot = ensemblePoints !== undefined && ensemblePoints !== null;
  const hasSupportedEnsembleRain = ensembleRain.some((point) => point !== null);
  let ensemblePeakIndex: number | null = null;
  ensembleRain.forEach((point, index) => {
    if (point && (
      ensemblePeakIndex === null ||
      point.probability > (ensembleRain[ensemblePeakIndex]?.probability ?? -1)
    )) ensemblePeakIndex = index;
  });
  const ensemblePeak = ensemblePeakIndex === null ? null : ensembleRain[ensemblePeakIndex];
  const plotLeft = GUTTER_LEFT;
  const plotRight = Math.max(plotWidth - GUTTER_RIGHT, plotLeft);
  const columnWidth = plotWidth > 0 ? (plotRight - plotLeft) / slice.length : 0;
  const barHeightFor = (value: number) => Math.max(6, (value / 100) * (CHART_HEIGHT - 34));
  geometry.current = { plotLeft, columnWidth, count: slice.length };
  const scrubItem = scrubIndex !== null ? slice[scrubIndex] : undefined;
  const scrubEnsemblePoint = scrubIndex !== null ? ensembleRain[scrubIndex] : null;
  const scrubLeft = scrubIndex !== null ? plotLeft + scrubIndex * columnWidth : 0;
  const calibrationText = calibration
    ? calibration.status === 'insufficient'
      ? t('rain_calibration_insufficient')
          .replace('{cases}', String(calibration.verifiedCases))
          .replace('{requiredCases}', String(calibration.requiredCases))
          .replace('{days}', String(calibration.verifiedDays))
          .replace('{requiredDays}', String(calibration.requiredDays))
      : t('rain_calibration_brier')
          .replace('{score}', calibration.brierScore.toFixed(3))
          .replace('{cases}', String(calibration.verifiedCases))
          .replace('{days}', String(calibration.verifiedDays))
    : null;
  const reliableBins = calibration?.status === 'ready'
    ? calibration.reliabilityBins
        .filter((bin) => bin.sufficientlyPopulated && bin.meanForecast !== null && bin.observedFrequency !== null)
        .map((bin) =>
          `${bin.lowerPercent}–${bin.upperPercent}%: ${Math.round(bin.meanForecast! * 100)}→${Math.round(bin.observedFrequency! * 100)}% (n=${bin.cases})`,
        )
        .join(' · ')
    : '';
  const reliabilityText = reliableBins
    ? t('rain_calibration_reliability').replace('{bins}', reliableBins)
    : null;
  const episodeCalibrationText = calibration
    ? calibration.episode.status === 'ready'
      ? t('rain_episode_calibration_ready')
          .replace('{score}', (calibration.episode.brierScore ?? 0).toFixed(3))
          .replace('{cases}', String(calibration.episode.verifiedCases))
          .replace('{events}', String(calibration.episode.observedEpisodes))
          .replace('{probability}', `${Math.round((calibration.episode.meanForecastProbability ?? 0) * 100)}%`)
      : t('rain_episode_calibration_insufficient')
          .replace('{cases}', String(calibration.episode.verifiedCases))
          .replace('{requiredDays}', String(calibration.episode.requiredDays))
          .replace('{events}', String(calibration.episode.observedEpisodes))
    : null;
  const episodeNote = calibration ? t('rain_episode_probability_note') : null;
  const hourlyMethodNote = t('rain_probability_method_note');
  const ensembleFreshness = assessSignalFreshness(ensembleFetchedAt, now, ENSEMBLE_TTL_MS);
  const fetchedTimeLabel = typeof ensembleFetchedAt === 'number' && Number.isFinite(ensembleFetchedAt)
    ? new Date(ensembleFetchedAt).toLocaleString(getLanguage(), {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : t('unavailable');
  const freshnessNotice = ensembleFreshness.status === 'fresh'
    ? null
    : t('rain_daily_event_stale').replace('{time}', fetchedTimeLabel);
  const episodeForecastText = rainEpisodes === undefined || rainEpisodes === null
    ? null
    : rainEpisodes.length > 0
      ? t('rain_daily_event_forecast').replace('{days}', rainEpisodes
          .map((episode) => `${episode.date} ${Math.round(episode.probability * 100)}% (n=${episode.members}, ${episode.forecastHours} h)`)
          .join(' · '))
      : t('rain_daily_event_unavailable');
  const ensemblePeakText = ensemblePeak
    ? t('rain_hourly_ensemble_peak')
        .replace('{probability}', String(Math.round(ensemblePeak.probability)))
        .replace('{time}', formatHourLabel(slice[ensemblePeakIndex ?? 0].time, false))
        .replace('{members}', String(ensemblePeak.members))
    : null;
  const ensembleCaptionText = hasEnsembleSnapshot
    ? [
        freshnessNotice,
        hasSupportedEnsembleRain ? t('rain_hourly_ensemble_note') : t('rain_hourly_ensemble_unavailable'),
      ].filter(Boolean).join(' ')
    : null;
  const scrubReadoutText = scrubItem && hasEnsembleSnapshot
    ? t('rain_hourly_ensemble_scrub')
        .replace('{time}', formatHourLabel(scrubItem.time, scrubItem.isNow))
        .replace('{provider}', String(Math.round(scrubItem.precipProbability)))
        .replace('{ensemble}', scrubEnsemblePoint ? String(Math.round(scrubEnsemblePoint.probability)) : t('unavailable'))
        .replace('{members}', scrubEnsemblePoint ? String(scrubEnsemblePoint.members) : t('unavailable'))
    : null;
  const calibrationSourceNote = calibration ? t('rain_calibration_source_note') : null;
  const leadTimeText = calibration
    ? calibration.leadTimeBuckets
        .filter((bucket) => bucket.sufficientlyPopulated && bucket.brierScore !== null)
        .map((bucket) => {
          const report = t('rain_calibration_brier')
            .replace('{score}', (bucket.brierScore ?? 0).toFixed(3))
            .replace('{cases}', String(bucket.cases))
            .replace('{days}', String(bucket.verifiedDays));
          const bins = bucket.reliabilityBins
            .filter((bin) => bin.sufficientlyPopulated && bin.meanForecast !== null && bin.observedFrequency !== null)
            .map((bin) =>
              `${bin.lowerPercent}–${bin.upperPercent}%: ${Math.round(bin.meanForecast! * 100)}→${Math.round(bin.observedFrequency! * 100)}% (n=${bin.cases}, ${bin.verifiedDays}d)`,
            );
          const reliability = bins.length
            ? ` · ${t('rain_calibration_reliability').replace('{bins}', bins.join(' · '))}`
            : '';
          return `${bucket.startLeadHours}–${bucket.endLeadHours} h: ${report}${reliability}`;
        })
        .join(' · ')
    : '';
  const accessibilityLabel = [
    t('chart_rain_a11y')
      .replace('{time}', formatHourLabel(peak.time, false))
      .replace('{n}', String(Math.round(peak.precipProbability))),
    calibrationText,
    reliabilityText,
    leadTimeText,
    hourlyMethodNote,
    ensembleCaptionText,
    ensemblePeakText,
    scrubReadoutText,
    episodeForecastText,
    calibrationSourceNote,
    episodeCalibrationText,
    episodeNote,
  ].filter(Boolean).join('. ');

  return (
    <View
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {hasEnsembleSnapshot ? (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.primaryLegendSwatch} />
            <Text style={[styles.legendText, { color: theme.textTertiary }]}>
              {t('rain_hourly_primary_legend')}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.ensembleLegendSwatchOuter, {
              borderColor: theme.isLight ? '#1C2431' : '#FFFFFF',
            }]}>
              <View style={styles.ensembleLegendSwatchInner} />
            </View>
            <Text style={[styles.legendText, { color: theme.textTertiary }]}>
              {t('rain_hourly_ensemble_legend')}
            </Text>
          </View>
        </View>
      ) : null}
      <View
        style={[styles.chartArea, { height: CHART_HEIGHT }]}
        onLayout={(event: LayoutChangeEvent) => setPlotWidth(event.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        {[
          { label: t('rain_band_heavy'), ratio: 0.06 },
          { label: t('rain_band_moderate'), ratio: 0.42 },
          { label: t('rain_band_light'), ratio: 0.78 },
        ].map(({ label, ratio }) => (
          <View key={label} style={[styles.bandLine, { top: `${ratio * 100}%` }]} pointerEvents="none">
            <View style={[styles.bandDash, { backgroundColor: theme.trackColor }]} />
            <Text
              style={[styles.bandLabel, { color: theme.textTertiary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </Text>
          </View>
        ))}

        {plotWidth > 0 ? (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            {scrubItem ? (
              <Rect x={scrubLeft} y={0} width={columnWidth} height={CHART_HEIGHT} color={theme.isLight ? 'rgba(61,111,216,0.10)' : 'rgba(174,207,242,0.14)'} />
            ) : null}
            {slice.map((item, index) => (
              <RainBar
                key={item.time}
                x={plotLeft + index * columnWidth + (columnWidth - BAR_WIDTH) / 2}
                targetHeight={barHeightFor(item.precipProbability)}
                chartHeight={CHART_HEIGHT}
                index={index}
                grow={grow}
              />
            ))}
            {ensembleRain.map((point, index) => point ? (
              <React.Fragment key={`ensemble-rain:${slice[index].time}`}>
                <Circle
                  cx={plotLeft + index * columnWidth + columnWidth / 2}
                  cy={CHART_HEIGHT - barHeightFor(point.probability)}
                  r={5.5}
                  color={theme.isLight ? '#1C2431' : '#FFFFFF'}
                />
                <Circle
                  cx={plotLeft + index * columnWidth + columnWidth / 2}
                  cy={CHART_HEIGHT - barHeightFor(point.probability)}
                  r={3.25}
                  color="#F5A962"
                />
              </React.Fragment>
            ) : null)}
          </Canvas>
        ) : null}

        {scrubItem && plotWidth > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.scrubTag,
              {
                left: Math.min(Math.max(scrubLeft + columnWidth / 2 - 26, 0), Math.max(plotWidth - 52, 0)),
                backgroundColor: theme.chipBg,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.scrubText, { color: theme.textPrimary }]}>
              {Math.round(scrubItem.precipProbability)}%
            </Text>
          </View>
        ) : null}

        {plotWidth > 0 && peak.precipProbability >= 15 ? (
          <View
            pointerEvents="none"
            style={[
              styles.peakChip,
              {
                backgroundColor: '#3D6FD8',
                left: plotLeft + peakIndex * columnWidth + columnWidth / 2 - 22,
                top: CHART_HEIGHT - barHeightFor(peak.precipProbability) - 36,
              },
            ]}
          >
            <Text style={styles.peakText}>{Math.round(peak.precipProbability)}%</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.timesRow}>
        {slice.map((item, index) => (
          <Text
            key={item.time}
            style={[styles.timeLabel, { color: theme.textTertiary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {index % 2 === 0 ? formatHourLabel(item.time, item.isNow) : ''}
          </Text>
        ))}
      </View>
      {scrubReadoutText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {scrubReadoutText}
        </Text>
      ) : null}
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('chart_rain_caption')}
      </Text>
      {ensembleCaptionText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {ensembleCaptionText}
        </Text>
      ) : null}
      <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
        {hourlyMethodNote}
      </Text>
      {episodeForecastText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {episodeForecastText}
        </Text>
      ) : null}
      {calibrationSourceNote ? (
        <Text style={[styles.calibrationCaption, { color: theme.textTertiary }]}>
          {calibrationSourceNote}
        </Text>
      ) : null}
      {calibrationText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {calibrationText}
        </Text>
      ) : null}
      {reliabilityText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {reliabilityText}
        </Text>
      ) : null}
      {leadTimeText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {leadTimeText}
        </Text>
      ) : null}
      {episodeCalibrationText ? (
        <Text style={[styles.calibrationCaption, { color: theme.textSecondary }]}>
          {episodeCalibrationText}
        </Text>
      ) : null}
      {episodeNote ? (
        <Text style={[styles.calibrationCaption, { color: theme.textTertiary }]}>
          {episodeNote}
        </Text>
      ) : null}
    </View>
  );
}

/** One bar: a gradient rounded rect that grows from the baseline. */
function RainBar({
  x,
  targetHeight,
  chartHeight,
  index,
  grow,
}: {
  x: number;
  targetHeight: number;
  chartHeight: number;
  index: number;
  grow: SharedValue<number>;
}) {
  const height = useDerivedValue(() => {
    // Each bar starts a little after the one before it.
    const local = Math.min(1, Math.max(0, (grow.value * (GROW_MS + STAGGER_MS * 12) - index * STAGGER_MS) / GROW_MS));
    return targetHeight * local;
  });
  const y = useDerivedValue(() => chartHeight - height.value);
  return (
    <RoundedRect x={x} y={y} width={BAR_WIDTH} height={height} r={5}>
      <LinearGradient start={vec(0, 0)} end={vec(0, chartHeight)} colors={['#AECFF2', '#4A7DD8']} />
    </RoundedRect>
  );
}

const styles = StyleSheet.create({
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 14,
    rowGap: 5,
    marginTop: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendText: {
    fontSize: 10.5,
    fontFamily: F.medium,
  },
  primaryLegendSwatch: {
    width: 10,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4A7DD8',
  },
  ensembleLegendSwatchOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ensembleLegendSwatchInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F5A962',
  },
  chartArea: {
    marginTop: 4,
  },
  bandLine: {
    position: 'absolute',
    left: 52,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 0,
  },
  bandDash: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  bandLabel: {
    position: 'absolute',
    left: -50,
    fontSize: 11.5,
    width: 44,
    fontFamily: F.regular,
    textAlign: 'right',
  },
  scrubTag: {
    position: 'absolute',
    top: 0,
    width: 52,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 3,
    alignItems: 'center',
  },
  scrubText: {
    fontSize: 12,
    fontFamily: F.bold,
    fontVariant: ['tabular-nums'],
  },
  peakChip: {
    position: 'absolute',
    width: 44,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignItems: 'center',
  },
  peakText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: F.bold,
  },
  timesRow: {
    flexDirection: 'row',
    // mirror the chart gutters so label centers stay on bar centers
    paddingLeft: 48,
    paddingRight: 4,
    marginTop: 10,
  },
  timeLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 8,
    fontFamily: F.regular,
  },
  calibrationCaption: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 5,
    fontFamily: F.regular,
  },
});
