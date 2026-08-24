export interface ProviderCheck {
  status: 'idle' | 'checking' | 'ok' | 'error';
  temperature: number | null;
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
