const fs = require('node:fs');
async function main() {
  const credentials = JSON.parse(fs.readFileSync('/pilot/credentials.json', 'utf8'));
  if (fs.readFileSync('/pilot/pilot.marker', 'utf8') !== 'df-tarena-synthetic-only-20261029\n') throw Error('Synthetic guard');
  const files = fs.readdirSync('/pilot/images').filter(n => /^[a-f0-9-]{36}\.webp$/.test(n));
  if (files.length !== 1) throw Error('Exactly one synthetic uploaded file required');
  const base = 'http://api:4000/api/v1';
  const response = await fetch(base + '/auth/admin/login', { method: 'POST', headers: { Origin: 'https://localhost:8444', 'Content-Type': 'application/json' }, body: JSON.stringify(credentials.admin) });
  if (response.status !== 200) throw Error('Staff login failed');
  const { accessToken } = await response.json();
  const image = '/api/v1/media/' + files[0];
  const changed = await fetch(base + '/admin/products/tarena-product-1', { method: 'PATCH', headers: { Origin: 'https://localhost:8444', 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken }, body: JSON.stringify({ image }) });
  const product = await changed.json();
  if (!changed.ok || product.image !== image || product.sellingPrice !== '7') throw Error('Fixture photo/price verification failed');
  console.log(JSON.stringify({ attached: true, syntheticOnly: true, priceUnchanged: true }));
}
main().catch(() => { console.error('Synthetic image fixture failed; details omitted'); process.exitCode = 1; });
