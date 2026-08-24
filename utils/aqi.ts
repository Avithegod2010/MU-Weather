export interface Band {
  label: string;
  color: string;
  advice: string;
}

const US_AQI_BANDS: Array<{ max: number; band: Band }> = [
  { max: 50, band: { label: 'Good', color: '#5BC98C', advice: 'Air quality is ideal for outdoor activities.' } },
  { max: 100, band: { label: 'Moderate', color: '#E8D05A', advice: 'Acceptable air, sensitive groups take care.' } },
  { max: 150, band: { label: 'Unhealthy (SG)', color: '#F0964E', advice: 'Sensitive groups should limit long exertion.' } },
  { max: 200, band: { label: 'Unhealthy', color: '#E85F5F', advice: 'Everyone may feel effects; reduce outdoor time.' } },
  { max: 300, band: { label: 'Very Unhealthy', color: '#B06FD8', advice: 'Avoid prolonged outdoor exertion.' } },
  { max: Infinity, band: { label: 'Hazardous', color: '#9E4A68', advice: 'Stay indoors if possible.' } },
];

export function usAqiBand(aqi: number | null | undefined): Band | null {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return null;
  const found = US_AQI_BANDS.find((entry) => aqi <= entry.max);
  return found ? found.band : null;
}

export function usAqiFraction(aqi: number | null | undefined): number {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return 0;
  return Math.min(1, Math.max(0, aqi / 300));
}

const UV_BANDS: Array<{ min: number; band: Band }> = [
  { min: 11, band: { label: 'Extreme', color: '#B06FD8', advice: 'Avoid sun exposure midday.' } },
  { min: 8, band: { label: 'Very High', color: '#E85F5F', advice: 'Use SPF 30+, seek shade.' } },
  { min: 6, band: { label: 'High', color: '#F0964E', advice: 'Sunscreen and a hat advised.' } },
  { min: 3, band: { label: 'Moderate', color: '#E8D05A', advice: 'Some protection recommended.' } },
  { min: 0, band: { label: 'Low', color: '#5BC98C', advice: 'No protection needed.' } },
];

export function uvBand(uv: number | null | undefined): Band | null {
  if (uv === null || uv === undefined || Number.isNaN(uv)) return null;
  return UV_BANDS.find((entry) => uv >= entry.min)?.band ?? null;
}

export function humidityComfort(humidity: number): string {
  if (humidity < 30) return 'Dry air';
  if (humidity < 60) return 'Comfortable';
  if (humidity < 80) return 'Somewhat humid';
  return 'Very humid';
}

export function pollenLevel(value: number): { label: string; color: string } {
  if (value >= 75) return { label: 'Very high', color: '#B06FD8' };
  if (value >= 30) return { label: 'High', color: '#E85F5F' };
  if (value >= 10) return { label: 'Moderate', color: '#E8D05A' };
  return { label: 'Low', color: '#5BC98C' };
}
