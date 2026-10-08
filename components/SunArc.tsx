import React, { useMemo, useState } from 'react';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { BlurMask, Canvas, Circle, DashPathEffect, Group, Path, Skia, vec } from '@shopify/react-native-skia';
import {
  Sunrise,
  Sunset,
} from '../utils/uiIcons';
import type { AppTheme } from '../theme/palettes';
import { formatTime12, localIsoToEpoch } from '../utils/format';

interface SunArcProps {
  theme: AppTheme;
  sunrise: string;
  sunset: string;
  utcOffsetSeconds: number;
}

const WIDTH = 280;
const HEIGHT = 118;
const CX = WIDTH / 2;
const CY = 104;
const R = 88;

export function SunArc({ theme, sunrise, sunset, utcOffsetSeconds }: SunArcProps) {
  const localNowMs = Date.now() + utcOffsetSeconds * 1000;
  const rise = sunrise ? localIsoToEpoch(sunrise) : NaN;
  const set = sunset ? localIsoToEpoch(sunset) : NaN;

  let progress: number;
  if (Number.isNaN(rise) || Number.isNaN(set) || set <= rise) {
    progress = 0;
  } else {
    progress = (localNowMs - rise) / (set - rise);
  }
  progress = Math.min(1, Math.max(0, progress));
  const isDaytime = progress > 0 && progress < 1;

  const [canvasWidth, setCanvasWidth] = useState(0);
  const arcPath = useMemo(() => {
    const path = Skia.Path.MakeFromSVGString(`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`);
    return path ?? Skia.Path.Make();
  }, []);

  const angle = Math.PI * (1 - progress);
  const sunX = CX - R * Math.cos(Math.PI - angle);
  const sunY = CY - R * Math.sin(angle);

  const daylightMs = Number.isNaN(rise) || Number.isNaN(set) ? 0 : set - rise;
  const daylightHours = Math.floor(daylightMs / 3600000);
  const daylightMinutes = Math.round((daylightMs % 3600000) / 60000);
  const daylightLabel =
    daylightHours > 0
      ? `${daylightHours}h ${String(daylightMinutes).padStart(2, '0')}m of daylight`
      : 'Sun is below the horizon';

  return (
    <View>
      <Canvas
        style={{ width: '100%', height: HEIGHT }}
        onLayout={(event: LayoutChangeEvent) => setCanvasWidth(event.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Drawn in the 280-wide design space, then scaled to the real width. */}
        <Group transform={[{ scale: canvasWidth > 0 ? canvasWidth / WIDTH : 1 }]} origin={vec(0, 0)}>
          <Path path={arcPath} style="stroke" strokeWidth={3} strokeCap="round" color={theme.trackColor}>
            <DashPathEffect intervals={[1, 9]} />
          </Path>
          <Path
            path={arcPath}
            style="stroke"
            strokeWidth={3.5}
            strokeCap="round"
            color={theme.accent}
            start={0}
            end={progress}
          />
          {isDaytime ? (
            <Circle cx={sunX} cy={sunY} r={16} color={theme.accent}>
              <BlurMask blur={9} style="normal" />
            </Circle>
          ) : null}
          <Circle cx={sunX} cy={sunY} r={isDaytime ? 7 : 4} color={theme.accent} opacity={isDaytime ? 1 : 0.45} />
        </Group>
      </Canvas>

      <View style={styles.timesRow}>
        <View style={styles.timeBlock}>
          <View style={styles.timeLabelRow}>
            <Sunrise size={14} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.timeLabelText, { color: theme.textTertiary }]}>
              {t('sunrise').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.timeValue, { color: theme.textPrimary }]}>
            {formatTime12(sunrise)}
          </Text>
        </View>
        <View style={[styles.timeBlock, styles.rightBlock]}>
          <View style={styles.timeLabelRow}>
            <Sunset size={14} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.timeLabelText, { color: theme.textTertiary }]}>
              {t('sunset').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.timeValue, { color: theme.textPrimary }]}>
            {formatTime12(sunset)}
          </Text>
        </View>
      </View>

      <Text style={[styles.daylight, { color: theme.textTertiary }]}>{daylightLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
    paddingHorizontal: 6,
  },
  timeBlock: {
    gap: 3,
  },
  rightBlock: {
    alignItems: 'flex-end',
  },
  timeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timeLabelText: {
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 1.2,
  },
  timeValue: {
    fontSize: 17,
    fontFamily: F.semibold,
  },
  daylight: {
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
