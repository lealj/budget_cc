import copy
import pathlib
import unittest

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate_spec

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = yaml.safe_load((ROOT / 'contracts/openapi.yaml').read_text(encoding='utf-8'))


def validator(name):
    schema = copy.deepcopy(SPEC['components']['schemas'][name])
    schema['components'] = SPEC['components']
    return Draft202012Validator(schema, format_checker=FormatChecker())


class ContractTests(unittest.TestCase):
    def test_openapi_and_base_url(self):
        validate_spec(SPEC)
        self.assertEqual(SPEC['servers'][0]['url'], '/api/v1')

    def test_calendar_dates(self):
        check = validator('CalendarDate')
        check.validate('2024-02-29')
        for bad in ['2025-02-29', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z']:
            self.assertFalse(check.is_valid(bad), bad)

    def test_existing_snapshot_shape(self):
        validator('Snapshot').validate({
            'accounts': [], 'entries': [], 'allocations': [], 'allocatedTotal': 0,
            'settings': {'reserve': 2500, 'sinkingFund': 400, 'dailyPlan': 65, 'ambient': True},
        })
        validator('FinancialEntry').validate({
            'id': 'example', 'kind': 'expense', 'source': 'manual', 'name': 'Example',
            'amount': 12.5, 'date': '2026-09-06', 'variability': 'static',
            'recurring': True, 'recurrence': {'frequency': 'monthly'},
            'category': 'Example', 'accountId': 'example-account',
            'includedInForecast': True, 'completed': False,
        })

    def test_settings_requires_all_fields_and_nonnegative_money(self):
        check = validator('Settings')
        valid = {'reserve': 0, 'sinkingFund': 0, 'dailyPlan': 1.25, 'ambient': False}
        for field in valid:
            missing = dict(valid)
            del missing[field]
            self.assertFalse(check.is_valid(missing), field)
        self.assertFalse(check.is_valid(dict(valid, reserve=-1)))
        self.assertFalse(check.is_valid(dict(valid, dailyPlan=1.001)))


if __name__ == '__main__':
    unittest.main()
