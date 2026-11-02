import contextlib
import copy
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('storefront', pathlib.Path(__file__).with_name('publish-storefront-web.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
SHA = 'a' * 40
CURRENT_SHA = '71200edb6b0fc9ab6aaa7b3954fcf7b66e9a6c1f'
OLD = 'df-pricing-web-' + CURRENT_SHA[:12]
NEW = 'df-storefront-web-' + SHA[:12]
CADDY = '''dushanbefresh.tj, www.dushanbefresh.tj {
    handle /api/v1/* {
        reverse_proxy 127.0.0.1:4013 {
            header_up -Forwarded
        }
    }
    handle {
        reverse_proxy 127.0.0.1:3005 {
            header_up -Forwarded
        }
    }
}
'''


def adapted(web=3006, api=4013):
    return {'routes': [
        {'match': [{'path': ['/api/v1/*']}], 'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': f'127.0.0.1:{api}'}]}]},
        {'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': f'127.0.0.1:{web}'}]}]}
    ]}


def web_service(secret):
    return {'image': 'df-tarena-web-commerce:' + CURRENT_SHA[:12], 'container_name': OLD,
        'environment': {'PORT': '3005', 'HOSTNAME': '127.0.0.1', 'API_URL': 'http://127.0.0.1:4013/api/v1',
                        'NODE_OPTIONS': '--dns-result-order=ipv4first'},
        'network_mode': 'host', 'read_only': True, 'init': True, 'restart': 'unless-stopped',
        'env_file': ['/etc/dushanbe-fresh/web.env', str(secret)],
        'volumes': ['/srv/dushanbe-fresh/images:/data/images:ro'],
        'tmpfs': ['/tmp:size=16m'], 'mem_limit': '384m', 'pids_limit': 128, 'cap_drop': ['ALL'],
        'security_opt': ['no-new-privileges:true'], 'logging': {'driver': 'none'},
        'labels': {'df.production.revision': CURRENT_SHA, 'keep': 'label'},
        'healthcheck': {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3005/api/v1/health/ready')"],
                        'interval': '5s', 'timeout': '4s', 'retries': 3}}


def api_service():
    return {'container_name': deploy.API, 'image': 'df-tarena-api-commerce:7769f79a22bd',
        'network_mode': 'host', 'read_only': True, 'init': True,
        'command': ['node', '/ops/payom-ui-pilot.cjs'],
        'environment': {'PAYOM_PILOT_API_PORT': '4013', 'NODE_OPTIONS': '--max-old-space-size=192'},
        'volumes': ['/srv/dushanbe-fresh/state/releases/auth-ux-06feacb81ca4:/ops:ro',
                    '/srv/dushanbe-fresh/state/payom-format-pilot-20261031:/probe',
                    '/etc/dushanbe-fresh/app.env:/run/secrets/app.env:ro',
                    '/srv/dushanbe-fresh/images:/data/images']}


