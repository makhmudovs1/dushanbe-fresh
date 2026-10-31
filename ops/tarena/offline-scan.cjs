const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const scanner = 'aquasec/trivy@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c';
const targets = {
  api: 'df-tarena-api-candidate:20261031', web: 'df-tarena-web-candidate:20261031',
  'api-hardened': 'df-tarena-api-candidate:20261031', 'web-hardened': 'df-tarena-web-candidate:20261031',
  'proxy-hardened': 'df-tarena-proxy-candidate:20261031',
  'postgres-alpine': 'postgres:16-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab',
  postgres: 'postgres:16-bookworm@sha256:e8a07d2c7579b038938cdba6c539e580e5001caf9ea203d397b5cc83e76bd938', proxy: 'caddy:2'
};
const root = '/private/tmp/df-offline-scan-20261031';
function run(args) {
  const r = spawnSync(docker, args, { encoding: 'utf8', timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
  if (r.status !== 0) throw Error('Offline scan step failed: ' + args[0]);
  return r.stdout;
}
try {
  process.umask(0o077);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (process.argv[2] === 'download-db') {
    // This container sees no project files, images, Docker socket or credentials.
    run(['run', '--rm', '-e', 'DO_NOT_TRACK=1', '-v', 'df-trivy-db-20261031:/root/.cache/trivy', scanner,
      'image', '--download-db-only', '--no-progress', '--skip-version-check', '--db-repository', 'ghcr.io/aquasecurity/trivy-db:2']);
    console.log('Public vulnerability database downloaded; no project metadata transmitted');
  } else {
    const key = process.argv[2], image = targets[key];
    if (!image) throw Error('Unknown target');
    const receipt = JSON.parse(run(['image', 'inspect', '--format', '{"id":{{json .Id}},"layers":{{json .RootFS.Layers}},"platform":{{json .Architecture}}}', image]));
    const archive = path.join(root, key + '.tar');
    run(['save', '--output', archive, image]);
    run(['run', '--rm', '--network', 'none', '-e', 'DO_NOT_TRACK=1', '--memory', '1536m', '--cpus', '2',
      '-v', archive + ':/input/image.tar:ro', '-v', root + ':/output', '-v', 'df-trivy-db-20261031:/root/.cache/trivy', scanner,
      'image', '--input', '/input/image.tar', '--offline-scan', '--skip-db-update', '--skip-java-db-update', '--skip-version-check',
      '--scanners', 'vuln', '--no-progress', '--format', 'json', '--output', '/output/' + key + '-scan.json']);
    const report = JSON.parse(fs.readFileSync(path.join(root, key + '-scan.json')));
    const findings = (report.Results || []).flatMap(r => (r.Vulnerabilities || []).map(v => ({ target: r.Target, id: v.VulnerabilityID, package: v.PkgName,
      installed: v.InstalledVersion, fixed: v.FixedVersion || null, severity: v.Severity, status: v.Status, source: v.PrimaryURL })));
    const counts = {}; for (const row of findings) counts[row.severity] = (counts[row.severity] || 0) + 1;
    const result = { recordedAtUTC: new Date().toISOString(), target: key, image, receipt, scanner, offline: true, network: 'none',
      counts, findings, projectMetadataTransmitted: false };
    fs.writeFileSync('docs/container-' + key + '-20261031.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ target: key, imageId: receipt.id, offline: true, counts }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
