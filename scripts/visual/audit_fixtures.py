#!/usr/bin/env python3
"""Audit the Open-Meteo-style fixtures used by the visual harness.

This is a dependency-free structural and plausibility check, not a full JSON
Schema validator or a substitute for running the app's real API parsers.
Run from any directory with: python3 scripts/visual/audit_fixtures.py
"""
from __future__ import annotations

from datetime import datetime, timedelta
import math
from numbers import Real
from pathlib import Path
import sys
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fixtures  # noqa: E402

HOURLY_REQUIRED = {
    'time': 'time',
    'temperature_2m': 'number',
    'apparent_temperature': 'nullable',
    'weather_code': 'integer',
    'precipitation': 'nullable',
    'precipitation_probability': 'nullable',
    'is_day': 'integer',
    'dew_point_2m': 'nullable',
    'visibility': 'nullable',
    'pressure_msl': 'nullable',
    'wind_speed_10m': 'nullable',
    'wind_gusts_10m': 'nullable',
    'wind_direction_10m': 'nullable',
    'uv_index': 'nullable',
    'relative_humidity_2m': 'nullable',
}
HOURLY_OPTIONAL = {
    'cape': 'nullable',
    'snow_depth': 'nullable',
    'snowfall': 'nullable',
    'freezing_level_height': 'nullable',
}
DAILY_REQUIRED = {
    'time': 'date',
    'weather_code': 'integer',
    'temperature_2m_max': 'number',
    'temperature_2m_min': 'number',
    'sunrise': 'datetime',
    'sunset': 'datetime',
    'uv_index_max': 'nullable',
    'precipitation_probability_max': 'nullable',
    'precipitation_sum': 'nullable',
    'wind_speed_10m_max': 'nullable',
}
AIR_CURRENT_REQUIRED = (
    'us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide',
    'sulphur_dioxide', 'alder_pollen', 'birch_pollen', 'grass_pollen',
    'mugwort_pollen', 'olive_pollen', 'ragweed_pollen',
)
AIR_HOURLY_REQUIRED = {
    'time': 'time',
    'us_aqi': 'nullable',
    'european_aqi': 'nullable',
    'pm2_5': 'nullable',
    'pm10': 'nullable',
}


def _number(value: Any) -> bool:
    return isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(float(value))


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or 'T' not in value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo is None else None
    except ValueError:
        return None


def _check_series(
    section: Any,
    required: dict[str, str],
    optional: dict[str, str],
    expected_length: int | None,
    label: str,
) -> tuple[list[str], dict[str, list[Any]]]:
    errors: list[str] = []
    if not isinstance(section, dict):
        return [f'{label} must be an object'], {}

    arrays: dict[str, list[Any]] = {}
    for key, kind in {**required, **{k: v for k, v in optional.items() if k in section}}.items():
        values = section.get(key)
        if not isinstance(values, list):
            errors.append(f'{label}.{key} must be an array')
            continue
        arrays[key] = values
        if expected_length is not None and len(values) != expected_length:
            errors.append(f'{label}.{key} has {len(values)} values; expected {expected_length}')
        for index, value in enumerate(values):
            item_label = f'{label}.{key}[{index}]'
            if kind == 'time':
                if _parse_time(value) is None:
                    errors.append(f'{item_label} must be an ISO local datetime')
                    break
            elif kind == 'date':
                if not isinstance(value, str):
                    errors.append(f'{item_label} must be an ISO date')
                    break
                try:
                    datetime.strptime(value, '%Y-%m-%d')
                except ValueError:
                    errors.append(f'{item_label} must be an ISO date')
                    break
            elif kind == 'datetime':
                if _parse_time(value) is None:
                    errors.append(f'{item_label} must be an ISO local datetime')
                    break
            elif kind == 'nullable' and value is None:
                continue
            elif not _number(value):
                errors.append(f'{item_label} must be a finite number' + (' or null' if kind == 'nullable' else ''))
                break
            elif kind == 'integer' and int(value) != value:
                errors.append(f'{item_label} must be an integer')
                break
    return errors, arrays


def _check_range(
    arrays: dict[str, list[Any]],
    key: str,
    minimum: float | None,
    maximum: float | None,
    label: str,
) -> list[str]:
    errors: list[str] = []
    for index, value in enumerate(arrays.get(key, [])):
        if value is None or not _number(value):
            continue
        if minimum is not None and value < minimum or maximum is not None and value > maximum:
            errors.append(f'{label}.{key}[{index}]={value} is outside the expected range')
            break
    return errors


def _check_chronology(values: list[Any], interval: timedelta, label: str) -> list[str]:
    errors: list[str] = []
    parsed = [_parse_time(value) for value in values]
    if any(value is None for value in parsed):
        return errors  # The series type check reports invalid timestamps.
    concrete = [value for value in parsed if value is not None]
    for previous, current in zip(concrete, concrete[1:]):
        if current - previous != interval:
            errors.append(f'{label} timestamps are not strictly spaced by {interval}')
            break
    return errors


