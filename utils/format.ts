import { t, tDay, tDayFull } from './i18n';

export type TempUnit = 'celsius' | 'fahrenheit';
export type WindUnit = 'kmh' | 'mph';
export type TimeFormat = '12h' | '24h';

interface UnitState {
  temp: TempUnit;
  wind: WindUnit;
  time: TimeFormat;
}

let unitState: UnitState = { temp: 'celsius', wind: 'kmh', time: '12h' };

export function setUnits(next: Partial<UnitState>): void {
  unitState = { ...unitState, ...next };
}

export function getUnits(): UnitState {
  return unitState;
}

export function formatTemp(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--°';
  const celsius = unitState.temp === 'celsius' ? value : value * (9 / 5) + 32;
  return `${Math.round(celsius)}°`;
}

export function convertWind(value: number): number {
  return unitState.wind === 'mph' ? value * 0.621371 : value;
}

export function windUnitLabel(): string {
  return unitState.wind === 'mph' ? 'mph' : 'km/h';
}

function parseLocalIso(iso: string): Date | null {
  if (!iso) return null;
  const normalized = iso.length === 16 ? `${iso}:00Z` : iso.endsWith('Z') ? iso : `${iso}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function localIsoToEpoch(iso: string): number {
  const parsed = parseLocalIso(iso);
  return parsed ? parsed.getTime() : NaN;
}

function formatClockParts(hours: number, minutes: number): string {
  if (unitState.time === '24h') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return minutes > 0 ? `${h12}:${String(minutes).padStart(2, '0')} ${period}` : `${h12} ${period}`;
}

export function formatHourLabel(iso: string, isNow: boolean): string {
  if (isNow) return t('now');
  const date = parseLocalIso(iso);
  if (!date) return '--';
  return formatClockParts(date.getUTCHours(), date.getUTCMinutes());
}

export function formatTime12(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const date = parseLocalIso(iso);
  if (!date) return '--:--';
  return formatClockParts(date.getUTCHours(), date.getUTCMinutes());
}

export function formatDayLabel(iso: string, index: number): string {
  if (index === 0) return t('today');
  if (index === 1) return t('tomorrow');
  const date = parseLocalIso(iso);
  if (!date) return '--';
  return tDay(date.getUTCDay());
}

export function formatDayFull(iso: string): string {
  const date = parseLocalIso(iso);
  if (!date) return '';
  return tDayFull(date.getUTCDay());
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
];

export function compassLabel(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || Number.isNaN(degrees)) return '--';
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index] ?? '--';
}

export function formatDuration(hours: number, minutes: number): string {
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function lerpColor(a: string, b: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const bl = Math.round(b1 + (b2 - b1) * clamped);
  return `rgb(${r}, ${g}, ${bl})`;
}

const COLD_COLOR = '#7CC4F0';
const HOT_COLOR = '#F5A962';

export function tempColor(temp: number): string {
  const t = (temp + 10) / 48;
  return lerpColor(COLD_COLOR, HOT_COLOR, t);
}

export function formatVisibility(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return '-- km';
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
}

export function formatPressureTrend(trend: number | null | undefined): string {
  if (trend === null || trend === undefined || Number.isNaN(trend)) return t('trend_steady');
  if (trend > 0.6) return t('trend_rising');
  if (trend < -0.6) return t('trend_falling');
  return t('trend_steady');
}

export function dewPointComfort(temp: number, dewPoint: number): string {
  const spread = temp - dewPoint;
  if (dewPoint < 10) return t('dew_dry_crisp');
  if (spread < 2) return t('dew_very_muggy');
  if (spread < 5) return t('dew_humid');
  return t('dew_comfortable');
}

export function precipIntensityLabel(prob: number, mm: number): string {
  if (prob < 15 && mm < 0.2) return t('pi_dry');
  if (mm >= 7.6 || prob >= 85) return t('pi_heavy');
  if (mm >= 2.5 || prob >= 45) return t('pi_moderate');
  return t('pi_light');
}
