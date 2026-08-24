export interface ProviderCheck {
  status: 'idle' | 'checking' | 'ok' | 'error';
  temperature: number | null;
}

export interface HistoricalInfo {
  date: string;
  tMax: number;
  tMin: number;
  weatherCode: number;
}

export interface MarineInfo {
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  seaSurfaceTemperature: number | null;
}

export async function fetchMarine(lat: number, lon: number): Promise<MarineInfo> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'wave_height,wave_direction,wave_period,sea_surface_temperature',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Marine responded ${response.status}`);
    const json = await response.json();
    const current = json?.current;
    if (!current) throw new Error('No marine data');
    const waveHeight = current.wave_height ?? null;
    if (waveHeight === null || waveHeight === undefined) throw new Error('Inland location');
    return {
      waveHeight,
      waveDirection: current.wave_direction ?? null,
      wavePeriod: current.wave_period ?? null,
      seaSurfaceTemperature: current.sea_surface_temperature ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYearAgo(lat: number, lon: number): Promise<HistoricalInfo> {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  if (d.getMonth() === 1 && d.getDate() === 29) d.setDate(28);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: dateStr,
    end_date: dateStr,
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Archive responded ${response.status}`);
    const json = await response.json();
    const daily = json?.daily;
    if (!daily?.time?.length) throw new Error('No archive data');
    return {
      date: dateStr,
      tMax: daily.temperature_2m_max?.[0] ?? 0,
      tMin: daily.temperature_2m_min?.[0] ?? 0,
      weatherCode: daily.weather_code?.[0] ?? 3,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMetNorway(lat: number, lon: number): Promise<number> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MUWeather/1.0 (open-source weather app)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MET Norway responded ${response.status}`);
    const json = await response.json();
    const series = json?.properties?.timeseries;
    if (!Array.isArray(series) || series.length === 0) throw new Error('Empty series');

    const now = Date.now();
    let best: { temp: number; diff: number } | null = null;
    for (const entry of series) {
      const time = Date.parse(entry?.time ?? '');
      if (Number.isNaN(time)) continue;
      const temp = entry?.data?.instant?.details?.air_temperature;
      if (typeof temp !== 'number') continue;
      const diff = Math.abs(time - now);
      if (!best || diff < best.diff) {
        best = { temp, diff };
      }
    }
    if (!best) throw new Error('No usable timeseries entry');
    return best.temp;
  } finally {
    clearTimeout(timer);
  }
}
