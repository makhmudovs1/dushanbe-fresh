const fs = require('node:fs');
const path = require('node:path');
const copied = new Map();
const output = '/out/migrator/node_modules';

function copy(name, parent) {
  const file = require.resolve(name + '/package.json', { paths: [parent] });
  const source = path.dirname(file);
  const pkg = JSON.parse(fs.readFileSync(file));
  if (copied.has(name)) {
    if (copied.get(name) !== pkg.version) throw Error('Conflicting frozen migration dependency');
    return;
  }
  copied.set(name, pkg.version);
  fs.mkdirSync(path.dirname(path.join(output, name)), { recursive: true });
  fs.cpSync(source, path.join(output, name), { recursive: true, filter: file => path.basename(file) !== 'node_modules' });
  for (const dep of Object.keys(pkg.dependencies || {})) copy(dep, source);
  for (const dep of Object.keys(pkg.optionalDependencies || {})) {
    try { require.resolve(dep + '/package.json', { paths: [source] }); }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error; }
    copy(dep, source);
  }
}

copy('prisma', '/workspace/apps/api');
if (copied.get('prisma') !== '5.22.0') throw Error('Unexpected Prisma CLI');
console.log(JSON.stringify({ migrationToolPackages: copied.size, frozenVersionsOnly: true }));
