/// <reference types="jest" />
import { ALARM_SOUNDS, alarmSoundFile, normalizeAlarmSound } from '../utils/alarmSounds';

describe('normalizeAlarmSound', () => {
  it('accepts every declared key', () => {
    for (const option of ALARM_SOUNDS) {
      expect(normalizeAlarmSound(option.key)).toBe(option.key);
    }
  });

  it('falls back to default for unknown or missing values', () => {
    expect(normalizeAlarmSound('bogus')).toBe('default');
    expect(normalizeAlarmSound(undefined)).toBe('default');
    expect(normalizeAlarmSound(null)).toBe('default');
    expect(normalizeAlarmSound('')).toBe('default');
    expect(normalizeAlarmSound(42)).toBe('default');
  });
});

describe('alarmSoundFile', () => {
  it('returns the res/raw base name for bundled tones', () => {
    expect(alarmSoundFile('dawn')).toBe('alarm_dawn');
    expect(alarmSoundFile('pulse')).toBe('alarm_pulse');
    expect(alarmSoundFile('bloom')).toBe('alarm_bloom');
    expect(alarmSoundFile('beacon')).toBe('alarm_beacon');
  });

  it('returns null for the OS default and unknown keys', () => {
    expect(alarmSoundFile('default')).toBeNull();
    expect(alarmSoundFile('nonsense')).toBeNull();
  });
});
