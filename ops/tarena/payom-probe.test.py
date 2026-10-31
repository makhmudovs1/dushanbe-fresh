import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('probe', str(pathlib.Path(__file__).with_name('payom-probe.py')))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def test_budget_stops_a_fourth_attempt(self):
        ledger = {'maximumRequests': 3, 'attempts': []}
        for _ in range(3):
            attempt = probe.reserve(ledger, 'code-1')
            attempt['reviewed'] = True
        with self.assertRaises(ValueError):
            probe.reserve(ledger, 'code')
        self.assertEqual(len(ledger['attempts']), 3)

    def test_an_unreviewed_or_unknown_outcome_never_auto_retries(self):
        ledger = {'maximumRequests': 3, 'attempts': []}
        probe.reserve(ledger, 'code-1')
        with self.assertRaises(ValueError):
            probe.reserve(ledger, 'code')
        ledger['attempts'][0]['outcomeUnknown'] = True
        with self.assertRaises(ValueError):
            probe.reserve(ledger, 'code')


if __name__ == '__main__':
    unittest.main()
