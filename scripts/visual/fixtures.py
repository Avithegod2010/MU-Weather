"""Open-Meteo style fixtures for the visual harness.

The app parses these exact shapes (api/types.ts: ForecastResponse, AirQualityResponse), so the
real parser runs against them. Times are built from the current UTC hour, so the day/night
logic and "now" marker always make sense on the day the harness runs.
"""
from datetime import datetime, timedelta, timezone
import math

# WMO codes per condition (utils/wmo.ts). Only the codes the harness uses are listed.
CONDITION_CODE = {
    'clear': 0,
    'partlyCloudy': 2,
    'cloudy': 3,
    'fog': 45,
    'drizzle': 51,
    'rain': 63,
    'showers': 81,
    'freezing': 66,
    'snow': 73,
    'thunder': 95,
}


def forecast(condition: str, is_day: bool) -> dict:
    code = CONDITION_CODE[condition]
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    hours = [now + timedelta(hours=i) for i in range(16 * 24)]
    times = [h.strftime('%Y-%m-%dT%H:00') for h in hours]
    hour_of_day = [h.hour for h in hours]
    is_day_hour = [1 if 6 <= hh < 18 else 0 for hh in hour_of_day]
    temp = [round(14 + 6 * math.sin((hh - 9) / 24 * 2 * math.pi), 1) for hh in hour_of_day]
    precip_prob = [min(100, round(max(0, 60 * math.sin((i + 3) / 7)) + 10)) for i in range(len(hours))]
    precip = [round(max(0, (p - 40) / 25), 2) for p in precip_prob]
    uv = [round(max(0, 6 * math.sin((hh - 6) / 12 * math.pi)), 1) if 6 <= hh < 18 else 0 for hh in hour_of_day]
    cape = [round(max(0, 1800 * math.sin((i + 2) / 9)), 0) for i in range(len(hours))]
    days = [now.date() + timedelta(days=d) for d in range(16)]
    daily = {
        'time': [d.isoformat() for d in days],
        'weather_code': [code] * 16,
        'temperature_2m_max': [round(19 + 3 * math.sin(d / 3), 1) for d in range(16)],
        'temperature_2m_min': [round(9 + 2 * math.sin(d / 3), 1) for d in range(16)],
        'sunrise': [f'{d.isoformat()}T06:42' for d in days],
        'sunset': [f'{d.isoformat()}T18:15' for d in days],
        'uv_index_max': [5.5] * 16,
        'precipitation_probability_max': [40] * 16,
        'precipitation_sum': [2.4] * 16,
        'wind_speed_10m_max': [18.0] * 16,
    }
    return {
        'latitude': 51.5074,
        'longitude': -0.1278,
        'timezone': 'GMT',
        'utc_offset_seconds': 0,
        'elevation': 11,
        'current': {
            'time': times[0],
            'temperature_2m': temp[0],
            'relative_humidity_2m': 68,
            'apparent_temperature': temp[0] - 1,
            'is_day': 1 if is_day else 0,
            'precipitation': 0.0,
            'weather_code': code,
            'cloud_cover': 60,
            'pressure_msl': 1013.2,
            'wind_speed_10m': 14.0,
            'wind_direction_10m': 225,
            'wind_gusts_10m': 24.0,
        },
        'hourly': {
            'time': times,
            'temperature_2m': temp,
            'apparent_temperature': [t - 1 for t in temp],
            'weather_code': [code] * len(hours),
            'precipitation': precip,
            'precipitation_probability': precip_prob,
            'is_day': is_day_hour,
            'dew_point_2m': [round(t - 6, 1) for t in temp],
            'visibility': [12000] * len(hours),
            'pressure_msl': [1013 + round(2 * math.sin(i / 20), 1) for i in range(len(hours))],
            'wind_speed_10m': [14.0] * len(hours),
            'wind_gusts_10m': [24.0] * len(hours),
            'wind_direction_10m': [225] * len(hours),
            'uv_index': uv,
            'relative_humidity_2m': [68] * len(hours),
            'cape': cape,
            'snow_depth': [0] * len(hours),
            'snowfall': [0] * len(hours),
            'freezing_level_height': [1500] * len(hours),
        },
        'minutely_15': {
            'time': [(now + timedelta(minutes=15 * i)).strftime('%Y-%m-%dT%H:%M') for i in range(96)],
            'precipitation': [0.0] * 96,
        },
        'daily': daily,
    }


def air_quality() -> dict:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(now + timedelta(hours=i)).strftime('%Y-%m-%dT%H:00') for i in range(120)]
    return {
        'current': {
            'us_aqi': 42, 'european_aqi': 22, 'pm2_5': 8.1, 'pm10': 14.0, 'ozone': 60.0,
            'nitrogen_dioxide': 9.0, 'sulphur_dioxide': 1.2,
            'alder_pollen': None, 'birch_pollen': 3.0, 'grass_pollen': 1.0,
            'mugwort_pollen': None, 'olive_pollen': None, 'ragweed_pollen': None,
        },
        'hourly': {
            'time': times,
            'us_aqi': [42] * 120,
            'european_aqi': [22] * 120,
            'pm2_5': [8.1] * 120,
            'pm10': [14.0] * 120,
        },
    }


def location() -> dict:
    return {
        'id': 'harness-london',
        'name': 'London',
        'latitude': 51.5074,
        'longitude': -0.1278,
        'country': 'United Kingdom',
        'countryCode': 'GB',
        'admin1': 'England',
    }
