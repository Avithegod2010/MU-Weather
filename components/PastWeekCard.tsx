import { SlidingGroup, SlidingItem } from './Sliding';
import { t, tDay, getLanguage, type StringKey } from '../utils/i18n';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SkiaSeriesChart } from './SkiaSeriesChart';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplet, Clock3 as History } from '../utils/uiIcons';
import { Card } from './Card';
import { scaleY, type CurvePoint } from '../utils/curve';
import { formatPrecip, formatPrecipValue, tempColor, getUnits, convertWind, windUnitLabel } from '../utils/format';
import { loadForecastLog, type ForecastLogEntry } from '../utils/forecastLog';
import { loadModelLog, type ModelLogEntry } from '../utils/modelAccuracyLog';
import {
  computeAccuracy,
  computeModelMetricAccuracy,
  MODEL_METRICS,
  type ModelMetric,
} from '../utils/accuracy';
import { MODEL_LABELS } from '../api/providers';
import { haptics } from '../utils/haptics';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation, PastDayActual } from '../api/types';

interface PastWeekCardProps {
  theme: AppTheme;
  /** Archive actuals, oldest first. May hold up to 30 days. */
  days: PastDayActual[];
  /** Active location - the model leaderboard only scores entries for this place. */
  location: GeoLocation | null;
  /** History window shown - the archive feed covers both options */
  pastDaysRange?: 7 | 30 | 'accuracy';
  onRangeChange?: (range: 7 | 30 | 'accuracy') => void;
}

const PRECIP_COLOR = '#A5DBF9';
const BAR_HEIGHT = 62;
const GOOD_DELTA = '#5BC98C';
const OK_DELTA = '#E8D05A';
const BAD_DELTA = '#E85F5F';
const MAX_LINE_COLOR = '#F5A962';
const MIN_LINE_COLOR = '#6FA8DC';
const SPARK_HEIGHT = 88;
const SPARK_PADDING = 8;

/** Archive dates are plain `YYYY-MM-DD`; noon-UTC parsing keeps the weekday stable. */
function weekdayOf(date: string): number {
  const time = Date.parse(`${date}T12:00:00Z`);
  return Number.isNaN(time) ? -1 : new Date(time).getUTCDay();
}

/** Short localized date, e.g. "Sep 3" — follows the IN-APP language, not the device. */
function shortDate(date: string): string {
  const time = Date.parse(`${date}T12:00:00`);
  return Number.isNaN(time)
    ? ''
    : new Date(time).toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' });
}

/** Signed delta chip text, e.g. `+2°`, `-1°`, `±0°`. */
function deltaChipText(actual: number, forecast: number): string {
  const diff = Math.round(actual - forecast);
  if (diff === 0) return '±0°';
  return `${diff > 0 ? '+' : '-'}${Math.abs(diff)}°`;
}

function deltaColor(diff: number): string {
  const abs = Math.abs(diff);
  if (abs <= 1) return GOOD_DELTA;
  if (abs <= 3) return OK_DELTA;
  return BAD_DELTA;
}

