import importlib.util
import datetime
import pathlib
import unittest
from unittest.mock import patch


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, str(pathlib.Path(__file__).with_name(file)))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


watchdog = module('watchdog', 'readiness-watchdog.py')
observer = module('observer', 'external-monitor.py')
agent = module('agent', 'alert-agent.py')


class ReadinessOpsTests(unittest.TestCase):
    def test_readiness_metrics_feed_only_allowlisted_telegram_events(self):
        now = datetime.datetime.fromisoformat('2026-10-31T00:00:00+00:00').timestamp()
        sample = {'recordedAtUTC': '2026-10-31T00:00:00Z', 'alerts': ['http_5xx_detected', 'process_restarted', 'private-address']}
        backup = {'generatedAt': '2026-10-31T00:00:00Z', 'integrityVerified': True}
        self.assertEqual(agent.events(sample, backup, None, now), ['http_5xx_detected', 'process_restarted'])

    def test_recovery_requires_separated_failures_and_respects_cooldown(self):
        state, restart = watchdog.decision({}, True, 10000)
        self.assertFalse(restart)
        same, restart = watchdog.decision(state, True, 10001)
        self.assertFalse(restart)
        self.assertEqual(same['failures'], 1)
        state, _ = watchdog.decision(state, True, 10016)
        state, restart = watchdog.decision(state, True, 10032)
        self.assertTrue(restart)
        state.update({'restarted': 10031, 'restarts': [10031]})
        _, restart = watchdog.decision(state, True, 10048)
        self.assertFalse(restart)
        state.update({'restarts': [9900, 9950], 'restarted': 9500})
        _, restart = watchdog.decision(state, True, 10064)
        self.assertFalse(restart)

    def test_wrong_contour_is_rejected_before_any_restart(self):
        with patch.object(watchdog, 'command', return_value='{"com.docker.compose.project":"production"}'):
            with self.assertRaises(ValueError): watchdog.inspect('api')
        with self.assertRaises(ValueError): watchdog.inspect('production-api')

    def test_disabled_external_monitor_never_contacts_old_production(self):
        with patch.object(observer.http.client, 'HTTPSConnection', side_effect=AssertionError('No network allowed')):
            self.assertEqual(observer.probe({'enabled': False})['networkRequests'], 0)
            with self.assertRaises(ValueError):
                observer.probe({'enabled': True, 'mode': 'production', 'url': 'https://dushanbefresh.tj/api/v1/health/ready'})
            with self.assertRaises(ValueError):
                observer.probe({'enabled': True, 'mode': 'closed-test', 'url': 'https://dushanbefresh.tj/api/v1/health/ready'})

    def test_successful_alert_is_not_repeated_when_another_event_fails(self):
        sent = []
        def sender(event):
            if event == 'backup_failed': raise ValueError('mock unavailable')
            sent.append(event)
        state = agent.tick(['api_unavailable', 'backup_failed'], {}, 10000, sender)
        state = agent.tick(['api_unavailable', 'backup_failed'], state, 10060, sender)
        self.assertEqual(sent, ['api_unavailable'])
        self.assertEqual(state['failedEvents'], ['backup_failed'])


if __name__ == '__main__': unittest.main()
