import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('maps', pathlib.Path(__file__).with_name('deploy-geoapify-web.py'))
maps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maps)


class Response(io.BytesIO):
    status = 200


class AddressProbeTest(unittest.TestCase):
    def test_success_requires_provider_body_not_only_http_200(self):
        for status in ['unavailable', 'invalid']:
            with patch.object(maps.urllib.request, 'urlopen', return_value=Response(json.dumps({'status': status, 'items': []}).encode())):
                with self.assertRaises(ValueError):
                    maps.address('http://127.0.0.1:3003', '/api/address-search', {'query': 'Рудаки'})

    def test_probes_use_approved_origin_and_no_credentials(self):
        with patch.object(maps.urllib.request, 'urlopen', return_value=Response(b'{"status":"available","items":[]}')) as request:
            self.assertEqual(maps.address('http://127.0.0.1:3003', '/api/address-search', {'query': 'Рудаки'}), 0)
            sent = request.call_args.args[0]
            self.assertEqual(sent.get_header('Origin'), 'https://dushanbefresh.tj')
            self.assertIsNone(sent.get_header('Authorization'))
            self.assertEqual(sent.full_url, 'http://127.0.0.1:3003/api/address-search')

    def test_unconfigured_web_is_rejected_before_public_cutover(self):
        with patch.object(maps.base, 'get', return_value=(200, b'{"provider":null,"reverse":false}')):
            with self.assertRaises(ValueError):
                maps.maps_check('http://127.0.0.1:3003')


if __name__ == '__main__':
    unittest.main()