export function PastWeekCard({
  theme,
  days,
  location,
  pastDaysRange = 7,
  onRangeChange,
}: PastWeekCardProps) {
  const [log, setLog] = useState<ForecastLogEntry[]>([]);
  const [modelLog, setModelLog] = useState<ModelLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [entries, modelEntries] = await Promise.all([loadForecastLog(), loadModelLog()]);
      if (cancelled) return;
      setLog(entries);
      setModelLog(modelEntries);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (days.length === 0) return null;

  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const shown = pastDaysRange === 30 ? ordered : ordered.slice(-7);
  const isAccuracy = pastDaysRange === 'accuracy';
  const isMonth = pastDaysRange === 30;

  return (
    <Card
      theme={theme}
      title={t(isAccuracy ? 'card_accuracy' : isMonth ? 'card_past_week_30' : 'card_past_week')}
      icon={History}
      headerRight={
        <SlidingGroup
          theme={theme}
          activeIndex={[7, 30, 'accuracy'].indexOf(pastDaysRange)}
          color={theme.isLight ? '#FFFFFF' : '#F4F6FA'}
          style={[styles.rangeRow, { backgroundColor: theme.chipBg }]}
        >
          {([7, 30, 'accuracy'] as const).map((option, index) => {
            const active = pastDaysRange === option;
            return (
              <SlidingItem
                key={option}
                index={index}
                onPress={() => {
                  if (!active) {
                    haptics.select();
                    onRangeChange?.(option);
                  }
                }}
                style={styles.rangeOption}
                accessibilityRole="button"
                accessibilityLabel={
                  option === 'accuracy' ? t('accuracy_tab') : t('trip_days').replace('{n}', String(option))
                }
                accessibilityState={{ selected: active }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[
                    styles.rangeText,
                    { color: active ? theme.textPrimary : theme.textTertiary },
                  ]}
                >
                  {option === 'accuracy' ? t('accuracy_tab') : option}
                </Text>
              </SlidingItem>
            );
          })}
        </SlidingGroup>
      }
    >
      {isAccuracy ? (
        <AccuracyBody
          theme={theme}
          days={ordered}
          log={log}
          modelLog={modelLog}
          location={location}
        />
      ) : isMonth ? (
        <ThirtyDayBody theme={theme} days={shown} />
      ) : (
        <SevenDayBody theme={theme} days={shown} log={log} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 7-day view: weekday columns with range bars and delta chips         */
/* ------------------------------------------------------------------ */

function SevenDayBody({
  theme,
  days,
  log,
}: {
  theme: AppTheme;
  days: PastDayActual[];
  log: ForecastLogEntry[];
}) {
  const byDate = new Map(log.map((entry) => [entry.date, entry]));
  const weekMin = Math.min(...days.map((d) => d.tMin));
  const weekMax = Math.max(...days.map((d) => d.tMax));
  const range = Math.max(weekMax - weekMin, 1);
  const totalRain = days.reduce((sum, d) => sum + d.precipSum, 0);
  const deltas = days
    .filter((d) => byDate.has(d.date))
    .map((d) => Math.round(d.tMax - (byDate.get(d.date) as ForecastLogEntry).tMax));
  const anyDelta = deltas.length > 0;
  const hasUnloggedDays = days.some((d) => !byDate.has(d.date));

  return (
    <>
      <View style={styles.columns}>
        {days.map((day) => {
          const forecast = byDate.get(day.date);
          const bottomPct = ((day.tMin - weekMin) / range) * 100;
          const heightPct = Math.max(((day.tMax - day.tMin) / range) * 100, 12);
          const weekday = weekdayOf(day.date);
          return (
            <View key={day.date} style={styles.column}>
              <Text style={[styles.dayLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                {weekday >= 0 ? tDay(weekday) : '--'}
              </Text>
              <View style={styles.chipSlot}>
                {forecast ? (
                  <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                    <Text
                      style={[
                        styles.chipText,
                        { color: deltaColor(day.tMax - forecast.tMax) },
                      ]}
                    >
                      {deltaChipText(day.tMax, forecast.tMax)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.trackColor }]}>
                <LinearGradient
                  colors={[tempColor(day.tMax), tempColor(day.tMin)] as [string, string]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[styles.barFill, { bottom: `${bottomPct}%`, height: `${heightPct}%` }]}
                />
              </View>
              {day.precipSum >= 0.05 ? (
                <View style={styles.rainRow}>
                  <Droplet size={9} color={PRECIP_COLOR} strokeWidth={2.6} />
                  <Text style={[styles.rainText, { color: theme.textSecondary }]}>
                    {formatPrecipValue(day.precipSum)}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.rainText, styles.rainDry, { color: theme.textTertiary }]}>
                  –
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('week_rain_total')}: {formatPrecip(totalRain)}
        {anyDelta ? ` · ${t('delta_vs_forecast')}` : ''}
      </Text>
      {hasUnloggedDays ? (
        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          {t('past_week_note')}
        </Text>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Accuracy view: personal mean errors over the whole logged window    */
/* ------------------------------------------------------------------ */

/** °C delta → display-unit number string with 1 decimal (°F scale ×9/5). */
function deltaDisplay(c: number): string {
  const value = getUnits().temp === 'fahrenheit' ? c * (9 / 5) : c;
  return value.toFixed(1);
}

function AccuracyBody({
  theme,
  days,
  log,
  modelLog,
  location,
}: {
  theme: AppTheme;
  days: PastDayActual[];
  log: ForecastLogEntry[];
  modelLog: ModelLogEntry[];
  location: GeoLocation | null;
}) {
  const stats = computeAccuracy(log, days);

  if (!stats) {
    return (
      <Text style={[styles.footnote, { color: theme.textTertiary }]}>
        {t('accuracy_empty')}
      </Text>
    );
  }

  const worst = stats.worstMiss;
  // Display-unit scale for the worst-miss chip (deltaColor thresholds stay °C-calibrated).
  const deltaScale = getUnits().temp === 'fahrenheit' ? 9 / 5 : 1;

  return (
    <>
      <Text style={[styles.accHeadline, { color: theme.textSecondary }]}>
        {t('accuracy_headline').split('{n}').join(deltaDisplay(stats.maeHigh))}
      </Text>
      <View style={styles.accRows}>
        <View style={styles.accRow}>
          <Text style={[styles.accLabel, { color: theme.textSecondary }]}>
            {t('accuracy_high')}
          </Text>
          <Text style={[styles.accValue, { color: theme.textPrimary }]}>
            ±{deltaDisplay(stats.maeHigh)}°
          </Text>
        </View>
        <View style={styles.accRow}>
          <Text style={[styles.accLabel, { color: theme.textSecondary }]}>
            {t('accuracy_low')}
          </Text>
          <Text style={[styles.accValue, { color: theme.textPrimary }]}>
            ±{deltaDisplay(stats.maeLow)}°
          </Text>
        </View>
        <View style={styles.accRow}>
          <Text style={[styles.accLabel, { color: theme.textSecondary }]}>
            {t('accuracy_rain')}
          </Text>
          <Text style={[styles.accValue, { color: theme.textPrimary }]}>
            {stats.rainTotal > 0 ? `${stats.rainCorrect}/${stats.rainTotal}` : '–'}
          </Text>
        </View>
        <View style={styles.accRow}>
          <Text style={[styles.accLabel, { color: theme.textSecondary }]}>
            {t('accuracy_days')}
          </Text>
          <Text style={[styles.accValue, { color: theme.textPrimary }]}>
            {stats.compared}
          </Text>
        </View>
        <View style={styles.accRow}>
          <Text style={[styles.accLabel, { color: theme.textSecondary }]}>
            {t('accuracy_worst')}
          </Text>
          {worst ? (
            <View style={styles.accWorst}>
              <Text style={[styles.accDate, { color: theme.textTertiary }]}>
                {shortDate(worst.date)}
              </Text>
              <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                <Text style={[styles.chipText, { color: deltaColor(worst.delta) }]}>
                  {deltaChipText(worst.delta * deltaScale, 0)}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.accValue, { color: theme.textPrimary }]}>–</Text>
          )}
        </View>
      </View>

      <ModelLeaderboard theme={theme} days={days} modelLog={modelLog} location={location} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Model leaderboard: which global model has been closest lately       */
/* ------------------------------------------------------------------ */

/** Bar colour for a hit rate: 70 %+ green, 50 %+ amber, below that red. */
function hitColor(rate: number): string {
  if (rate >= 0.7) return GOOD_DELTA;
  if (rate >= 0.5) return OK_DELTA;
  return BAD_DELTA;
}

/** Switcher labels for the per-metric model leaderboard. */
const METRIC_LABEL_KEYS: Record<ModelMetric, StringKey> = {
  temp: 'acc_metric_temp',
  wind: 'acc_metric_wind',
  rain: 'acc_metric_rain',
};

function ModelLeaderboard({
  theme,
  days,
  modelLog,
  location,
}: {
  theme: AppTheme;
  days: PastDayActual[];
  modelLog: ModelLogEntry[];
  location: GeoLocation | null;
}) {
  const [metric, setMetric] = useState<ModelMetric>('temp');
  const { rows, comparedDays } = computeModelMetricAccuracy(modelLog, days, location, metric);

  // The switcher stays visible even with nothing scored yet, so the user can
  // tell the other two metrics apart from a missing-data bug.
  const metricPicker = (
    <SlidingGroup
      theme={theme}
      activeIndex={(MODEL_METRICS as readonly string[]).indexOf(metric)}
      color={theme.isLight ? '#FFFFFF' : '#F4F6FA'}
      style={[styles.rangeRow, { backgroundColor: theme.chipBg }]}
    >
      {MODEL_METRICS.map((option, index) => {
        const label = t(METRIC_LABEL_KEYS[option]);
        const active = metric === option;
        return (
          <SlidingItem
            key={option}
            index={index}
            onPress={() => {
              if (!active) {
                haptics.select();
                setMetric(option);
              }
            }}
            style={styles.rangeOption}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[styles.rangeText, { color: active ? theme.textPrimary : theme.textTertiary }]}
            >
              {label}
            </Text>
          </SlidingItem>
        );
      })}
    </SlidingGroup>
  );

  return (
    <View style={styles.modelBlock}>
      <Text style={[styles.accHeadline, { color: theme.textSecondary }]}>
        {t('acc_models_title')}
      </Text>
      {metricPicker}
      {rows.length === 0 ? (
        <>
          <Text style={[styles.footnote, { color: theme.textTertiary }]}>
            {t('acc_models_empty')}
          </Text>
          {metric !== 'temp' ? (
            <Text style={[styles.footnote, { color: theme.textTertiary }]}>
              {t('acc_models_empty_hint')}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.accRows}>
            {rows.map((row) => {
              const hitPct = Math.round(row.hitRate * 100);
              // Wind is stored in km/h and rain in mm, so each metric formats its
              // own mean error through the unit helpers.
              const error =
                metric === 'temp'
                  ? `${t('accuracy_high')}: ±${deltaDisplay(row.mae)}°`
                  : metric === 'wind'
                    ? `${t('acc_metric_wind')}: ±${deltaDisplay(convertWind(row.mae))} ${windUnitLabel()}`
                    : `${t('acc_metric_rain')}: ±${formatPrecip(row.mae)}`;
              return (
                <View key={row.model} style={styles.modelRow}>
                  <View style={styles.modelTexts}>
                    <Text style={[styles.modelName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {MODEL_LABELS[row.model]}
                    </Text>
                    <Text style={[styles.modelSub, { color: theme.textTertiary }]} numberOfLines={1}>
                      {error} · {t('trip_days').replace('{n}', String(row.compared))}
                    </Text>
                  </View>
                  <View style={[styles.modelTrack, { backgroundColor: theme.chipBg }]}>
                    <View
                      style={[
                        styles.modelFill,
                        { width: `${hitPct}%`, backgroundColor: hitColor(row.hitRate) },
                      ]}
                    />
                  </View>
                  <Text style={[styles.modelHit, { color: theme.textPrimary }]}>{hitPct}%</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.footnote, { color: theme.textTertiary }]}>
            {t('acc_models_caption').split('{n}').join(String(comparedDays))}
          </Text>
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 30-day view: temp-trend sparkline plus rain and variability stats   */
/* ------------------------------------------------------------------ */

function ThirtyDayBody({ theme, days }: { theme: AppTheme; days: PastDayActual[] }) {
  const totalRain = days.reduce((sum, d) => sum + d.precipSum, 0);
  const wetDays = days.filter((d) => d.precipSum >= 1.0).length;

  // Biggest day-to-day swing of the max temperature across the window.
  let swing = 0;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round(days[i].tMax - days[i - 1].tMax);
    if (Math.abs(diff) > Math.abs(swing)) swing = diff;
  }
  const swingText =
    swing === 0 ? '±0°' : `${swing > 0 ? '+' : '-'}${Math.abs(swing)}°`;

  return (
    <>
      <TempTrendSparkline theme={theme} days={days} />
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('rain_total_30')}: {formatPrecip(totalRain)}
        {days.length > 0 ? ` · ${t('stat_wet_days')}: ${wetDays}` : ''}
      </Text>
      {days.length >= 2 ? (
        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          {t('stat_biggest_swing')}: {swingText}
        </Text>
      ) : null}
    </>
  );
}

/** Soft area between the tMax polyline and the reversed tMin polyline. */
function bandPath(top: CurvePoint[], bottom: CurvePoint[]): string {
  const points = [...top, ...[...bottom].reverse()];
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return `${d} Z`;
}

function TempTrendSparkline({ theme, days }: { theme: AppTheme; days: PastDayActual[] }) {
  const [width, setWidth] = useState(0);

  if (days.length < 2) return null;

  const onLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const next = event.nativeEvent.layout.width;
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  const tempsMax = days.map((d) => d.tMax);
  const tempsMin = days.map((d) => d.tMin);
  const lo = Math.min(...tempsMin);
  const hi = Math.max(...tempsMax);
  const top = SPARK_PADDING;
  const bottom = SPARK_HEIGHT - SPARK_PADDING;

  const toPoints = (values: number[]): CurvePoint[] =>
    values.map((value, index) => ({
      x: width > 0 ? (index / (values.length - 1)) * (width - 2 * SPARK_PADDING) + SPARK_PADDING : 0,
      y: scaleY(value, lo, hi, top, bottom),
    }));

  const maxPoints = toPoints(tempsMax);
  const minPoints = toPoints(tempsMin);
  const hotIndex = tempsMax.indexOf(Math.max(...tempsMax));
  const coldIndex = tempsMin.indexOf(Math.min(...tempsMin));
  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  if (width <= 0) {
    return <View style={styles.sparkSlot} onLayout={onLayout} />;
  }

  return (
    <View style={styles.sparkSlot} onLayout={onLayout}>
      <SkiaSeriesChart
        theme={theme}
        width={width}
        height={SPARK_HEIGHT}
        series={[
          { color: MAX_LINE_COLOR, points: maxPoints, markers: [hotIndex] },
          { color: MIN_LINE_COLOR, points: minPoints, markers: [coldIndex] },
        ]}
        bandPath={bandPath(maxPoints, minPoints)}
        bandColor="rgba(245,169,98,0.1)"
        columns={[]}
        dotFill={dotFill}
        dataKey={`past|${tempsMax.join(',')}|${tempsMin.join(',')}|${width}`}
        scrub={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 10.5,
    fontFamily: F.medium,
  },
  chipSlot: {
    height: 18,
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 9.5,
    fontFamily: F.bold,
  },
  barTrack: {
    width: 14,
    height: BAR_HEIGHT,
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 5,
  },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rainText: {
    fontSize: 10,
    fontFamily: F.medium,
  },
  rainDry: {
    opacity: 0.6,
  },
  rangeRow: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 2,
    gap: 2,
    flexShrink: 1,
  },
  rangeOption: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  rangeText: {
    fontSize: 11,
    fontFamily: F.semibold,
  },
  sparkSlot: {
    height: SPARK_HEIGHT,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 10,
    fontFamily: F.regular,
  },
  footnote: {
    fontSize: 11,
    marginTop: 3,
    fontFamily: F.regular,
  },
  accHeadline: {
    fontSize: 13.5,
    fontFamily: F.semibold,
    marginBottom: 10,
  },
  accRows: {
    gap: 7,
  },
  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accLabel: {
    fontSize: 11.5,
    fontFamily: F.regular,
  },
  accValue: {
    fontSize: 11.5,
    fontFamily: F.semibold,
  },
  accWorst: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accDate: {
    fontSize: 11,
    fontFamily: F.regular,
  },
  modelBlock: {
    marginTop: 14,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  modelTexts: {
    flex: 1,
    gap: 1,
  },
  modelName: {
    fontSize: 12,
    fontFamily: F.semibold,
  },
  modelSub: {
    fontSize: 10.5,
    fontFamily: F.regular,
  },
  modelTrack: {
    width: 54,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  modelFill: {
    height: 6,
    borderRadius: 3,
  },
  modelHit: {
    width: 34,
    textAlign: 'right',
    fontSize: 12,
    fontFamily: F.bold,
  },
});
