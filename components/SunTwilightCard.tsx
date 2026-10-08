import { t } from '../utils/i18n';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { SvgPath, SvgDot } from './SkiaShapes';
import { Sunrise } from '../utils/uiIcons';
import { Card } from './Card';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import { compassLabel, formatClockParts } from '../utils/format';
import { computeTwilight, type TwilightData } from '../utils/twilight';

interface SunTwilightCardProps {
  theme: AppTheme;
  latitude: number;
  longitude: number;
  style?: StyleProp<ViewStyle>;
  revealDelay?: number;
}

function clock(date: Date | null): string {
  return date ? formatClockParts(date.getHours(), date.getMinutes()) : '--';
}

const ARC_HEIGHT = 66;
/** Same gold the aurora card uses for its Kp line, so the two read as one family. */
const SUN_GOLD = '#EFC25C';

/**
 * Compact sun arc: the horizon, the day's sunrise→sunset arc, the part the sun
 * has already travelled and a dot at its live position. Purely decorative —
 * every number it implies is repeated in the rows below — so it is hidden from
 * screen readers, like MoonPhaseVisual / RainGauge in MiniGauges.
 */
function SunArcVisual({ theme, tw }: { theme: AppTheme; tw: TwilightData }) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const next = event.nativeEvent.layout.width;
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  if (width <= 0) return <View style={styles.arcSlot} onLayout={onLayout} />;

  const cx = width / 2;
  const cy = ARC_HEIGHT - 6;
  // Keep the apex inside the box: r must stay below the horizon line.
  const r = Math.max(20, Math.min(cx - 4, cy - 8));
  const left = cx - r;
  const right = cx + r;

  // Only between sunrise and sunset is the arc a real position; during polar
  // day/night there is no rise/set, so the dot stays off rather than guessing.
  const now = Date.now();
  const rise = tw.sunrise ? tw.sunrise.getTime() : null;
  const set = tw.sunset ? tw.sunset.getTime() : null;
  const progress =
    rise !== null && set !== null && set > rise && now >= rise && now <= set
      ? (now - rise) / (set - rise)
      : null;
  const angle = progress === null ? null : Math.PI * (1 - progress);
  const dotX = angle === null ? 0 : cx + r * Math.cos(angle);
  const dotY = angle === null ? 0 : cy - r * Math.sin(angle);
  const travelled =
    progress === null || progress < 0.01
      ? null
      : `M ${left.toFixed(1)} ${cy} A ${r} ${r} 0 0 1 ${dotX.toFixed(1)} ${dotY.toFixed(1)}`;

  return (
    <View style={styles.arcSlot} onLayout={onLayout}>
      <Canvas style={{ width: width, height: ARC_HEIGHT }} accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
        <SvgPath d={`M ${left.toFixed(1)} ${cy} A ${r} ${r} 0 0 1 ${right.toFixed(1)} ${cy}`} color={theme.trackColor} strokeWidth={1.5} />
        {travelled ? (
          <SvgPath d={travelled} color={SUN_GOLD} strokeWidth={2.2} />
        ) : null}
        <SvgPath d={`M ${left.toFixed(1)} ${cy} L ${right.toFixed(1)} ${cy}`} color={theme.trackColor} strokeWidth={1} />
        {progress !== null ? <SvgDot cx={dotX} cy={dotY} r={4.5} fill={SUN_GOLD} /> : null}
      </Canvas>
    </View>
  );
}

/**
 * Half-width detail card: live sun position plus the day's twilight phases.
 * Everything is computed locally from the coordinates (utils/twilight.ts) -
 * no API data needed. Not pressable: there is no deep-dive behind it.
 */
export function SunTwilightCard({
  theme,
  latitude,
  longitude,
  style,
  revealDelay,
}: SunTwilightCardProps) {
  const tw = useMemo(
    () => computeTwilight(new Date(), latitude, longitude),
    [latitude, longitude],
  );

  // The day's phases in the order they actually happen: night ends → daylight
  // peaks → night returns.
  const rows: Array<{ label: string; value: string }> = [
    { label: t('tw_first_light'), value: clock(tw.astroDawn) },
    { label: t('tw_civil_dawn'), value: clock(tw.civilDawn) },
    { label: t('sunrise'), value: clock(tw.sunrise) },
    { label: t('tw_solar_noon'), value: clock(tw.solarNoon) },
    { label: t('sunset'), value: clock(tw.sunset) },
    { label: t('tw_civil_dusk'), value: clock(tw.civilDusk) },
    { label: t('tw_darkness'), value: clock(tw.astroDusk) },
  ];

  const elevation = Math.round(tw.currentElevation);

  let footer: string | null = null;
  if (tw.polarState === 'polar_day') footer = t('tw_polar_day');
  else if (tw.polarState === 'polar_night') footer = t('tw_polar_night');
  else if (tw.isBlueNow) footer = t('tw_blue_now');
  else if (tw.nextBlueInMinutes !== null) {
    footer = t('tw_blue_in').replace('{n}', String(tw.nextBlueInMinutes));
  }

  return (
    <Card
      theme={theme}
      title={t('card_sun_twilight')}
      icon={Sunrise}
      style={style}
      revealDelay={revealDelay}
    >
      <View style={styles.position}>
        <Text style={[styles.elevation, { color: theme.textPrimary }]} numberOfLines={1}>
          {elevation >= 0 ? `+${elevation}°` : `${elevation}°`}
        </Text>
        <View style={styles.positionMeta}>
          <Text style={[styles.positionLabel, { color: theme.textTertiary }]}>
            {t('tw_elevation')}
          </Text>
          <Text style={[styles.azimuth, { color: theme.textSecondary }]}>
            {t('tw_azimuth')} {Math.round(tw.currentAzimuth)}° {compassLabel(tw.currentAzimuth)}
          </Text>
        </View>
      </View>

      <SunArcVisual theme={theme} tw={tw} />

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.textTertiary }]} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{row.value}</Text>
          </View>
        ))}
      </View>

      {footer ? (
        <Text style={[styles.footer, { color: theme.accent }]} numberOfLines={1}>
          {footer}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  position: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  elevation: {
    fontSize: 34,
    fontFamily: F.semibold,
    includeFontPadding: false,
  },
  positionMeta: {
    flexShrink: 1,
    gap: 2,
  },
  positionLabel: {
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 1.2,
  },
  azimuth: {
    fontSize: 12,
    fontFamily: F.medium,
  },
  rows: {
    marginTop: 10,
    gap: 6,
  },
  arcSlot: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowLabel: {
    fontSize: 12,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  footer: {
    marginTop: 9,
    fontSize: 12,
    fontFamily: F.medium,
  },
});
