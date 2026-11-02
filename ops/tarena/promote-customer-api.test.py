import contextlib
import copy
import datetime
import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('promotion', pathlib.Path(__file__).with_name('promote-customer-api.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
SHA, WEB_SHA = 'a' * 40, '48b71addcbf9' + 'c' * 28
OLD, WEB = deploy.web.API, 'df-storefront-web-' + WEB_SHA[:12]
NEW, SHADOW = 'df-customer-api-' + SHA[:12], 'df-customer-api-' + SHA[:12] + '-shadow'
APP_ENV = {'DATABASE_URL': 'private-test-database-value', 'CUSTOMER_OTP_SECRET': 'private-test-otp-value',
           'STAFF_JWT_SECRET': 'private-test-staff-value', 'WEB_ORIGIN': 'https://dushanbefresh.tj'}
CADDY = '''dushanbefresh.tj, www.dushanbefresh.tj {
    handle /api/v1/* {
        reverse_proxy 127.0.0.1:4013 {
            header_up X-Forwarded-For {remote_host}
            header_up -Forwarded
            header_up -X-Real-IP
        }
    }
    handle {
        reverse_proxy 127.0.0.1:3008 {
            header_up X-Forwarded-For {remote_host}
            header_up -Forwarded
            header_up -X-Real-IP
        }
    }
}
'''


def api_service(root):
    return {'container_name': OLD, 'image': 'df-tarena-api-commerce:7769f79a22bd',
            'network_mode': 'host', 'read_only': True, 'init': True, 'restart': 'unless-stopped',
            'command': ['node', '/ops/payom-ui-pilot.cjs'],
            'environment': {'PAYOM_PILOT_API_PORT': '4013', 'NODE_OPTIONS': '--max-old-space-size=192'},
            'volumes': [str(root / 'old-ops') + ':/ops:ro', str(root / 'state/payom-format-pilot-20261031') + ':/probe',
                        '/etc/dushanbe-fresh/app.env:/run/secrets/app.env:ro', str(root / 'images') + ':/data/images'],
            'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'], 'mem_limit': '384m', 'pids_limit': 128,
            'tmpfs': ['/tmp:size=16m,mode=1777'], 'logging': {'driver': 'none'},
            'labels': {'df.production.revision': '7769f79a22bd' + 'b' * 28}, 'healthcheck': {'test': ['old-health']}}


class HelperTests(unittest.TestCase):
    def test_clone_removes_pilot_and_never_copies_secret_values(self):
        source = api_service(deploy.ROOT)
        original = copy.deepcopy(source)
        final, shadow = [deploy.clone_api(source, SHA, value) for value in [False, True]]
        self.assertEqual(source, original)
        self.assertEqual(final['environment'], deploy.web.NORMAL_ENV)
        self.assertNotIn('CUSTOMER_SMS_MAX_PER_HOUR', final['environment'])
        self.assertNotIn('CUSTOMER_SMS_MAX_PER_DAY', final['environment'])
        self.assertEqual(final['command'], ['node', '/app/dist/main.js'])
        self.assertEqual(final['env_file'], ['/etc/dushanbe-fresh/app.env'])
        self.assertEqual(final['volumes'], [str(deploy.ROOT / 'images') + ':/data/images'])
        self.assertEqual(shadow['environment']['API_PORT'], '4014')
        self.assertEqual(shadow['container_name'], SHADOW)
        self.assertEqual(shadow['restart'], 'no')
        for key in ['read_only', 'init', 'network_mode', 'mem_limit', 'pids_limit', 'cap_drop', 'security_opt', 'tmpfs']:
            self.assertEqual(final[key], source[key])
        deploy.web.validate_api(final)
        for changes in [{'environment': {**source['environment'], 'DATABASE_URL': 'private'}},
                        {'env_file': ['/other.env']}, {'entrypoint': ['custom']}, {'depends_on': ['postgres']},
                        {'read_only': False}, {'mem_limit': '1g'}, {'logging': {'driver': 'json-file'}}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                deploy.clone_api({**source, **changes}, SHA)

    def test_normal_and_shadow_use_bounded_local_logs_without_mutating_pilot(self):
        source = api_service(deploy.ROOT)
        expected = {'driver': 'local', 'options': {'max-size': '5m', 'max-file': '3'}}
        final, shadow = [deploy.clone_api(source, SHA, value) for value in [False, True]]
        self.assertEqual(final['logging'], expected)
        self.assertEqual(shadow['logging'], expected)
        self.assertEqual(source['logging'], {'driver': 'none'})
        following = deploy.clone_api(final, 'b' * 40)
        self.assertEqual(following['logging'], expected)
        final['logging']['options']['max-file'] = '9'
        self.assertEqual(shadow['logging'], expected)
        self.assertEqual(following['logging'], expected)
        self.assertEqual(deploy.web.NORMAL_LOGGING, expected)
        with self.assertRaises(ValueError):
            deploy.clone_api(final, 'c' * 40)

    def test_maintenance_removes_both_upstreams_without_touching_other_config(self):
        original = '{\n admin off\n}\n' + CADDY
        result = deploy.maintenance_config(original, 3008)
        self.assertEqual(result.count('respond "Temporarily unavailable" 503'), 2)
        self.assertNotIn('reverse_proxy', result)
        self.assertTrue(result.startswith('{\n admin off\n}\n'))
        for bad in [original.replace(':4013', ':4014'), original.replace(':3008', ':30080'),
                    original.replace('header_up -Forwarded', 'header_up -Other'), original + '\nreverse_proxy unknown']:
            with self.assertRaises(ValueError):
                deploy.maintenance_config(bad, 3008)

    def test_adapted_maintenance_cannot_proxy_or_serve_a_success_response(self):
        good = {'routes': [{'handler': 'static_response', 'status_code': 503}] * 2}
        deploy.validate_maintenance(good)
        for bad in [{}, {'routes': [{'handler': 'static_response', 'status_code': 200}] * 2},
                    {'routes': good['routes'] + [{'handler': 'reverse_proxy'}]}]:
            with self.assertRaises(ValueError):
                deploy.validate_maintenance(bad)

    def test_api_checks_require_database_and_both_strict_status_contracts(self):
        bodies = {'/health/ready': {'database': 'ok'}, '/customer-auth/status': {'enabled': True, 'requiredForCheckout': True},
                  '/mobile/auth/status': {'enabled': True, 'requiredForCheckout': True, 'available': True}}
        for path, changes in [('/health/ready', {'database': 'down'}), ('/customer-auth/status', {'enabled': False}),
                              ('/customer-auth/status', {'requiredForCheckout': False}), ('/mobile/auth/status', {'available': False}),
                              ('/mobile/auth/status', {'enabled': False}), ('/mobile/auth/status', {'requiredForCheckout': 1})]:
            values = copy.deepcopy(bodies)
            values[path].update(changes)
            def wait(url, status=200):
                return json.dumps(next(value for suffix, value in values.items() if url.endswith(suffix))).encode()
            with patch.object(deploy, 'wait', side_effect=wait), patch.object(deploy, 'request', return_value=(401, b'{}')), self.assertRaises(ValueError):
                deploy.check_api('http://127.0.0.1:4014')

    def test_protected_tracks_entire_pilot_inventory_and_rejects_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory).resolve()
            pilot = root / 'state/payom-format-pilot-20261031'
            pilot.mkdir(parents=True)
            file = pilot / 'other-provider-receipt.json'
            file.write_text('private')
            with patch.object(deploy, 'ROOT', root), patch.object(deploy.web, 'protected', return_value={'app': 'hash'}):
                before = deploy.protected([])
                file.write_text('changed')
                self.assertNotEqual(deploy.protected([]), before)
                before = deploy.protected([])
                (pilot / 'new-entry').write_text('new')
                self.assertNotEqual(deploy.protected([]), before)
                (pilot / 'link').symlink_to(file)
                with self.assertRaises(ValueError):
                    deploy.protected([])

    def test_private_tools_are_read_only_and_do_not_boot_api_or_contact_provider(self):
        self.assertIn('READ ONLY', deploy.DATABASE_CHECK)
        self.assertNotIn("-'first_name'", deploy.DATABASE_CHECK)
        self.assertNotIn('fetch(', deploy.ENV_CHECK)
        self.assertNotIn('checkPayomReadiness', deploy.ENV_CHECK)
        with patch.object(deploy.base, 'run', return_value='{}') as run:
            deploy.database('image', 'rows')
        args = run.call_args.args[0]
        self.assertIn('--read-only', args)
        self.assertIn('--env-file', args)
        self.assertEqual(args[-1], 'rows')
        self.assertFalse(any(word in args for word in ['migrate', 'deploy', 'seed', '--force-recreate']))

    def test_guest_probe_has_only_empty_json_and_no_credentials_or_redirects(self):
        response = types.SimpleNamespace(status=401, read=lambda size: b'{}')
        context = contextlib.nullcontext(response)
        with patch.object(deploy.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value = context
            self.assertEqual(deploy.request('http://127.0.0.1:4014/api/v1/checkout/orders', post=True)[0], 401)
        req = build.return_value.open.call_args.args[0]
        self.assertEqual(req.data, b'{}')
        self.assertEqual(dict(req.header_items()), {'Content-type': 'application/json'})
        self.assertIsNone(deploy.NoRedirect().redirect_request(None))

    def test_headroom_accounts_for_five_connections_and_two_reserved_for_ops(self):
        with patch.object(pathlib.Path, 'read_text', return_value='MemAvailable: 524288 kB\n'), \
                patch.object(deploy, 'database', return_value={'maximum': 20, 'reserved': 3, 'used': 10}) as db:
            deploy.headroom('image')
            db.return_value['used'] = 11
            with self.assertRaises(ValueError):
                deploy.headroom('image')
        with patch.object(pathlib.Path, 'read_text', return_value='MemAvailable: 524287 kB\n'), \
                patch.object(deploy, 'database', return_value={'maximum': 20, 'reserved': 3, 'used': 1}):
            with self.assertRaises(ValueError):
                deploy.headroom('image')

    def test_all_cli_expectations_required_and_rollback_is_opt_in(self):
        argv = ['--deploy-approved', SHA, '--expected-api', OLD, '--expected-web', WEB, '--web-port', '3008']
        self.assertFalse(deploy.arguments(argv).allow_optional_checkout_rollback)
        self.assertTrue(deploy.arguments(argv + ['--allow-optional-checkout-rollback']).allow_optional_checkout_rollback)
        for offset in range(0, len(argv), 2):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                deploy.arguments(argv[:offset] + argv[offset + 2:])
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            deploy.arguments([word.replace('--expected-web', '--expected-w') for word in argv])


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.root = pathlib.Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        self.release = self.root / ('state/releases/customer-' + SHA[:12])
        self.release.mkdir(parents=True)
        self.script = self.release / 'promote-customer-api.py'
        self.script.write_text('fixture')
        self.api = api_service(self.root)
        self.api_path = self.root / 'state/releases/pricing-7769f79a22bd/compose.json'
        self.web_path = self.root / ('state/releases/storefront-' + WEB_SHA[:12] + '/compose.json')
        self.source_web = {'container_name': WEB, 'image': 'df-tarena-web-commerce:' + WEB_SHA[:12],
                           'environment': {'PORT': '3008', 'HOSTNAME': '127.0.0.1', 'API_URL': 'http://127.0.0.1:4013/api/v1'},
                           'network_mode': 'host', 'labels': {'df.production.revision': WEB_SHA},
                           'env_file': ['/etc/dushanbe-fresh/web.env', str(self.root / 'map.env')],
                           'healthcheck': {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3008/api/v1/health/ready')"]}}
        for path, document in [(self.api_path, {'services': {'api': self.api, 'web': {'never': 'start'}}}),
                               (self.web_path, {'services': {'web': self.source_web}})]:
            path.parent.mkdir()
            path.write_text(json.dumps(document))
        self.pointer = self.root / 'state/web-current.json'
        self.pointer.write_text(json.dumps({'compose': str(self.web_path), 'apiCompose': str(self.api_path),
                                           'commit': WEB_SHA, 'release': str(self.web_path.parent), 'keep': 'metadata'}))
        self.original_pointer = self.pointer.read_text()
        self.original_composes = [p.read_bytes() for p in [self.api_path, self.web_path]]
        self.active = self.root / 'state/public-proxy/active.Caddyfile'
        self.active.parent.mkdir()
        self.active.write_text(CADDY)
        self.original_inodes = [p.stat().st_ino for p in [self.active, self.pointer]]
        self.backup_path = self.root / 'backup-status/daily/last-success.json'
        self.backup_path.parent.mkdir(parents=True)
        self.backup = {'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'restoreVerified': True, 'databaseRowHashesMatched': True}
        self.backup_path.write_text(json.dumps(self.backup))
        self.rows = {}
        for i, (name, service) in enumerate([(OLD, self.api), (WEB, self.source_web), (deploy.web.DATABASE, {}), (deploy.base.PROXY, {})]):
            self.rows[name] = self.runtime(name, service, 'old-image', i + 100)
        self.rows[deploy.base.PROXY].update(Path='caddy', Args=['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
            Image='proxy-image', Mounts=[{'Source': str(self.active), 'Destination': '/etc/caddy/Caddyfile'}])
        self.image = 'df-tarena-api-commerce:' + SHA[:12]
        self.rows[self.image] = {'Id': 'new-image', 'Config': {'Labels': {'org.opencontainers.image.revision': SHA},
            'Cmd': ['node', 'dist/main.js'], 'Entrypoint': ['docker-entrypoint.sh'], 'Env': ['NODE_ENV=production']}}
        self.calls, self.requests = [], []
        self.failure = self.http_failure = self.drift = None
        self.row_mismatch = self.private_drift = self.runtime_mismatch = False
        self.row_reads = 0
        self.effective_budget = {'maxPerHour': 10, 'maxPerDay': 50}
        self.existing_names = []
        self.args = deploy.arguments(['--deploy-approved', SHA, '--expected-api', OLD, '--expected-web', WEB, '--web-port', '3008'])
        for obj in [deploy, deploy.web, deploy.base]:
            self.stack.enter_context(patch.object(obj, 'ROOT', self.root))
        self.stack.enter_context(patch.object(deploy, '__file__', str(self.script)))
        self.stack.enter_context(patch.object(deploy.os, 'getuid', return_value=1000))
        self.stack.enter_context(patch.object(deploy.os, 'umask'))
        self.stack.enter_context(patch.object(deploy.time, 'sleep'))
        self.stack.enter_context(patch.object(deploy, 'headroom'))
        self.port = self.stack.enter_context(patch.object(deploy, 'port_free'))
        self.run = self.stack.enter_context(patch.object(deploy.base, 'run', side_effect=self.command))
        self.stack.enter_context(patch.object(deploy.base, 'inspect', side_effect=self.inspect))
        self.stack.enter_context(patch.object(deploy, 'request', side_effect=self.request))
        self.stack.enter_context(patch.object(deploy, 'protected', side_effect=self.protected))
        real_safe = deploy.web.safe_path
        def safe(value, directory=False):
            if str(value) == deploy.APP_ENV:
                return types.SimpleNamespace(stat=lambda: types.SimpleNamespace(st_uid=0, st_gid=1000, st_mode=0o100640))
            return real_safe(value, directory)
        self.stack.enter_context(patch.object(deploy.web, 'safe_path', side_effect=safe))
        self.output = self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def runtime(self, name, service, image='new-image', pid=200):
        env = {**APP_ENV, **service.get('environment', {})}
        return {'Id': name + '-id', 'Image': image,
                'State': {'Running': True, 'Pid': pid, 'StartedAt': 'before', 'Health': {'Status': 'healthy'}},
                'Config': {'Image': service.get('image'), 'Cmd': service.get('command'), 'Labels': service.get('labels', {}),
                           'Env': [f'{k}={v}' for k, v in env.items()]},
                'HostConfig': {'NetworkMode': 'host', 'LogConfig': {
                    'Type': service.get('logging', {}).get('driver', 'none'),
                    'Config': copy.deepcopy(service.get('logging', {}).get('options', {}))}},
                'Mounts': [{'Type': 'bind', 'Source': m.split(':')[0], 'Destination': m.split(':')[1]}
                           for m in service.get('volumes', [str(self.root / 'images') + ':/data/images'])]}

    def inspect(self, name):
        row = copy.deepcopy(self.rows[name])
        if self.runtime_mismatch and name == SHADOW:
            if self.runtime_mismatch == 'env':
                row['Config']['Env'] = [item for item in row['Config']['Env'] if not item.startswith('DATABASE_URL=')] + ['DATABASE_URL=different-private-value']
            elif self.runtime_mismatch == 'logging':
                row['HostConfig']['LogConfig'] = {'Type': 'none', 'Config': {}}
            else:
                row['Image'] = 'wrong-image'
        if self.drift and deploy.PHASE == 'verify-normal-api' and name == self.drift:
            row['State']['Pid'] += 1
        return row

    def protected(self, env_files):
        changed = self.private_drift and deploy.PHASE == 'verify-normal-api'
        return {'private-ledger': 'changed' if changed else 'same'}

    def command(self, args, **kwargs):
        self.calls.append(args)
        if self.failure and self.failure(args):
            raise ValueError('private operation failed')
        if args[:3] == ['docker', 'ps', '-a']:
            return '\n'.join(self.existing_names)
        if args[:2] == ['docker', 'exec']:
            self.assertEqual(args[-1], deploy.BUDGET_CHECK)
            self.assertIn(args[2], [NEW, SHADOW])
            return json.dumps(self.effective_budget)
        if args[:2] == ['docker', 'run']:
            if deploy.ENV_CHECK in args:
                return json.dumps({k: hashlib.sha256(v.encode()).hexdigest() for k, v in APP_ENV.items()})
            if deploy.DATABASE_CHECK in args:
                if args[-1] == 'capacity':
                    return json.dumps({'maximum': 20, 'reserved': 3, 'used': 4})
                self.row_reads += 1
                return json.dumps({'users': {'rows': '3', 'digest': 'different' if self.row_mismatch and self.row_reads > 1 else 'same'},
                                   'customer_sessions': {'rows': '2', 'digest': 'same'}})
            if any('maintenance.Caddyfile' in item for item in args):
                return json.dumps({'routes': [{'handler': 'static_response', 'status_code': 503}] * 2})
            return json.dumps({'routes': [{'match': [{'path': ['/api/v1/*']}], 'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:4013'}]}]},
                                         {'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:3008'}]}]})
        if args[:2] == ['docker', 'compose']:
            self.assertEqual(args[-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'])
            service = json.loads(pathlib.Path(args[3]).read_text())['services']['api']
            if service['container_name'] == NEW:
                self.assertFalse(self.rows[self.args.expected_api]['State']['Running'])
                self.assertFalse(self.rows[SHADOW]['State']['Running'])
                self.assertIn('respond ', self.active.read_text())
            self.rows[service['container_name']] = self.runtime(service['container_name'], service)
        if args[:2] == ['docker', 'stop']:
            name = args[-1]
            self.assertIn(name, [self.args.expected_api, NEW, SHADOW])
            if name == self.args.expected_api:
                self.assertIn('respond ', self.active.read_text())
            if name not in self.rows:
                raise ValueError('candidate was never created')
            self.rows[name]['State']['Running'] = False
        if args[:2] == ['docker', 'start']:
            self.assertEqual(args[2:], [self.args.expected_api])
            self.rows[args[-1]]['State']['Running'] = True
        return ''

    def request(self, url, post=False):
        self.requests.append((url, post))
        if self.http_failure:
            result = self.http_failure(url, post)
            if result is not None:
                return result, b'{}'
        if url.startswith('https:') and 'respond ' in self.active.read_text():
            return 503, b'maintenance'
        if post:
            self.assertTrue(url.endswith(('/api/v1/checkout/orders', '/api/v1/mobile/checkout/orders')))
            return 401, b'{}'
        if url.endswith('/health/ready'):
            return 200, b'{"database":"ok"}'
        if url.endswith('/customer-auth/status'):
            return 200, b'{"enabled":true,"requiredForCheckout":true}'
        if url.endswith('/mobile/auth/status'):
            return 200, b'{"enabled":true,"requiredForCheckout":true,"available":true}'
        return 200, b'page'

    def promote(self, allow=False):
        self.args.allow_optional_checkout_rollback = allow
        return deploy.main(self.args)

    def previous_normal(self):
        self.api = deploy.clone_api(self.api, 'b' * 40)
        self.args.expected_api = self.api['container_name']
        self.rows[self.args.expected_api] = self.runtime(self.args.expected_api, self.api, 'retained-normal-image')
        self.api_path = self.root / ('state/releases/customer-' + 'b' * 12 + '/compose.json')
        self.api_path.parent.mkdir()
        self.api_path.write_text(json.dumps({'services': {'api': self.api}}))
        current = json.loads(self.original_pointer)
        current['apiCompose'] = str(self.api_path)
        self.pointer.write_text(json.dumps(current))
        self.original_pointer = self.pointer.read_text()
        self.original_composes = [p.read_bytes() for p in [self.api_path, self.web_path]]

    def assert_preserved(self):
        self.assertEqual(self.pointer.read_text(), self.original_pointer)
        self.assertEqual([p.read_bytes() for p in [self.api_path, self.web_path]], self.original_composes)
        self.assertEqual([p.stat().st_ino for p in [self.active, self.pointer]], self.original_inodes)
        self.assertTrue(self.rows[self.args.expected_api]['State']['Running'])

    def test_success_only_changes_api_pointer_and_never_touches_web_or_database(self):
        result = self.promote()
        current = json.loads(self.original_pointer)
        self.assertEqual(json.loads(self.pointer.read_text()), {**current, 'apiCompose': str(self.release / 'compose.json')})
        self.assertEqual(self.active.read_text(), CADDY)
        self.assertEqual([p.stat().st_ino for p in [self.active, self.pointer]], self.original_inodes)
        self.assertEqual([p.read_bytes() for p in [self.api_path, self.web_path]], self.original_composes)
        self.assertEqual(result['mandatoryCheckout'], True)
        self.assertEqual(self.row_reads, 2)
        self.assertFalse(self.rows[OLD]['State']['Running'])
        self.assertFalse(self.rows[SHADOW]['State']['Running'])
        self.assertTrue(self.rows[NEW]['State']['Running'])
        self.assertFalse(any(call[:2] == ['docker', 'start'] for call in self.calls))
        for origin in ['http://127.0.0.1:4014', 'http://127.0.0.1:4013', deploy.web.PUBLIC]:
            for path in ['/checkout/orders', '/mobile/checkout/orders']:
                self.assertIn((origin + '/api/v1' + path, True), self.requests)
        files = ''.join(p.read_text() for p in self.release.iterdir())
        for value in [APP_ENV[k] for k in ['DATABASE_URL', 'CUSTOMER_OTP_SECRET', 'STAFF_JWT_SECRET']]:
            self.assertNotIn(value, files + self.output.getvalue())
        self.assertNotIn('DATABASE_URL', (self.release / 'compose.json').read_text())
        self.assertFalse(any(word in item for call in self.calls for item in call for word in ['migrate deploy', 'quota-reset', '/api/message', '/balance']))

    def test_shadow_failure_leaves_old_routing_and_pointer_running(self):
        self.http_failure = lambda url, post: 500 if ':4014/' in url else None
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)
        self.assertFalse(any(call[-1] == OLD for call in self.calls if call[:2] == ['docker', 'stop']))

    def test_guest_bypass_is_rejected_before_handoff(self):
        self.http_failure = lambda url, post: 400 if post else None
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)

    def test_failed_final_start_restarts_retained_old_even_if_no_candidate_created(self):
        self.failure = lambda args: args[:2] == ['docker', 'compose'] and args[3].endswith('/compose.json')
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertIn('respond ', self.active.read_text())
        self.assertTrue(deploy.ROLLBACK['oldApiRestarted'])
        self.assertFalse(deploy.ROLLBACK['mandatoryCheckoutFallback'])
        self.assertTrue(deploy.ROLLBACK['maintenanceRetained'])

    def test_optional_rollback_reopens_only_when_explicitly_approved(self):
        self.http_failure = lambda url, post: 400 if ':4013/' in url and post else None
        with self.assertRaises(ValueError):
            self.promote(allow=True)
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)
        self.assertFalse(deploy.ROLLBACK['mandatoryCheckoutFallback'])
        self.assertFalse(deploy.ROLLBACK['maintenanceRetained'])
        self.assertEqual([call for call in self.calls if call[:2] == ['docker', 'start']], [['docker', 'start', OLD]])

    def test_frozen_row_mismatch_keeps_maintenance_and_never_restores_database(self):
        self.row_mismatch = True
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertIn('respond ', self.active.read_text())

    def test_private_state_drift_cannot_reopen_optional_policy(self):
        self.private_drift = True
        with self.assertRaises(ValueError):
            self.promote(allow=True)
        self.assert_preserved()
        self.assertIn('respond ', self.active.read_text())
        self.assertTrue(deploy.ROLLBACK['rollbackIncomplete'])

    def test_unrelated_process_drift_aborts_without_restarting_it(self):
        self.drift = deploy.web.DATABASE
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertFalse(any(call[:2] in [['docker', 'stop'], ['docker', 'start']] and call[-1] in [WEB, self.drift] for call in self.calls))

    def test_pointer_partial_write_failure_restores_original_in_place(self):
        rewrite = deploy.base.rewrite
        def fail(path, content):
            if path == self.pointer and content != self.original_pointer:
                rewrite(path, 'partial')
                raise OSError('write failed')
            rewrite(path, content)
        with patch.object(deploy.base, 'rewrite', side_effect=fail), self.assertRaises(OSError):
            self.promote()
        self.assert_preserved()
        self.assertIn('respond ', self.active.read_text())

    def test_public_failure_after_pointer_update_rolls_back_under_maintenance(self):
        self.http_failure = lambda url, post: 500 if url == deploy.web.PUBLIC + '/account' else None
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertIn('respond ', self.active.read_text())
        self.assertTrue(deploy.ROLLBACK['oldApiRestarted'])

    def test_result_write_failure_does_not_leave_new_api_pointer(self):
        write = deploy.web.write_new
        def fail(path, content):
            if path.name == 'result.json':
                raise OSError('disk full')
            write(path, content)
        with patch.object(deploy.web, 'write_new', side_effect=fail), self.assertRaises(OSError):
            self.promote()
        self.assert_preserved()

    def test_runtime_image_mismatch_rejected_before_maintenance(self):
        self.runtime_mismatch = True
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)

    def test_private_root_database_mismatch_rejected_before_maintenance(self):
        self.runtime_mismatch = 'env'
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)

    def test_missing_actual_shadow_log_retention_rejected_before_maintenance(self):
        self.runtime_mismatch = 'logging'
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)

    def test_normal_runtime_requires_exact_service_and_actual_logging_limits(self):
        service = deploy.clone_api(self.api, SHA)
        self.rows[NEW] = self.runtime(NEW, service)
        hashes = {k: hashlib.sha256(v.encode()).hexdigest() for k, v in APP_ENV.items()}
        deploy.verify_runtime(service, self.rows[self.image], hashes)
        for log_config in [None, {'Type': 'none', 'Config': {}}, {'Type': 'local', 'Config': {}},
                           {'Type': 'local', 'Config': {'max-size': '50m', 'max-file': '3'}},
                           {'Type': 'local', 'Config': {'max-size': '5m', 'max-file': '9'}}]:
            self.rows[NEW]['HostConfig']['LogConfig'] = log_config
            with self.subTest(log_config=log_config), self.assertRaises(ValueError):
                deploy.verify_runtime(service, self.rows[self.image], hashes)
        self.rows[NEW] = self.runtime(NEW, service)
        for logging in [None, {'driver': 'none'}, {'driver': 'local'}]:
            with self.subTest(logging=logging), self.assertRaises(ValueError):
                deploy.verify_runtime({**service, 'logging': logging}, self.rows[self.image], hashes)

    def test_effective_candidate_budget_must_be_initial_approved_10_50(self):
        self.effective_budget['maxPerHour'] = 11
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)

    def test_present_root_budget_variables_are_inherited_and_privately_verified(self):
        with patch.dict(APP_ENV, {'CUSTOMER_SMS_MAX_PER_HOUR': '10', 'CUSTOMER_SMS_MAX_PER_DAY': '50'}):
            self.promote()
        service = json.loads((self.release / 'compose.json').read_text())['services']['api']
        self.assertNotIn('CUSTOMER_SMS_MAX_PER_HOUR', service['environment'])
        self.assertIn('CUSTOMER_SMS_MAX_PER_HOUR=10', self.rows[NEW]['Config']['Env'])

    def test_approved_optional_rollback_still_cannot_reopen_after_row_corruption(self):
        self.row_mismatch = True
        with self.assertRaises(ValueError):
            self.promote(allow=True)
        self.assert_preserved()
        self.assertIn('respond ', self.active.read_text())
        self.assertTrue(deploy.ROLLBACK['rollbackIncomplete'])

    def test_failure_to_confirm_maintenance_never_stops_old_api(self):
        self.http_failure = lambda url, post: 200 if url.startswith('https:') and deploy.PHASE == 'maintenance-drain' else None
        with self.assertRaises(ValueError):
            self.promote()
        self.assertTrue(self.rows[OLD]['State']['Running'])
        self.assertFalse(any(call[:2] == ['docker', 'stop'] and call[-1] == OLD for call in self.calls))
        self.assertIsNone(deploy.ROLLBACK['maintenanceRetained'])

    def test_proxy_signal_failure_before_stop_cannot_start_or_stop_old_api(self):
        self.failure = lambda args: args[:3] == ['docker', 'kill', '--signal']
        with self.assertRaises(ValueError):
            self.promote()
        self.assertTrue(self.rows[OLD]['State']['Running'])
        self.assertFalse(any(call[:2] in [['docker', 'start'], ['docker', 'stop']] and call[-1] == OLD for call in self.calls))
        self.assertTrue(deploy.ROLLBACK['rollbackIncomplete'])

    def test_reusable_normal_api_promotion_keeps_web_pointer_revision(self):
        self.previous_normal()
        self.promote()
        self.assertEqual(json.loads(self.pointer.read_text())['commit'], WEB_SHA)
        self.assertEqual(json.loads(self.pointer.read_text())['apiCompose'], str(self.release / 'compose.json'))

    def test_normal_policy_rollback_can_reopen_without_optional_policy_approval(self):
        self.previous_normal()
        self.http_failure = lambda url, post: 400 if ':4013/' in url and post else None
        with self.assertRaises(ValueError):
            self.promote()
        self.assert_preserved()
        self.assertEqual(self.active.read_text(), CADDY)
        self.assertTrue(deploy.ROLLBACK['mandatoryCheckoutFallback'])
        self.assertFalse(deploy.ROLLBACK['maintenanceRetained'])

    def test_stale_future_or_unverified_backup_prevents_any_candidate_start(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        for changes in [{'completedAt': (now - datetime.timedelta(seconds=7201)).isoformat()},
                        {'completedAt': (now + datetime.timedelta(hours=1)).isoformat()}, {'restoreVerified': False},
                        {'databaseRowHashesMatched': False}, {'restoreVerified': 'true'}]:
            self.backup_path.write_text(json.dumps({**self.backup, **changes}))
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.promote()
        self.run.assert_not_called()

    def test_embedded_database_url_or_wrong_revision_image_fails_before_tools(self):
        for changes in [{'Env': ['DATABASE_URL=must-not-copy']}, {'Labels': {'org.opencontainers.image.revision': 'b' * 40}}]:
            previous = copy.deepcopy(self.rows[self.image])
            self.rows[self.image]['Config'].update(changes)
            with self.assertRaises(ValueError):
                self.promote()
            self.rows[self.image] = previous
        self.run.assert_not_called()

    def test_explicit_guards_lock_and_unused_release_prevent_operations(self):
        for name, value in [('deploy_approved', 'a' * 12), ('expected_api', 'other'), ('expected_web', 'other'), ('web_port', 4013)]:
            original = getattr(self.args, name)
            setattr(self.args, name, value)
            with self.assertRaises(ValueError):
                self.promote()
            setattr(self.args, name, original)
        with patch.object(deploy.fcntl, 'flock', side_effect=BlockingIOError), self.assertRaises(BlockingIOError):
            self.promote()
        (self.release / 'compose.json').symlink_to(self.api_path)
        with self.assertRaises(ValueError):
            self.promote()
        self.run.assert_not_called()

    def test_existing_candidate_or_busy_shadow_port_fails_before_staging(self):
        self.existing_names = [SHADOW]
        with self.assertRaises(ValueError):
            self.promote()
        self.existing_names = []
        self.port.side_effect = OSError('busy')
        with self.assertRaises(OSError):
            self.promote()
        self.assertFalse((self.release / 'compose.json').exists())


if __name__ == '__main__':
    unittest.main()
