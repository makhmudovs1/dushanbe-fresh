import importlib.util
import json
import os
import pathlib
import stat
import tempfile
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, str(pathlib.Path(__file__).with_name(file)))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


daily = load('daily', 'daily-production-backup.py')
backup = daily.backup
restore = load('restore', 'restore-daily-files.py')


class DailyTests(unittest.TestCase):
    def test_local_mode_is_explicit_and_never_offsite_or_pruning(self):
        self.assertEqual(backup.validate(daily.CONFIG)['mode'], 'production-local')
        for change in [{'database': 'another'}, {'user': 'df_owner'}, {'allowLocalOnly': False},
                       {'allowPrune': True}, {'repository': 'sftp:unapproved'}, {'host': 'old-vps'}]:
            with self.assertRaises(ValueError):
                backup.validate({**daily.CONFIG, **change})

    def test_referenced_photos_are_deduplicated_and_path_checked(self):
        self.assertEqual(backup.photo_names(['/api/v1/media/a.webp', '/api/v1/media/a.webp']), ['a.webp'])
        for url in ['/api/v1/media/../secret', '/api/v1/media/a.webp?extra', 'http://old/api/v1/media/a.webp']:
            with self.assertRaises(ValueError):
                backup.photo_names([url])

    def test_only_committed_references_are_copied_and_missing_photo_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source, target = root / 'source', root / 'target'
            source.mkdir()
            target.mkdir()
            (source / 'a.webp').write_bytes(b'committed-photo')
            (source / 'in-progress.webp').write_bytes(b'partial-unreferenced-upload')
            backup.copy_photos(['a.webp'], source, target)
            self.assertEqual([p.name for p in target.iterdir()], ['a.webp'])
            with self.assertRaises(FileNotFoundError):
                backup.copy_photos(['missing.webp'], source, target)
            (source / 'link.webp').symlink_to(source / 'a.webp')
            with self.assertRaises(ValueError):
                backup.copy_photos(['link.webp'], source, target)

    def test_restic_key_may_be_root_owned_service_group_but_pgpass_must_be_private(self):
        info = SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_uid=0, st_gid=os.getegid())
        with patch.object(pathlib.Path, 'lstat', return_value=info):
            backup.credential_file('/test', allow_service_group=True)
            with self.assertRaises(ValueError):
                backup.credential_file('/test')
        for info in [SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_gid=os.getegid()),
                     SimpleNamespace(st_mode=stat.S_IFLNK | 0o600, st_uid=0, st_gid=os.getegid()),
                     SimpleNamespace(st_mode=stat.S_IFREG | 0o640, st_uid=123, st_gid=os.getegid())]:
            with patch.object(pathlib.Path, 'lstat', return_value=info), self.assertRaises(ValueError):
                backup.credential_file('/test', allow_service_group=True)

    def test_utc_schedule_catches_up_once_per_due_day_and_caps_failed_attempts(self):
        now = datetime(2026, 10, 31, 21, 30, tzinfo=timezone.utc)
        self.assertEqual(daily.due_day(now), '2026-10-31')
        self.assertEqual(daily.due_day(now.replace(hour=20)), '2026-10-30')
        self.assertTrue(daily.due(now, {}))
        self.assertFalse(daily.due(now, {'day': '2026-10-31', 'restoreVerified': True}))
        self.assertTrue(daily.due(now, {'day': '2026-10-31', 'attempts': 2}))
        self.assertFalse(daily.due(now, {'day': '2026-10-31', 'attempts': 3}))
        self.assertTrue(daily.due(now, {'day': '2026-10-30', 'attempts': 3}))

    def test_cron_install_preserves_unrelated_entries_and_is_idempotent(self):
        original = 'MAILTO=admin@example.invalid\n5 4 * * * /usr/bin/true\n'
        updated = daily.cron_text(original)
        self.assertIn(original.strip(), updated)
        self.assertEqual(updated.count('--scheduled'), 1)
        self.assertEqual(daily.cron_text(updated), updated)
        with self.assertRaises(ValueError):
            daily.cron_text(daily.CRON_START + '\n')

    def test_restore_checks_exact_file_set_and_detects_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name, data in [('database.dump', b'dump'), ('data.sha256', b'rows'), ('photos.json', b'[]')]:
                (root / name).write_bytes(data)
            manifest = {p.name: backup.sha(p) for p in root.iterdir()}
            (root / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(restore.verify_tree(root), 0)
            (root / 'extra').write_text('unexpected')
            with self.assertRaises(ValueError):
                restore.verify_tree(root)
            (root / 'extra').unlink()
            (root / 'database.dump').write_bytes(b'tampered')
            with self.assertRaises(ValueError):
                restore.verify_tree(root)

    def test_cleanup_cannot_delete_main_production_container(self):
        result = SimpleNamespace(returncode=0, stdout=json.dumps([{'Config': {'Labels': {'app': 'production'}}}]))
        with patch.object(daily.subprocess, 'run', return_value=result), patch.object(daily, 'run') as execute:
            with self.assertRaises(ValueError):
                daily.remove_owned('df-production-postgres-1', 'restore')
            execute.assert_not_called()

    def test_readonly_verifier_does_not_try_to_write_repository_locks(self):
        with patch.object(restore.backup, 'restic', return_value='[{"paths":["/work/snapshot-test"]}]') as call:
            self.assertEqual(str(restore.snapshot_path({}, 'a' * 64)), '/work/snapshot-test')
            self.assertEqual(call.call_args[0][0][0], '--no-lock')


if __name__ == '__main__':
    unittest.main()
