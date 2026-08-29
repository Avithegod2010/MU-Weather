import { t } from './i18n';

export interface Band {
  label: string;
  color: string;
  advice: string;
}

interface BandedEntry {
  bound: number;
  band: Band;
}

/** Built per call so a runtime language switch is picked up. */
function usAqiBands(): BandedEntry[] {
  return [
    { bound: 50, band: { label: t('aqi_good'), color: '#5BC98C', advice: t('advice_aqi_good') } },
    { bound: 100, band: { label: t('aqi_moderate'), color: '#E8D05A', advice: t('advice_aqi_moderate') } },
    { bound: 150, band: { label: t('aqi_unhealthy_sg'), color: '#F0964E', advice: t('advice_aqi_unhealthy_sg') } },
    { bound: 200, band: { label: t('aqi_unhealthy'), color: '#E85F5F', advice: t('advice_aqi_unhealthy') } },
    { bound: 300, band: { label: t('aqi_very_unhealthy'), color: '#B06FD8', advice: t('advice_aqi_very_unhealthy') } },
    { bound: Infinity, band: { label: t('aqi_hazardous'), color: '#9E4A68', advice: t('advice_aqi_hazardous') } },
  ];
}

export function usAqiBand(aqi: number | null | undefined): Band | null {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return null;
  const found = usAqiBands().find((entry) => aqi <= entry.bound);
  return found ? found.band : null;
}

export function usAqiFraction(aqi: number | null | undefined): number {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return 0;
  return Math.min(1, Math.max(0, aqi / 300));
}

function uvBands(): BandedEntry[] {
  return [
    { bound: 11, band: { label: t('band_extreme'), color: '#B06FD8', advice: t('advice_uv_extreme') } },
    { bound: 8, band: { label: t('band_veryhigh'), color: '#E85F5F', advice: t('advice_uv_vhigh') } },
    { bound: 6, band: { label: t('band_high'), color: '#F0964E', advice: t('advice_uv_high') } },
    { bound: 3, band: { label: t('band_moderate'), color: '#E8D05A', advice: t('advice_uv_mod') } },
    { bound: 0, band: { label: t('band_low'), color: '#5BC98C', advice: t('advice_uv_low') } },
  ];
}

export function uvBand(uv: number | null | undefined): Band | null {
  if (uv === null || uv === undefined || Number.isNaN(uv)) return null;
  const found = uvBands().find((entry) => uv >= entry.bound);
  return found ? found.band : null;
}

export function humidityComfort(humidity: number): string {
  if (humidity < 30) return t('hum_dry');
  if (humidity < 60) return t('hum_comfortable');
  if (humidity < 80) return t('hum_somewhat');
  return t('hum_very');
}

export function pollenLevel(value: number): { label: string; color: string } {
  if (value >= 75) return { label: t('band_veryhigh'), color: '#B06FD8' };
  if (value >= 30) return { label: t('band_high'), color: '#E85F5F' };
  if (value >= 10) return { label: t('band_moderate'), color: '#E8D05A' };
  return { label: t('band_low'), color: '#5BC98C' };
}
