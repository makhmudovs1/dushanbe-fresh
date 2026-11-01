import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release', pathlib.Path(__file__).with_name('deploy-auth-ux.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class DeploymentTests(unittest.TestCase):
    def test_only_known_upstreams_change(self):
        original = 'header Keep true\nreverse_proxy 127.0.0.1:4012 {\n}\nreverse_proxy 127.0.0.1:3000 {\n}'
        actual = release.candidate_config(original)
        self.assertEqual(actual, original.replace(':4012', ':4013').replace(':3000', ':3001'))

    def test_unknown_or_duplicate_routes_stop(self):
        for value in ['', 'reverse_proxy 127.0.0.1:4012', 'reverse_proxy 127.0.0.1:4012\nreverse_proxy 127.0.0.1:3000\nreverse_proxy 127.0.0.1:3000']:
            with self.assertRaises(ValueError):
                release.candidate_config(value)

    def test_bind_file_inode_is_preserved_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'active.Caddyfile'
            path.write_text('before')
            inode = path.stat().st_ino
            release.rewrite(path, 'candidate')
            self.assertEqual(path.stat().st_ino, inode)
            self.assertEqual(path.read_text(), 'candidate')
            link = pathlib.Path(directory) / 'link'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                release.rewrite(link, 'unsafe')


if __name__ == '__main__':
    unittest.main()
