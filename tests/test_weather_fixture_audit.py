import copy
from pathlib import Path
import sys
import unittest

VISUAL_DIR = Path(__file__).resolve().parents[1] / 'scripts' / 'visual'
sys.path.insert(0, str(VISUAL_DIR))
import audit_fixtures  # noqa: E402
import fixtures  # noqa: E402


class WeatherFixtureAuditTests(unittest.TestCase):
    def test_existing_visual_fixtures_pass_full_audit(self):
        errors, forecast_count = audit_fixtures.audit_fixtures()
        self.assertEqual(errors, [])
        self.assertEqual(forecast_count, 20)

    def test_forecast_shape_and_ranges_are_checked(self):
        payload = copy.deepcopy(fixtures.forecast('rain', True))
        errors = audit_fixtures.audit_forecast_payload(payload, 63, expected_is_day=True)
        self.assertEqual(errors, [])

        payload['hourly']['precipitation_probability'][0] = 101
        errors = audit_fixtures.audit_forecast_payload(payload, 63, expected_is_day=True)
        self.assertTrue(any('precipitation_probability[0]' in error for error in errors))

    def test_missing_arrays_scenario_mismatches_and_bad_daily_order_are_reported(self):
        payload = copy.deepcopy(fixtures.forecast('clear', False))
        del payload['hourly']['uv_index']
        payload['current']['is_day'] = 1
        payload['daily']['temperature_2m_max'][0] = -10
        payload['daily']['temperature_2m_min'][0] = 10
        errors = audit_fixtures.audit_forecast_payload(payload, 0, expected_is_day=False)
        self.assertTrue(any('hourly.uv_index must be an array' in error for error in errors))
        self.assertTrue(any('does not match the scenario day/night setting' in error for error in errors))
        self.assertTrue(any('maximum temperature is below the minimum' in error for error in errors))

    def test_air_quality_and_location_values_are_checked(self):
        air = copy.deepcopy(fixtures.air_quality())
        air['hourly']['pm10'][2] = -1
        air['current']['us_aqi'] = 1001
        errors = audit_fixtures.audit_air_quality_payload(air)
        self.assertTrue(any('hourly.pm10[2]' in error for error in errors))
        self.assertTrue(any('current.us_aqi' in error for error in errors))

        location = copy.deepcopy(fixtures.location())
        location['latitude'] = 91
        self.assertTrue(any('location.latitude' in error for error in audit_fixtures.audit_location_payload(location)))

    def test_invalid_timestamps_are_reported_without_crashing(self):
        payload = copy.deepcopy(fixtures.forecast('snow', True))
        payload['hourly']['time'][0] = 'not-a-time'
        payload['daily']['time'][0] = None
        errors = audit_fixtures.audit_forecast_payload(payload, 73, expected_is_day=True)
        self.assertTrue(any('hourly.time[0]' in error for error in errors))
        self.assertTrue(any('daily.time[0]' in error for error in errors))


if __name__ == '__main__':
    unittest.main()
