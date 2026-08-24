import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ChevronRight } from '../utils/uiIcons';
import { getWeatherIcon } from '../utils/icons';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { formatTemp } from '../utils/format';
import type { AppTheme } from '../theme/palettes';
import type { CalendarWeatherState } from '../hooks/useCalendarWeather';

interface CalendarCardProps {
  theme: AppTheme;
  state: CalendarWeatherState;
  onEnable: () => void;
}

export function CalendarCard({ theme, state, onEnable }: CalendarCardProps) {
  return (
    <Card theme={theme} title="Your week" icon={CalendarDays}>
      {state.status === 'denied' || state.status === 'idle' ? (
        <View style={styles.stack}>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            See the forecast for your upcoming events. Calendar access stays on your device.
          </Text>
          <Pressable
            onPress={() => {
              haptics.select();
              onEnable();
            }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.chipBg },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.textPrimary }]}>Allow calendar</Text>
            <ChevronRight size={15} color={theme.textPrimary} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : state.status === 'checking' ? (
        <Text style={[styles.message, { color: theme.textTertiary }]}>Reading calendar...</Text>
      ) : state.status === 'empty' ? (
        <Text style={[styles.message, { color: theme.textTertiary }]}>
          No events in the next 7 days.
        </Text>
      ) : (
        <View style={styles.stack}>
          {state.events.map((event) => {
            const code = event.icon ? Number(event.icon) : null;
            const Icon = code !== null ? getWeatherIcon(code, true) : null;
            return (
              <View key={event.id} style={styles.row}>
                <View style={[styles.iconChip, { backgroundColor: theme.chipBg }]}>
                  {Icon ? <Icon size={16} color={theme.textPrimary} strokeWidth={2} /> : null}
                </View>
                <View style={styles.rowTexts}>
                  <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
                    {event.dayLabel}
                    {event.allDay ? ' · all day' : ` · ${formatTimeShort(event.start)}`}
                  </Text>
                </View>
                {event.tMax !== null ? (
                  <Text style={[styles.temps, { color: theme.textSecondary }]}>
                    {formatTemp(event.tMax)} / {formatTemp(event.tMin ?? event.tMax)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

function formatTimeShort(date: Date): string {
  let hours = date.getHours();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours} ${period}`;
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  buttonText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
  },
  temps: {
    fontSize: 13,
    fontWeight: '600',
  },
});
