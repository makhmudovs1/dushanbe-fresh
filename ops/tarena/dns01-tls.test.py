import importlib.util
import io
import json
import pathlib
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, pathlib.Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dns = load('dns_bootstrap', 'prepare-dns01-tls.py')
security = load('security_bootstrap', 'harden-production-host.py')
managed = load('managed_tls', 'activate-managed-https.py')


class DnsTlsTests(unittest.TestCase):
    def test_public_dns_payload_preserves_exact_value_and_relative_navju_name(self):
        value = 'x'*42+'-'
        row = dns.public_record({'fqdn':'_acme-challenge.www.dushanbefresh.tj.','value':value})
        self.assertEqual(row, {'name':'_acme-challenge.www.dushanbefresh.tj','host':'_acme-challenge.www','type':'TXT','value':value,'ttl':300})

    def test_unrelated_domains_raw_keys_and_invalid_values_rejected(self):
        for body in [None, {'fqdn':'other.invalid.','value':'x'*43},
                     {'fqdn':'_acme-challenge.dushanbefresh.tj.','value':'x'*42},
                     {'fqdn':'_acme-challenge.dushanbefresh.tj.','value':'x'*43,'keyAuth':'private-not-allowed'}]:
            with self.assertRaises(ValueError):
                dns.public_record(body)

    def test_callbacks_collect_both_records_without_modifying_or_silently_replacing_dns(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(dns,'JOB',pathlib.Path(directory)):
            status = pathlib.Path(directory)/'status.json'
            status.write_text(json.dumps({'status':'starting','records':[],'dnsChanged':False}))
            server = dns.http.server.HTTPServer(('127.0.0.1',0),dns.Handler)
            thread = threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            def post(path, body):
                request=urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+path,
                    data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(request,timeout=3) as response:
                    return response.status
            try:
                for domain in dns.DOMAINS:
                    self.assertEqual(post('/present',{'fqdn':'_acme-challenge.'+domain+'.','value':'x'*43}),200)
                recorded=json.loads(status.read_text())
                self.assertEqual(len(recorded['records']),2)
                self.assertFalse(recorded['dnsChanged'])
                with self.assertRaises(urllib.error.HTTPError):
                    post('/present',{'fqdn':'_acme-challenge.dushanbefresh.tj.','value':'y'*43})
                post('/cleanup',{'fqdn':'_acme-challenge.dushanbefresh.tj.','value':'x'*43})
                recorded=json.loads(status.read_text())
                self.assertEqual(len(recorded['records']),2)
                self.assertTrue(recorded['cleanupRequested'])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)

    def test_security_retry_only_controls_our_rollback_units(self):
        self.assertEqual(security.rollback_unit({}),security.UNIT)
        self.assertEqual(security.rollback_unit({'unit':security.UNIT+'-012345abcdef'}),security.UNIT+'-012345abcdef')
        for value in ['ssh','ssh.service',security.UNIT+'; reboot',None]:
            with self.assertRaises(ValueError):
                security.rollback_unit({'unit':value})

    def test_failed_hardening_command_has_safe_actionable_diagnostic(self):
        result=security.subprocess.CompletedProcess(['ufw'],1,'','iptables: failure api-token=must-not-leak')
        error=security.CommandFailed(['ufw','--force','enable'],result)
        self.assertEqual(error.reason,'iptables')
        self.assertEqual(error.code,1)
        self.assertNotIn('must-not-leak',str(error))

    def test_garbage_collected_transient_timer_is_not_stopped_again(self):
        with patch.object(security,'run',return_value='not-found\n') as command:
            security.stop_rollback_timer(security.UNIT)
            self.assertEqual(command.call_count,1)
            self.assertEqual(command.call_args.args[0][0:2],['systemctl','show'])
        with patch.object(security,'run',side_effect=['loaded\n','']) as command:
            security.stop_rollback_timer(security.UNIT)
            self.assertEqual(command.call_count,2)
            self.assertEqual(command.call_args.args[0],['systemctl','stop',security.UNIT+'.timer'])

    def test_mixed_case_keep_waits_for_successful_second_key_login(self):
        accepted='Accepted publickey for adminj0n from 127.0.0.1 port 12345 ssh2: ED25519 '+security.FINGERPRINT
        with (patch.object(security.time,'time',return_value=100), patch.object(security.sys,'stdin',io.StringIO('Keep\n')),
              patch.object(security.select,'select',side_effect=[([1],[],[]),([],[],[])]),
              patch.object(security,'run',side_effect=['',accepted]) as command):
            security.wait_for_confirmation(100,100)
            self.assertEqual(command.call_count,2)

    def test_other_keys_and_password_logins_do_not_count_as_second_key_proof(self):
        self.assertFalse(security.confirmed_key_login('Accepted password for adminj0n '+security.FINGERPRINT))
        self.assertFalse(security.confirmed_key_login('Accepted publickey for root '+security.FINGERPRINT))
        self.assertFalse(security.confirmed_key_login('Accepted publickey for adminj0n SHA256:other'))

    def test_native_http01_never_activates_against_old_or_mixed_dns(self):
        new={'Status':0,'Answer':[{'type':1,'data':'77.95.0.94'}]}
        empty={'Status':0,'Answer':[]}
        self.assertTrue(managed.dns_points_here(new,empty))
        for answer in [{'Status':3}, {'Status':0,'Answer':[]},
                       {'Status':0,'Answer':[{'type':1,'data':'91.207.75.174'}]},
                       {'Status':0,'Answer':[{'type':1,'data':'77.95.0.94'},{'type':1,'data':'91.207.75.174'}]}]:
            self.assertFalse(managed.dns_points_here(answer,empty))
        self.assertFalse(managed.dns_points_here(new,{'Status':0,'Answer':[{'type':28,'data':'2001:db8::1'}]}))

    def test_bound_configuration_update_preserves_inode_and_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'active.Caddyfile'
            path.write_text('original configuration')
            inode=path.stat().st_ino
            managed.rewrite_bound_file(path,'new configuration')
            self.assertEqual(path.stat().st_ino,inode)
            self.assertEqual(path.read_text(),'new configuration')
            alias=pathlib.Path(directory)/'alias'
            alias.symlink_to(path)
            with self.assertRaises(ValueError):
                managed.rewrite_bound_file(alias,'bad')


if __name__=='__main__':
    unittest.main()
