import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, pathlib.Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('migration_backup', 'migration-local-backup.py')
security = load('migration_security', 'harden-production-host.py')


class MigrationOpsTests(unittest.TestCase):
    def test_encryption_resume_rejects_modified_dump_before_running_any_command(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root/'database.dump').write_bytes(b'original')
            manifest = {'database.dump': backup.sha(root/'database.dump')}
            (root/'manifest.json').write_text(json.dumps(manifest))
            (root/'database.dump').write_bytes(b'changed')
            with patch.object(backup, 'WORK', root), patch.object(backup.sys, 'argv', ['test','--resume-encryption']), patch.object(backup, 'command') as command:
                with self.assertRaisesRegex(ValueError, 'checksums changed'):
                    backup.main()
                command.assert_not_called()

    def test_encryption_resume_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root/'manifest.json').write_text(json.dumps({'../app.env': '0'*64}))
            with patch.object(backup, 'WORK', root), patch.object(backup.sys, 'argv', ['test','--resume-encryption']), patch.object(backup, 'command') as command:
                with self.assertRaisesRegex(ValueError, 'manifest'):
                    backup.main()
                command.assert_not_called()

    def test_backup_error_diagnostic_does_not_print_subprocess_secrets(self):
        result = subprocess.CompletedProcess(['restic'], 137, '', 'password=secret token=secret')
        with patch.object(backup.subprocess, 'run', return_value=result):
            with self.assertRaises(ValueError) as caught:
                backup.command(['restic','backup'])
            self.assertNotIn('secret', str(caught.exception))
            self.assertEqual(json.loads(str(caught.exception))['exitCode'], 137)

    def test_host_hardening_requires_owner_sudo(self):
        with patch.object(security.os, 'geteuid', return_value=1000), patch.object(security, 'run') as command:
            with self.assertRaises(ValueError):
                security.main()
            command.assert_not_called()

    def test_timed_rollback_removes_only_our_exact_policy(self):
        for changed_by_owner in [False, True]:
            with tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                dropin = root/'ssh.conf'
                text = '# independently changed by owner\n' if changed_by_owner else security.POLICY
                dropin.write_text(text)
                (root/'pending.json').write_text('{}')
                with patch.object(security, 'ROOT', root), patch.object(security, 'DROPIN', dropin), patch.object(security, 'run', return_value=''):
                    security.rollback()
                self.assertTrue((root/'rolled-back.json').is_file())
                self.assertEqual(dropin.exists(), changed_by_owner)
                if changed_by_owner:
                    self.assertEqual(dropin.read_text(), text)


if __name__ == '__main__':
    unittest.main()