def audit_forecast_payload(
    payload: Any,
    expected_code: int,
    label: str = 'forecast',
    expected_is_day: bool | None = None,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return [f'{label} must be an object']
    for key in ('latitude', 'longitude'):
        value = payload.get(key)
        if not _number(value):
            errors.append(f'{label}.{key} must be a finite number')
    if _number(payload.get('latitude')) and not -90 <= payload['latitude'] <= 90:
        errors.append(f'{label}.latitude is outside [-90, 90]')
    if _number(payload.get('longitude')) and not -180 <= payload['longitude'] <= 180:
        errors.append(f'{label}.longitude is outside [-180, 180]')
    if not isinstance(payload.get('timezone'), str) or not payload['timezone']:
        errors.append(f'{label}.timezone must be a non-empty string')
    if not isinstance(payload.get('utc_offset_seconds'), int):
        errors.append(f'{label}.utc_offset_seconds must be an integer')
    if 'elevation' in payload and not _number(payload['elevation']):
        errors.append(f'{label}.elevation must be a finite number when present')

    current = payload.get('current')
    current_required = {
        'time': 'time',
        'temperature_2m': 'number',
        'relative_humidity_2m': 'number',
        'apparent_temperature': 'number',
        'is_day': 'integer',
        'precipitation': 'number',
        'weather_code': 'integer',
        'cloud_cover': 'number',
        'pressure_msl': 'number',
        'wind_speed_10m': 'number',
        'wind_direction_10m': 'number',
        'wind_gusts_10m': 'number',
    }
    if not isinstance(current, dict):
        errors.append(f'{label}.current must be an object')
    else:
        for key, kind in current_required.items():
            value = current.get(key)
            item_label = f'{label}.current.{key}'
            if kind == 'time':
                if _parse_time(value) is None:
                    errors.append(f'{item_label} must be an ISO local datetime')
            elif not _number(value):
                errors.append(f'{item_label} must be a finite number')
            elif kind == 'integer' and int(value) != value:
                errors.append(f'{item_label} must be an integer')
        if _number(current.get('is_day')) and current['is_day'] not in (0, 1):
            errors.append(f'{label}.current.is_day must be 0 or 1')
        if current.get('weather_code') != expected_code:
            errors.append(f'{label}.current.weather_code does not match the scenario code')
        if expected_is_day is not None and current.get('is_day') != int(expected_is_day):
            errors.append(f'{label}.current.is_day does not match the scenario day/night setting')
        errors.extend(_check_range({'current.precipitation': [current.get('precipitation')]}, 'current.precipitation', 0, None, label))

    hourly_required = dict(HOURLY_REQUIRED)
    hourly_optional = dict(HOURLY_OPTIONAL)
    hourly_expected_length = 16 * 24
    hourly_errors, hourly = _check_series(
        payload.get('hourly'), hourly_required, hourly_optional, hourly_expected_length, f'{label}.hourly'
    )
    errors.extend(hourly_errors)
    for key, minimum, maximum in (
        ('temperature_2m', -100, 80), ('apparent_temperature', -120, 80),
        ('weather_code', 0, 99), ('precipitation', 0, None),
        ('precipitation_probability', 0, 100), ('is_day', 0, 1),
        ('dew_point_2m', -120, 80), ('visibility', 0, None), ('pressure_msl', 0, None),
        ('wind_speed_10m', 0, None), ('wind_gusts_10m', 0, None),
        ('wind_direction_10m', 0, 360), ('uv_index', 0, 30),
        ('relative_humidity_2m', 0, 100), ('cape', 0, None), ('snow_depth', 0, None),
        ('snowfall', 0, None), ('freezing_level_height', 0, None),
    ):
        errors.extend(_check_range(hourly, key, minimum, maximum, f'{label}.hourly'))
    errors.extend(_check_chronology(hourly.get('time', []), timedelta(hours=1), f'{label}.hourly'))
    if current and isinstance(current, dict) and hourly.get('time') and current.get('time') != hourly['time'][0]:
        errors.append(f'{label}.current.time does not equal the first hourly timestamp')
    if any(code != expected_code for code in hourly.get('weather_code', []) if _number(code)):
        errors.append(f'{label}.hourly.weather_code does not match the scenario code')
    if any(value not in (0, 1) for value in hourly.get('is_day', []) if _number(value)):
        errors.append(f'{label}.hourly.is_day values must be 0 or 1')

    daily_required = dict(DAILY_REQUIRED)
    daily_expected_length = 16
    daily_errors, daily = _check_series(
        payload.get('daily'), daily_required, {}, daily_expected_length, f'{label}.daily'
    )
    errors.extend(daily_errors)
    for key, minimum, maximum in (
        ('weather_code', 0, 99), ('temperature_2m_max', -100, 80),
        ('temperature_2m_min', -120, 80), ('uv_index_max', 0, 30),
        ('precipitation_probability_max', 0, 100), ('precipitation_sum', 0, None),
        ('wind_speed_10m_max', 0, None),
    ):
        errors.extend(_check_range(daily, key, minimum, maximum, f'{label}.daily'))
    dates = daily.get('time', [])
    if any(code != expected_code for code in daily.get('weather_code', []) if _number(code)):
        errors.append(f'{label}.daily.weather_code does not match the scenario code')
    if dates and all(isinstance(value, str) for value in dates) and any(a >= b for a, b in zip(dates, dates[1:])):
        errors.append(f'{label}.daily.time must be strictly increasing')
    highs = daily.get('temperature_2m_max', [])
    lows = daily.get('temperature_2m_min', [])
    if len(highs) == len(lows) and any(high < low for high, low in zip(highs, lows) if _number(high) and _number(low)):
        errors.append(f'{label}.daily maximum temperature is below the minimum')

    if 'minutely_15' in payload:
        minutely_errors, minutely = _check_series(
            payload['minutely_15'],
            {'time': 'time', 'precipitation': 'nullable'},
            {},
            96,
            f'{label}.minutely_15',
        )
        errors.extend(minutely_errors)
        errors.extend(_check_range(minutely, 'precipitation', 0, None, f'{label}.minutely_15'))
        errors.extend(_check_chronology(minutely.get('time', []), timedelta(minutes=15), f'{label}.minutely_15'))
    return errors


def audit_air_quality_payload(payload: Any, label: str = 'air_quality') -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return [f'{label} must be an object']
    current = payload.get('current')
    if not isinstance(current, dict):
        errors.append(f'{label}.current must be an object')
    else:
        for key in AIR_CURRENT_REQUIRED:
            value = current.get(key)
            if value is not None and not _number(value):
                errors.append(f'{label}.current.{key} must be a finite number or null')
        for key in ('us_aqi', 'european_aqi'):
            if _number(current.get(key)) and not 0 <= current[key] <= 1000:
                errors.append(f'{label}.current.{key} is outside [0, 1000]')
        for key in ('pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide', 'sulphur_dioxide', 'alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'):
            if _number(current.get(key)) and current[key] < 0:
                errors.append(f'{label}.current.{key} must not be negative')

    if 'hourly' in payload:
        hourly_errors, hourly = _check_series(
            payload['hourly'], AIR_HOURLY_REQUIRED, {}, 120, f'{label}.hourly'
        )
        errors.extend(hourly_errors)
        errors.extend(_check_range(hourly, 'us_aqi', 0, 1000, f'{label}.hourly'))
        errors.extend(_check_range(hourly, 'european_aqi', 0, 1000, f'{label}.hourly'))
        for key in ('pm2_5', 'pm10'):
            errors.extend(_check_range(hourly, key, 0, None, f'{label}.hourly'))
        errors.extend(_check_chronology(hourly.get('time', []), timedelta(hours=1), f'{label}.hourly'))
    return errors


def audit_location_payload(payload: Any, label: str = 'location') -> list[str]:
    if not isinstance(payload, dict):
        return [f'{label} must be an object']
    errors: list[str] = []
    for key in ('id', 'name', 'country', 'countryCode', 'admin1'):
        if not isinstance(payload.get(key), str) or not payload[key]:
            errors.append(f'{label}.{key} must be a non-empty string')
    for key, low, high in (('latitude', -90, 90), ('longitude', -180, 180)):
        value = payload.get(key)
        if not _number(value) or not low <= value <= high:
            errors.append(f'{label}.{key} must be a finite coordinate in [{low}, {high}]')
    return errors


def audit_fixtures() -> tuple[list[str], int]:
    errors: list[str] = []
    conditions = fixtures.CONDITION_CODE
    expected_conditions = {
        'clear', 'partlyCloudy', 'cloudy', 'fog', 'drizzle', 'rain',
        'showers', 'freezing', 'snow', 'thunder',
    }
    if set(conditions) != expected_conditions:
        errors.append('CONDITION_CODE does not cover the expected visual scenarios')

    forecast_count = 0
    for condition, code in conditions.items():
        for is_day in (True, False):
            label = f'forecast[{condition},{"day" if is_day else "night"}]'
            payload = fixtures.forecast(condition, is_day)
            errors.extend(audit_forecast_payload(payload, code, label, expected_is_day=is_day))
            forecast_count += 1

    air = fixtures.air_quality()
    errors.extend(audit_air_quality_payload(air))
    location = fixtures.location()
    errors.extend(audit_location_payload(location))
    if isinstance(location, dict):
        sample = fixtures.forecast('clear', True)
        for key in ('latitude', 'longitude'):
            if _number(location.get(key)) and _number(sample.get(key)) and abs(location[key] - sample[key]) > 0.0001:
                errors.append(f'location.{key} does not match the forecast fixture')
    return errors, forecast_count


def main() -> int:
    errors, forecast_count = audit_fixtures()
    if errors:
        print(f'FAIL: {len(errors)} weather fixture audit issue(s) across {forecast_count} forecast variants')
        for error in errors:
            print(f'- {error}')
        return 1
    print(f'PASS: {forecast_count} forecast variants, air-quality fixture and location match the visual API fixture contract')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
