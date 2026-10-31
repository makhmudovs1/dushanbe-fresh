const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient, Prisma } = require(require.resolve('@prisma/client', { paths: ['/app'] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: ['/app'] }));
const db = new PrismaClient();
const D = Prisma.Decimal;
const base = 'http://127.0.0.1:4011/api/v1';
const origin = 'https://dushanbefresh.tj';
let stage = 'guard';
function guard() {
  if (new URL(process.env.DATABASE_URL).pathname !== '/df_production_restore_20261031'
      || process.env.DF_MIGRATION_RESTORE_SMOKE !== '1') throw Error('Restored copy only');
}
async function bootstrap() {
  guard();
  if (await db.order.count() || await db.user.count({ where: { id: { startsWith: 'migration-smoke-' } } })) throw Error('Unused restored copy required');
  await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO df_api');
  await db.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO df_api');
  await db.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO df_api');
  await db.$executeRawUnsafe('REVOKE ALL ON TABLE public._prisma_migrations FROM df_api');
  const credentials = {};
  for (const role of ['admin', 'picker', 'courier']) {
    const id = 'migration-smoke-'+role;
    const password = crypto.randomBytes(32).toString('base64url');
    const email = id+'@migration.invalid';
    await db.user.create({ data: { id, email, name: 'Migration test '+role,
      passwordHash: await bcrypt.hash(password, 12), role, roles: [role] } });
    credentials[role] = { email, password };
  }
  fs.writeFileSync('/smoke/staff.json', JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ restoredCopyInitialized: true, productionModified: false }));
}
async function smoke() {
  guard();
  let token = '';
  let refresh = '';
  const credentials = JSON.parse(fs.readFileSync('/smoke/staff.json'));
  const api = async (path, method='GET', body, expected) => {
    const response = await fetch(base+path, { method, signal: AbortSignal.timeout(15000), headers: {
      Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer '+token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (expected ? response.status !== expected : !response.ok) throw Error('API step failed '+response.status);
    return response.status === 204 ? null : response.json();
  };
  const login = async credential => {
    const response = await fetch(base+'/auth/admin/login', { method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(credential) });
    if (response.status !== 200) throw Error('Fresh staff login failed');
    const cookie = response.headers.get('set-cookie') || '';
    if (!cookie.includes('Secure') || !cookie.includes('HttpOnly') || !cookie.includes('SameSite=Lax')) throw Error('Session cookie policy');
    refresh = cookie.split(';')[0];
    const result = await response.json();
    token = result.accessToken;
    if (!token) throw Error('Missing access session');
  };
  stage = 'readiness';
  for (let i=0; i<30; i++) {
    try { await api('/health/ready'); break; } catch (error) { if (i === 29) throw error; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  stage = 'catalog and images';
  const products = await api('/products');
  const categories = await api('/categories');
  if (!products.length || !categories.length) throw Error('Empty migrated public catalog');
  const weighted = products.filter(p => p.unit === 'kg' && p.isWeighted && new D(p.sellingPrice).gt(0)).slice(0,2);
  if (weighted.length !== 2) throw Error('Two weighted products required');
  for (const product of products) {
    await api('/products/'+encodeURIComponent(product.slug));
    const paths = [product.image, ...(product.images || []).map(image => image.url || image.src)].filter(Boolean);
    for (const image of new Set(paths)) if (image.startsWith('/api/v1/media/')) {
      const response = await fetch('http://127.0.0.1:4011'+image, { signal: AbortSignal.timeout(5000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error('Migrated media missing');
      await response.arrayBuffer();
    }
  }
  stage = 'migrated administrator fresh password';
  const importedStaff = JSON.parse(fs.readFileSync('/prepared/staff-access.json'));
  await login(importedStaff[0]);
  await api('/admin/products');
  await api('/admin/orders');
  stage = 'staff sessions';
  await login(credentials.admin);
  const refreshed = await fetch(base+'/auth/refresh', { method: 'POST', headers: { Origin: origin, Cookie: refresh } });
  if (refreshed.status !== 200 || !(await refreshed.json()).accessToken) throw Error('Session restore failed');
  const newCookie = refreshed.headers.get('set-cookie');
  if (!newCookie) throw Error('No rotated refresh cookie');
  refresh = newCookie.split(';')[0];
  await api('/admin/settings/default-staff', 'PATCH', { pickerUserId: 'migration-smoke-picker', courierUserId: 'migration-smoke-courier' });
  const settings = await api('/admin/settings');
  const minimum = new D(settings.find(row => row.key === 'minimum_order_amount').value);
  const slots = await api('/delivery-slots');
  const slot = slots.find(s => s.available);
  if (!slot) throw Error('No available delivery slot');
  const items = weighted.map(p => ({ productId: p.id, qualityOptionId: null,
    quantity: D.max(new D(p.minQuantity), minimum.div(p.sellingPrice).div(2).div(p.quantityStep).ceil().mul(p.quantityStep).plus(p.minQuantity)).toString(),
    observedPrice: p.sellingPrice }));
  const input = { deliverySlotId: slot.id, items, address: { housingType: 'house', street: 'Migration synthetic street',
    building: '99', latitude: 38.575, longitude: 68.785, instructions: 'Test on restored database only' } };
  stage = 'guest checkout';
  const quote = await api('/checkout/validate', 'POST', input);
  if (!quote.valid) throw Error('Restored pricing or checkout validation failed');
  const create = { ...input, requestId: crypto.randomUUID(), reviewToken: quote.reviewToken,
    name: 'Migration synthetic', phone: '+992900000000', substitutionPolicy: 'contact_me' };
  const receipt = await api('/checkout/orders', 'POST', create, 201);
  const repeated = await api('/checkout/orders', 'POST', create, 201);
  if (receipt.orderNumber !== repeated.orderNumber || await db.order.count() !== 1) throw Error('Checkout idempotency failed');
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber }, include: { items: true } });
  if (order.items.length !== 2 || new Set(order.items.map(item => item.productId)).size !== 2) throw Error('Products merged');
  stage = 'picker actual weights';
  await login(credentials.picker);
  let wave = await api('/admin/delivery-waves/'+order.deliveryWaveId);
  if (wave.pickingList.length !== 2) throw Error('Procurement merged products');
  await api('/admin/delivery-waves/'+wave.id+'/status', 'PATCH', { status: 'picking' });
  for (const item of wave.pickingList) await api(`/admin/delivery-waves/${wave.id}/items/${item.id}`, 'PATCH', {
    purchasedQuantity: new D(item.requestedQuantityTotal).plus(1).toString(), purchaseUnitPrice: item.referencePurchasePrice });
  let goods = new D(0);
  for (const [index,item] of order.items.entries()) {
    const finalQuantity = new D(item.requestedQuantity).plus(index ? '0.1' : '-0.1');
    goods = goods.plus(finalQuantity.mul(item.saleUnitPriceSnapshot).toDecimalPlaces(2, D.ROUND_HALF_UP));
    await api(`/admin/orders/${order.id}/items/${item.id}`, 'PATCH', { status: 'picked', finalQuantity: finalQuantity.toString() });
  }
  const packed = await api('/admin/orders/'+order.id);
  if (packed.items.some(item => item.finalQuantity === null) || new D(packed.totalFinal).minus(packed.deliveryFee).minus(packed.serviceFee).toFixed(2) !== goods.toFixed(2)) throw Error('Actual weight pricing differs');
  await api('/admin/settings', 'GET', null, 403);
  await api('/admin/delivery-waves/'+wave.id+'/status', 'PATCH', { status: 'picked' });
  stage = 'courier and payment';
  await login(credentials.courier);
  wave = await api('/admin/delivery-waves/'+wave.id);
  if ('pickingList' in wave) throw Error('Courier sees procurement secrets');
  await api('/admin/delivery-waves/'+wave.id+'/status', 'PATCH', { status: 'out_for_delivery' });
  await api('/admin/orders/'+order.id+'/status', 'PATCH', { status: 'delivered' });
  await api('/admin/orders/'+order.id+'/paid', 'POST', {}, 201);
  const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  if (saved.status !== 'delivered' || saved.paymentStatus !== 'paid') throw Error('Delivery/payment not persisted');
  stage = 'SMS remains disabled';
  const status = await api('/customer-auth/status');
  const mobile = await api('/mobile/auth/status');
  if (status.enabled || status.requiredForCheckout || mobile.enabled) throw Error('Unexpected customer SMS activation');
  const result = { criticalMigrationSmokePassed: true, isolatedRestoredDatabase: true, publicProducts: products.length,
    allProductRoutesAndUploadedImages: true, freshImportedAdminLogin: true, secureCookieAndRefresh: true,
    guestCheckoutAndIdempotency: true, separateProductsAndProcurement: true, separateActualWeightsAndTotals: true,
    pickerRbac: true, courierDeliveryAndPayment: true, customerSmsEnabled: false, realProductionOrdersCreated: 0 };
  fs.writeFileSync('/smoke/receipt.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result));
}
(process.argv[2] === 'bootstrap' ? bootstrap() : process.argv[2] === 'run' ? smoke() : Promise.reject(Error('Explicit action required')))
  .catch(() => { console.error(JSON.stringify({ criticalSmokeFailed: true, stage, detailsWithheld: true })); process.exitCode = 1; })
  .finally(() => db.$disconnect());
