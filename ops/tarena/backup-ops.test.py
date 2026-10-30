import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
import subprocess
import sys
from unittest.mock import patch


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, str(pathlib.Path(__file__).with_name(file)))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'production-backup.py')
telegram = load('telegram', 'telegram-alert.py')
agent = load('agent', 'alert-agent.py')


class BackupTests(unittest.TestCase):
    def test_kernel_backup_lock_releases_after_a_killed_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            worker = subprocess.Popen([sys.executable, '-u', '-c',
                'import fcntl,sys,time; f=open(sys.argv[1],"w"); fcntl.flock(f,fcntl.LOCK_EX); print("locked",flush=True); time.sleep(60)',
                str(root / '.backup.lock')], stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(worker.stdout.readline().strip(), 'locked')
                with self.assertRaises(BlockingIOError):
                    backup.acquire_lock(root)
                worker.kill()
                worker.wait(timeout=5)
                with backup.acquire_lock(root):
                    pass
            finally:
                if worker.poll() is None:
                    worker.kill()
                    worker.wait(timeout=5)
                worker.stdout.close()

    def test_latest_snapshot_is_global_even_when_scratch_paths_change(self):
        values = [{'id': 'old', 'time': '2026-10-29T20:00:00Z', 'paths': ['/work/snapshot-old']},
                  {'id': 'new', 'time': '2026-10-30T20:00:00Z', 'paths': ['/work/snapshot-new']}]
        with patch.object(backup, 'restic', return_value=json.dumps(values)):
            self.assertEqual(backup.latest_snapshot({})['id'], 'new')

    def test_local_repository_cannot_be_misrepresented_as_production_offsite(self):
        for repository in ['/repository', 'http://untrusted', 's3:http://untrusted/bucket']:
            with self.assertRaises(ValueError):
                backup.validate({'mode': 'production', 'repository': repository, 'regionConfirmed': 'TJ', 'independentDestinationApproved': True})

    def test_region_and_independence_require_explicit_acceptance(self):
        config = {'mode': 'production', 'repository': 's3:https://storage.invalid/df', 'database': 'df_prod', 'user': 'df_backup'}
        with self.assertRaises(ValueError):
            backup.validate(config)
        self.assertEqual(backup.validate({**config, 'regionConfirmed': 'TJ', 'independentDestinationApproved': True})['database'], 'df_prod')

    def test_synthetic_guard_cannot_target_another_database(self):
        with self.assertRaises(ValueError):
            backup.validate({'mode': 'synthetic-local', 'repository': '/repository', 'database': 'production', 'user': 'rehearsal_backup'})

    def test_telegram_does_not_accept_http_success_with_error_body(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{"ok":false,"description":"mock rejected"}'
        with tempfile.TemporaryDirectory() as directory:
            token, chat = pathlib.Path(directory) / 'token', pathlib.Path(directory) / 'chat'
            token.write_text('123456:' + 'x' * 32)
            chat.write_text('12345')
            for path in [token, chat]: path.chmod(0o600)
            with self.assertRaises(ValueError):
                telegram.send('test', token, chat, opener=lambda *args, **kwargs: Response())
            with self.assertRaises(ValueError):
                telegram.send('customer +992 address', token, chat)
            token.chmod(0o644)
            with self.assertRaises(ValueError):
                telegram.send('test', token, chat)

    def test_alert_dedup_recovery_and_retry(self):
        sent = []
        state = agent.tick(['api_unavailable'], {}, 1000, sent.append)
        state = agent.tick(['api_unavailable'], state, 1010, sent.append)
        self.assertEqual(sent, ['api_unavailable'])
        state = agent.tick([], state, 1020, sent.append)
        self.assertEqual(sent[-1], 'recovered')
        def fail(event): raise ValueError('fake token must not appear in output')
        state = agent.tick(['backup_failed'], state, 1030, fail)
        self.assertTrue(state['deliveryFailed'])
        self.assertNotIn('backup_failed', state['sent'])
        agent.tick(['backup_failed'], state, 1040, sent.append)
        self.assertEqual(sent[-1], 'backup_failed')

    def test_backup_freshness_and_stale_monitor(self):
        self.assertIn('monitor_stale', agent.events({'at': '2026-10-30T00:00:00Z'}, None, None, 1793319000))


if __name__ == '__main__':
    unittest.main()
