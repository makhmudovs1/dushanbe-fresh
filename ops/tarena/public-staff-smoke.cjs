const fs = require('node:fs');
const base = 'https://dushanbefresh.tj/api/v1';
const origin = 'https://dushanbefresh.tj';
let stage = 'fresh-staff-login';
async function main() {
  const [credential] = JSON.parse(fs.readFileSync('/prepared/staff-access.json'));
  let cookie = '';
  let token = '';
  async function request(path, method = 'GET', body, expected = 200) {
    const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status !== expected) throw Error('Public staff API did not accept request');
    return response;
  }
  try {
    const response = await request('/auth/admin/login', 'POST', { email: credential.email, password: credential.password });
    const header = response.headers.get('set-cookie') || '';
    if (!header.includes('Secure') || !header.includes('HttpOnly') || !header.includes('SameSite=Lax')) throw Error('Unsafe staff cookie');
    cookie = header.split(';')[0];
    token = (await response.json()).accessToken;
    if (!token) throw Error('No staff access token');
    stage = 'public-protected-admin';
    for (const path of ['/admin/products', '/admin/orders', '/admin/delivery-waves']) await request(path);
    stage = 'public-refresh';
    const refreshed = await request('/auth/refresh', 'POST');
    const next = refreshed.headers.get('set-cookie');
    if (!next || next.split(';')[0] === cookie) throw Error('Staff refresh did not rotate');
    cookie = next.split(';')[0];
    token = (await refreshed.json()).accessToken;
    await request('/admin/orders');
    stage = 'native-guest-validation';
    const native = await fetch(base + '/mobile/checkout/orders', { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
    if (native.status !== 400) throw Error('Native guest validation contract changed');
    const result = { publicStaffLogin: true, secureCookie: true, protectedAdminProductsOrdersWaves: true,
      publicRefreshAndRotation: true, nativeGuestValidation400: true, customerOrdersCreated: 0, smsSent: false,
      checkedAtUTC: new Date().toISOString() };
    fs.writeFileSync('/result/staff.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally {
    if (cookie) await request('/auth/logout', 'POST', undefined, 204);
  }
}
main().catch(() => { console.error(JSON.stringify({ publicStaffSmokeFailed: true, stage, privateDetailsWithheld: true })); process.exitCode = 1; });
