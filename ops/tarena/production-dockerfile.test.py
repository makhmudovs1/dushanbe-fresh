import pathlib
import unittest


class WebBuildBoundaryTest(unittest.TestCase):
    def test_web_does_not_resolve_unchanged_api_runtime_dependencies(self):
        source = pathlib.Path(__file__).with_name('Production.Dockerfile').read_text()
        build, remaining = source.split('FROM build AS api-dependencies', 1)
        self.assertIn('pnpm db:generate && pnpm build', build)
        self.assertNotIn('deploy --prod', build)
        web = remaining.split('FROM base AS web', 1)[1].split('FROM base AS migrator', 1)[0]
        self.assertIn('--from=build', web)
        self.assertNotIn('--from=api-dependencies', web)
        self.assertIn('Runtime dependency differs from frozen build', remaining)
        self.assertIn('--from=api-dependencies --chown=node:node /out/api/node_modules', remaining)
        self.assertIn('--from=api-dependencies --chown=node:node /out/migrator/node_modules', remaining)


if __name__ == '__main__':
    unittest.main()
