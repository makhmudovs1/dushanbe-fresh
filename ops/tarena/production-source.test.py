import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source', pathlib.Path(__file__).with_name('export-production-source.py'))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class SourceExportTests(unittest.TestCase):
    def test_postgres_multiline_json_is_parsed_as_documents_not_lines(self):
        text = '{"model":"A","rows":[\n{"id":"1"},\n{"id":"2"}]}\n{"model":"B","rows":[]}'
        self.assertEqual([len(row['rows']) for row in source.documents(text)], [2, 0])

    def test_identifier_rejects_sql_and_path_injection(self):
        self.assertEqual(source.identifier('product_images'), '"product_images"')
        for bad in ['users; DROP TABLE users', '../secrets', 'a"b']:
            with self.assertRaises(ValueError): source.identifier(bad)

    def test_no_export_without_exact_forced_command(self):
        with patch.dict(source.os.environ, {'SSH_ORIGINAL_COMMAND': 'arbitrary-shell'}):
            with patch.object(source, 'run', side_effect=AssertionError('No database contact allowed')):
                with self.assertRaises(ValueError): source.main()

    def test_audit_credentials_are_redacted_without_changing_financial_values(self):
        row = {'amount': '25.20', 'nested': {'token': 'do-not-transfer', 'passwordHash': 'old-hash', 'reason': 'history'}}
        result = source.redact(row)
        self.assertEqual(result['amount'], '25.20')
        self.assertEqual(result['nested']['reason'], 'history')
        self.assertEqual(result['nested']['token'], '[removed-on-migration]')
        self.assertNotIn('old-hash', str(result))


if __name__ == '__main__': unittest.main()
