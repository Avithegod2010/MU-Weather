/**
 * The bundled sunrise-alarm tones. Android notification-channel sounds must
 * live in res/raw — plugins/withAlarmSounds.js copies these at prebuild, and
 * the channel is (re)created with the chosen file whenever the alarm
 * (re)schedules (hooks/useSunriseAlarm.ts). 'default' = the OS sound, no
 * custom channel.
 */

export type AlarmSoundKey = 'default' | 'dawn' | 'pulse' | 'bloom' | 'beacon';

export interface AlarmSoundOption {
  key: AlarmSoundKey;
  /** res/raw file name (no extension), null = the OS default sound. */
  file: string | null;
}

export const ALARM_SOUNDS: AlarmSoundOption[] = [
  { key: 'default', file: null },
  { key: 'dawn', file: 'alarm_dawn' },
  { key: 'pulse', file: 'alarm_pulse' },
  { key: 'bloom', file: 'alarm_bloom' },
  { key: 'beacon', file: 'alarm_beacon' },
];

/** The persisted setting, defensively normalised to a known key. */
export function normalizeAlarmSound(value: unknown): AlarmSoundKey {
  const found = ALARM_SOUNDS.find((option) => option.key === value);
  return found ? found.key : 'default';
}

/** res/raw base name for a key (no extension), null = OS default. */
export function alarmSoundFile(key: unknown): string | null {
  return ALARM_SOUNDS.find((option) => option.key === normalizeAlarmSound(key))?.file ?? null;
}