class HelperTests(unittest.TestCase):
    def test_clone_preserves_every_runtime_option_and_excludes_api(self):
        service = web_service('/private/maps.env')
        source = {'services': {'web': service, 'api': {'never': 'copy'}}, 'volumes': {'never': {}}}
        original = copy.deepcopy(source)
        result = deploy.clone_web(source, SHA, OLD, 3005, 3006)
        expected = copy.deepcopy(service)
        expected.update(image='df-tarena-web-commerce:' + SHA[:12], container_name=NEW)
        expected['environment']['PORT'] = '3006'
        expected['labels']['df.production.revision'] = SHA
        expected['healthcheck']['test'][3] = expected['healthcheck']['test'][3].replace(':3005/', ':3006/')
        self.assertEqual(result, {'name': 'df-storefront-' + SHA[:12], 'services': {'web': expected}})
        self.assertEqual(source, original)

    def test_runtime_mismatch_or_relative_mounts_are_rejected(self):
        for key, value in [('container_name', 'stale'), ('depends_on', ['api']), ('build', '.'),
                           ('volumes', ['./images:/data/images']), ('ports', ['3006:3005'])]:
            with self.subTest(key=key):
                service = web_service('/private/maps.env')
                service[key] = value
                with self.assertRaises(ValueError):
                    deploy.clone_web({'services': {'web': service}}, SHA, OLD, 3005, 3006)

    def test_only_exact_current_web_upstream_changes(self):
        actual = deploy.candidate_config(CADDY, 3005, 3006)
        self.assertEqual(actual, CADDY.replace(':3005', ':3006'))
        for invalid in ['', CADDY.replace(':3005', ':30050'), CADDY.replace(':4013', ':4014'),
                        CADDY + '\nreverse_proxy 127.0.0.1:3005', CADDY.replace(':3005 {', ':3005 127.0.0.1:3007 {'),
                        CADDY.replace('reverse_proxy 127.0.0.1:3005', '# reverse_proxy 127.0.0.1:3005')]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    deploy.candidate_config(invalid, 3005, 3006)

    def test_adapted_api_upstream_cannot_be_swapped_or_extended(self):
        deploy.validate_routes(adapted(), 3006)
        extra = adapted()
        extra['routes'].append({'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:3007'}]})
        for invalid in [adapted(api=4014), adapted(web=4013, api=3006), extra, {}]:
            with self.assertRaises(ValueError):
                deploy.validate_routes(invalid, 3006)

    def test_path_guards_reject_links_and_noncanonical_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory).resolve()
            file = root / 'file'
            file.write_text('untouched')
            self.assertEqual(deploy.safe_path(file), file)
            alias = root / 'alias'
            alias.symlink_to(file)
            for value in [alias, 'relative', str(root) + '/./file', str(root) + '/../' + root.name + '/file']:
                with self.assertRaises(ValueError):
                    deploy.safe_path(value)
            alias.unlink()
            alias.hardlink_to(file)
            with self.assertRaises(ValueError):
                deploy.safe_path(file)

    def test_protected_hashes_include_map_env_and_ledger(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory).resolve()
            env, ledger = root / 'maps.env', root / 'grant.json'
            env.write_text('private')
            ledger.write_text('ledger')
            with patch.object(deploy.base, 'protected', side_effect=lambda: {str(ledger): 'base-hash'}):
                first = deploy.protected([str(env)])
                env.write_text('changed')
                self.assertNotEqual(deploy.protected([str(env)]), first)
                env.write_text('private')
                ledger.write_text('changed-ledger')
                self.assertNotEqual(deploy.protected([str(env)]), first)

    def test_all_cli_expectations_are_required_without_abbreviations(self):
        argv = ['--deploy-approved', SHA, '--expected-web', OLD, '--old-port', '3005', '--new-port', '3006']
        self.assertEqual(deploy.arguments(argv).new_port, 3006)
        for offset in range(0, len(argv), 2):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                deploy.arguments(argv[:offset] + argv[offset + 2:])
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            deploy.arguments([word.replace('--expected-web', '--expected') for word in argv])

    def test_real_pilot_wrapper_uses_payom_port_without_PORT(self):
        api = api_service()
        running = {'Config': {'Image': api['image'], 'Cmd': api['command'],
            'Env': ['PAYOM_PILOT_API_PORT=4013', 'NODE_OPTIONS=--max-old-space-size=192']}}
        original = copy.deepcopy((api, running))
        deploy.validate_api(api, running)
        self.assertNotIn('PORT', api['environment'])
        self.assertEqual((api, running), original)

    def test_wrong_wrapper_or_payom_port_cannot_be_masked_by_PORT(self):
        for changes in [{'command': ['node', '/app/dist/main.js']},
                        {'environment': {'PORT': '4013', 'NODE_OPTIONS': '--max-old-space-size=192'}},
                        {'environment': {'PAYOM_PILOT_API_PORT': '4012', 'PORT': '4013'}},
                        {'container_name': 'stale-api'}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                deploy.validate_api({**api_service(), **changes})
        api = api_service()
        config = {'Image': api['image'], 'Cmd': api['command'],
                  'Env': ['PAYOM_PILOT_API_PORT=4013', 'NODE_OPTIONS=--max-old-space-size=192']}
        for changes in [{'Cmd': ['node', '/app/dist/main.js']},
                        {'Env': ['PORT=4013', 'NODE_OPTIONS=--max-old-space-size=192']},
                        {'Env': ['PAYOM_PILOT_API_PORT=4012', 'PORT=4013']}, {'Image': 'old-api-image'}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                deploy.validate_api(api, {'Config': {**config, **changes}})


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        directory = self.stack.enter_context(tempfile.TemporaryDirectory())
        self.root = pathlib.Path(directory).resolve()
        self.release = self.root / ('state/releases/storefront-' + SHA[:12])
        self.release.mkdir(parents=True)
        self.script = self.release / 'publish-storefront-web.py'
        self.script.write_text('fixture')
        self.old_release = self.root / ('state/releases/web-' + CURRENT_SHA[:12])
        self.current_web = OLD
        self.old_release.mkdir()
        self.api_release = self.root / 'state/releases/pricing-7769f79a22bd'
        self.api_release.mkdir()
        self.secret = self.root / 'state/secrets/geoapify-20261101.env'
        self.secret.parent.mkdir()
        self.secret.write_text('private-map-env')
        self.secret.chmod(0o600)
        self.source = {'services': {'web': web_service(self.secret)}}
        self.old_compose = self.old_release / 'compose.json'
        self.old_compose.write_text(json.dumps(self.source))
        self.api_compose = self.api_release / 'compose.json'
        self.api_compose.write_text(json.dumps({'services': {'api': api_service()}}))
        self.api_before = self.api_compose.read_bytes()
        self.pointer = self.root / 'state/web-current.json'
        self.pointer.write_text(json.dumps({'release': str(self.old_release), 'compose': str(self.old_compose),
            'apiCompose': str(self.api_compose), 'commit': CURRENT_SHA, 'keep': 'pointer-metadata'}))
        self.pointer_before = self.pointer.read_text()
        self.active = self.root / 'state/public-proxy/active.Caddyfile'
        self.active.parent.mkdir()
        self.active.write_text(CADDY)
        self.inode = self.active.stat().st_ino
        self.calls = []
        self.requests = []
        self.public_delays = []
        self.failed_path = None
        self.failed_command = None
        self.warm_failure = False
        self.state_changed = None
        self.hash_changed = False
        self.rolled_back = False
        self.cutover = False
        self.adapted = adapted()
        self.available_names = ''
        self.protected_calls = 0
        self.rows = {}
        for index, name in enumerate([deploy.API, deploy.DATABASE, deploy.base.PROXY, OLD, NEW]):
            self.rows[name] = {'Id': name + '-id', 'State': {'Running': True, 'Pid': index + 100, 'StartedAt': 'before'},
                'Config': {'Image': 'unrelated-image', 'Env': [], 'Labels': {}}}
        api = api_service()
        self.rows[deploy.API]['Config'] = {'Image': api['image'], 'Cmd': api['command'],
            'Env': ['PAYOM_PILOT_API_PORT=4013', 'NODE_OPTIONS=--max-old-space-size=192']}
        self.rows[OLD]['Config'] = {'Image': self.source['services']['web']['image'], 'Env': ['PORT=3005'],
                                   'Labels': {'df.production.revision': CURRENT_SHA}}
        self.rows[NEW]['Config'] = {'Image': 'df-tarena-web-commerce:' + SHA[:12], 'Env': ['PORT=3006'],
                                   'Labels': {'df.production.revision': SHA}}
        self.rows[NEW]['Image'] = 'image-id'
        self.rows[deploy.base.PROXY].update(Path='caddy', Args=['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
            Image='proxy-image-id', Mounts=[{'Source': str(self.active), 'Destination': '/etc/caddy/Caddyfile'}])
        image = 'df-tarena-web-commerce:' + SHA[:12]
        self.rows[image] = {'Id': 'image-id', 'Config': {'Labels': {'org.opencontainers.image.revision': SHA}}}
        self.stack.enter_context(patch.object(deploy, 'ROOT', self.root))
        self.stack.enter_context(patch.object(deploy, '__file__', str(self.script)))
        self.stack.enter_context(patch.object(deploy.os, 'getuid', return_value=1000))
        self.stack.enter_context(patch.object(deploy.os, 'umask'))
        self.socket = self.stack.enter_context(patch.object(deploy.socket, 'socket'))
        self.stack.enter_context(patch.object(deploy.time, 'sleep'))
        self.run = self.stack.enter_context(patch.object(deploy.base, 'run', side_effect=self.command))
        self.stack.enter_context(patch.object(deploy.base, 'get', side_effect=self.get))
        self.stack.enter_context(patch.object(deploy.base, 'inspect', side_effect=self.inspect))
        self.stack.enter_context(patch.object(deploy, 'protected', side_effect=self.protected))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        real_safe = deploy.safe_path

        def safe(value, directory=False):
            if str(value) == '/etc/dushanbe-fresh/web.env':
                return pathlib.Path(value)
            return real_safe(value, directory)

        self.stack.enter_context(patch.object(deploy, 'safe_path', side_effect=safe))
        real_stat = pathlib.Path.stat

        def stat(path, *args, **kwargs):
            row = real_stat(path, *args, **kwargs)
            if path == self.secret:
                values = list(row)
                values[4] = 1000
                return os.stat_result(values)
            return row

        self.stack.enter_context(patch.object(pathlib.Path, 'stat', stat))

    def inspect(self, name):
        row = copy.deepcopy(self.rows[name])
        if self.cutover and self.state_changed == name:
            row['State']['Pid'] += 1
        return row

    def protected(self, env_files):
        self.protected_calls += 1
        return {'ledger': 'changed' if self.cutover and self.hash_changed else 'same'}

    def command(self, args, **kwargs):
        self.calls.append(args)
        if self.failed_command and self.failed_command(args):
            raise ValueError('mocked command failure')
        if args[:3] == ['docker', 'ps', '-a']:
            return self.available_names
        if args[:2] == ['docker', 'exec']:
            return 'old-build' if args[2] == self.current_web else 'new-build'
        if args[:2] == ['docker', 'run']:
            return json.dumps(self.adapted)
        if args[:3] == ['docker', 'kill', '--signal']:
            if self.active.read_text() == CADDY:
                self.rolled_back = True
            else:
                self.cutover = True
        if args[:2] == ['docker', 'stop']:
            self.assertTrue((self.release / 'result.json').is_file())
            self.assertEqual(json.loads(self.pointer.read_text())['commit'], SHA)
            self.assertTrue(any(url == deploy.PUBLIC + '/checkout' for url in self.requests))
        return ''

    def get(self, url):
        self.requests.append(url)
        if self.warm_failure and url.startswith('http://127.0.0.1:3006/'):
            raise OSError('not ready')
        if url.startswith(deploy.PUBLIC) and 'new-build/_buildManifest' in url and self.public_delays:
            delay = self.public_delays.pop(0)
            if isinstance(delay, Exception):
                raise delay
            return delay
        if self.failed_path and url == deploy.PUBLIC + self.failed_path:
            return 503, b'unavailable'
        if '_buildManifest.js' in url:
            return 200, b'self.__BUILD_MANIFEST=' + (b'old' if 'old-build' in url else b'new')
        if url.endswith('/api/address-search'):
            return 200, b'{"provider":"geoapify","reverse":true}'
        return 200, b'{}'

    def publish(self, **kwargs):
        return deploy.main(kwargs.get('sha', SHA), kwargs.get('expected_web', OLD),
                           kwargs.get('old_port', 3005), kwargs.get('new_port', 3006))

    def assert_old_preserved(self, rollback=False):
        self.assertEqual(self.active.read_text(), CADDY)
        self.assertEqual(self.pointer.read_text(), self.pointer_before)
        self.assertEqual(self.active.stat().st_ino, self.inode)
        self.assertFalse(any(call[:2] == ['docker', 'stop'] for call in self.calls))
        self.assertEqual(self.rolled_back, rollback)

    def test_success_waits_out_public_manifest_race_and_preserves_api_pointer(self):
        self.public_delays = [OSError('reload pending'), (404, b'old route'), (200, b'wrong cached HTML')]
        result = self.publish()
        pointer = json.loads(self.pointer.read_text())
        self.assertEqual(pointer['apiCompose'], str(self.api_compose))
        self.assertEqual(self.api_compose.read_bytes(), self.api_before)
        self.assertEqual(pointer['keep'], 'pointer-metadata')
        self.assertEqual(pointer['compose'], str(self.release / 'compose.json'))
        self.assertEqual(result['stoppedPreviousWebOnly'], OLD)
        self.assertEqual(self.active.stat().st_ino, self.inode)
        self.assertEqual(self.active.read_text(), CADDY.replace(':3005', ':3006'))
        self.assertEqual(self.requests.count(deploy.PUBLIC + deploy.manifest('new-build')), 4)
        manifest_last = max(index for index, url in enumerate(self.requests) if 'new-build' in url)
        self.assertLess(manifest_last, self.requests.index(deploy.PUBLIC + '/'))
        compose = json.loads((self.release / 'compose.json').read_text())
        self.assertEqual(list(compose['services']), ['web'])
        self.assertEqual(compose['services']['web']['env_file'], self.source['services']['web']['env_file'])
        up = next(call for call in self.calls if call[:2] == ['docker', 'compose'])
        self.assertEqual(up[-7:], ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'web'])
        validator = next(call for call in self.calls if call[:2] == ['docker', 'run'])
        self.assertIn('--validate', validator)
        self.assertIn('/var/log/caddy:uid=1000,gid=1000,mode=0700,size=8m', validator)
        self.assertEqual(validator[validator.index('--network') + 1], 'none')
        self.assertFalse(any('migrat' in str(call) or 'sms' in str(call).lower() for call in self.calls))
        self.assertEqual([call for call in self.calls if call[:2] == ['docker', 'stop']],
                         [['docker', 'stop', '--time', '20', OLD]])

    def test_manifest_timeout_rolls_back_without_stopping_old_web(self):
        self.public_delays = [(404, b'old route')] * 40
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved(rollback=True)

    def test_failed_critical_path_rolls_back_in_place(self):
        self.failed_path = '/checkout'
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved(rollback=True)

    def test_invariant_failure_rolls_back(self):
        for name in [deploy.API, deploy.DATABASE, deploy.base.PROXY, OLD, NEW]:
            with self.subTest(name=name):
                # Each attempt needs a fresh immutable release.
                self.state_changed = name
                with self.assertRaises(ValueError):
                    self.publish()
                self.assert_old_preserved(rollback=True)
                self.reset_attempt()
        self.hash_changed = True
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved(rollback=True)

    def reset_attempt(self):
        for name in ['compose.json', 'before.Caddyfile', 'candidate.Caddyfile', 'result.json']:
            (self.release / name).unlink(missing_ok=True)
        self.cutover = self.rolled_back = False
        self.state_changed = None

    def test_warm_failure_never_rewrites_route_or_pointer(self):
        self.warm_failure = True
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved()

    def test_caddy_validation_failure_prevents_candidate_start(self):
        self.adapted = adapted(api=4014)
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved()
        self.assertFalse(any(call[:2] == ['docker', 'compose'] for call in self.calls))

    def test_reload_failure_restores_old_route(self):
        self.failed_command = lambda args: args[:2] == ['docker', 'kill'] and self.active.read_text() != CADDY
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved(rollback=True)

    def test_pointer_write_failure_restores_pointer_and_route(self):
        rewrite = deploy.base.rewrite

        def fail(path, content):
            if path == self.pointer and content != self.pointer_before:
                rewrite(path, 'partial-pointer-write')
                raise OSError('pointer failed')
            rewrite(path, content)

        with patch.object(deploy.base, 'rewrite', side_effect=fail), self.assertRaises(OSError):
            self.publish()
        self.assert_old_preserved(rollback=True)

    def test_result_write_failure_restores_pointer_and_route(self):
        write = deploy.write_new

        def fail(path, content):
            if path.name == 'result.json':
                raise OSError('disk full')
            write(path, content)

        with patch.object(deploy, 'write_new', side_effect=fail), self.assertRaises(OSError):
            self.publish()
        self.assert_old_preserved(rollback=True)

    def test_old_web_stop_error_is_reported_as_post_success_cleanup(self):
        self.failed_command = lambda args: args[:2] == ['docker', 'stop']
        result = self.publish()
        self.assertTrue(result['oldWebCleanupIncomplete'])
        self.assertFalse(self.rolled_back)
        self.assertEqual(json.loads(self.pointer.read_text())['commit'], SHA)

    def test_explicit_sha_name_port_and_release_guards_run_before_docker(self):
        for kwargs in [{'sha': 'a' * 12}, {'sha': 'A' * 40}, {'sha': '../' + SHA},
                       {'expected_web': '--bad'}, {'old_port': 4013}, {'new_port': 5432}, {'new_port': 3005}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.publish(**kwargs)
        with patch.object(deploy, '__file__', str(self.script.parent.parent / self.script.name)), self.assertRaises((ValueError, FileNotFoundError)):
            self.publish()
        self.run.assert_not_called()

    def test_used_release_and_pointer_escape_fail_closed(self):
        used = self.release / 'compose.json'
        used.symlink_to(self.old_compose)
        with self.assertRaises(ValueError):
            self.publish()
        used.unlink()
        pointer = json.loads(self.pointer_before)
        pointer['compose'] = str(self.root / 'outside.json')
        self.pointer.write_text(json.dumps(pointer))
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.publish()
        self.run.assert_not_called()

    def test_stale_expected_web_cannot_be_stopped(self):
        with self.assertRaises(ValueError):
            self.publish(expected_web='df-storefront-web-' + 'b' * 12)
        self.assert_old_preserved()

    def test_upstream_drift_is_rejected_before_docker(self):
        self.active.write_text(CADDY.replace(':3005', ':3004'))
        with self.assertRaises(ValueError):
            self.publish()
        self.run.assert_not_called()

    def test_existing_candidate_and_busy_port_are_rejected(self):
        self.available_names = NEW + '\n'
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved()
        self.available_names = ''
        self.socket.return_value.__enter__.return_value.bind.side_effect = OSError('busy')
        with self.assertRaises(OSError):
            self.publish()
        self.assert_old_preserved()

    def test_image_revision_mismatch_is_rejected(self):
        self.rows['df-tarena-web-commerce:' + SHA[:12]]['Config']['Labels']['org.opencontainers.image.revision'] = 'wrong'
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved()

    def test_current_api_wrapper_runtime_drift_is_rejected_before_docker(self):
        self.rows[deploy.API]['Config']['Cmd'] = ['node', '/app/dist/main.js']
        with self.assertRaises(ValueError):
            self.publish()
        self.run.assert_not_called()
        self.assert_old_preserved()

    def test_missing_private_map_env_is_rejected_before_docker(self):
        self.source['services']['web']['env_file'] = ['/etc/dushanbe-fresh/web.env']
        self.old_compose.write_text(json.dumps(self.source))
        with self.assertRaises(ValueError):
            self.publish()
        self.run.assert_not_called()
        self.assert_old_preserved()

    def test_same_build_id_cannot_mistake_old_public_manifest_for_success(self):
        with patch.object(deploy, 'build_id', return_value='old-build'), self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved()

    def test_candidate_must_use_the_preflight_image_digest(self):
        self.rows[NEW]['Image'] = 'different-image-id'
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_old_preserved()

    def test_future_storefront_release_is_cloned_from_current_pointer(self):
        self.current_web = 'df-storefront-web-' + CURRENT_SHA[:12]
        self.rows[self.current_web] = self.rows.pop(OLD)
        self.source['services']['web']['container_name'] = self.current_web
        self.source['services']['web']['environment']['KEEP_CURRENT_OPTION'] = 'preserved'
        future = self.root / ('state/releases/storefront-' + CURRENT_SHA[:12])
        self.old_release.rename(future)
        self.old_compose = future / 'compose.json'
        self.old_compose.write_text(json.dumps(self.source))
        current = json.loads(self.pointer_before)
        current.update(release=str(future), compose=str(self.old_compose))
        self.pointer.write_text(json.dumps(current))
        result = self.publish(expected_web=self.current_web)
        cloned = json.loads((self.release / 'compose.json').read_text())['services']['web']
        self.assertEqual(cloned['environment']['KEEP_CURRENT_OPTION'], 'preserved')
        self.assertEqual(result['stoppedPreviousWebOnly'], self.current_web)


if __name__ == '__main__':
    unittest.main()
