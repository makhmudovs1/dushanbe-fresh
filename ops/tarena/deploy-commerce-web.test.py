import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('commerce_deploy', pathlib.Path(__file__).with_name('deploy-commerce-web.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ProxyRewriteTests(unittest.TestCase):
    def test_keeps_bind_mount_inode_and_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'active.Caddyfile'
            path.write_text('previous-long-config')
            path.chmod(0o600)
            before = path.stat()
            deploy.rewrite(path, 'candidate')
            self.assertEqual(path.read_text(), 'candidate')
            self.assertEqual(path.stat().st_ino, before.st_ino)
            self.assertEqual(path.stat().st_mode, before.st_mode)

    def test_refuses_symlinks_and_hardlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'active'
            path.write_text('untouched')
            link = pathlib.Path(directory) / 'link'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                deploy.rewrite(link, 'wrong')
            link.unlink()
            link.hardlink_to(path)
            with self.assertRaises(ValueError):
                deploy.rewrite(path, 'wrong')
            self.assertEqual(path.read_text(), 'untouched')


if __name__ == '__main__':
    unittest.main()
