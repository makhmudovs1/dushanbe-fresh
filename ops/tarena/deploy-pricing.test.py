import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('pricing', pathlib.Path(__file__).with_name('deploy-pricing.py'))
pricing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pricing)


class MigrationGateTest(unittest.TestCase):
    def setUp(self):
        self.expected = {'baseline': 'abc', pricing.MIGRATION: 'new'}
        self.applied = [{'migration_name': 'baseline', 'checksum': 'abc', 'finished_at': 'done', 'rolled_back_at': None}]

    def test_only_reviewed_pricing_migration_can_be_pending(self):
        pricing.validate_migrations(self.applied, self.expected)
        with self.assertRaises(ValueError):
            pricing.validate_migrations(self.applied, {**self.expected, 'unexpected': 'other'})

    def test_changed_checksum_and_failed_migration_block_deploy(self):
        for patch in [{'checksum': 'different'}, {'finished_at': None}, {'migration_name': 'unknown'}]:
            with self.assertRaises(ValueError):
                pricing.validate_migrations([{**self.applied[0], **patch}], self.expected)

    def test_already_applied_release_cannot_be_replayed(self):
        with self.assertRaises(ValueError):
            pricing.validate_migrations(self.applied + [{'migration_name': pricing.MIGRATION, 'checksum': 'new', 'finished_at': 'done', 'rolled_back_at': None}], self.expected)


if __name__ == '__main__':
    unittest.main()
