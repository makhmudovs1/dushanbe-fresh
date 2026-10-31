const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Prisma, PrismaClient } = require(require.resolve('@prisma/client', { paths: ['/app', path.resolve('apps/api')] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: ['/app', path.resolve('apps/api')] }));
const order = ['User', 'Category', 'Product', 'ProductQualityOption', 'ProductImage', 'ProductPriceHistory', 'DeliverySlot', 'OperationalAudit', 'AppSetting'];
const settingKeys = new Set(['minimum_order_amount', 'delivery_fee', 'service_fee', 'service_fee_percent', 'customer_refusal_keep_fees',
  'purchase_price_deviation_percent', 'default_picker_id', 'default_courier_id', 'delivery_zone']);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let phase = 'initialization';
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function date(value) {
  if (typeof value !== 'string' || value.length > 40) throw Error('Invalid timestamp');
  const result = new Date(/^\d{2}:\d{2}:\d{2}/.test(value) ? '1970-01-01T' + value + 'Z' : /^\d{4}-\d\d-\d\d$/.test(value) ? value + 'T00:00:00Z' : value.replace(' ', 'T') + (/[Z]|[+-]\d\d(?::?\d\d)?$/.test(value) ? '' : 'Z'));
  if (!Number.isFinite(result.getTime())) throw Error('Invalid timestamp');
  return result;
}
function normalized(model, rows) {
  return rows.map(row => Object.fromEntries(model.fields.map(f => {
    let value = row[f.name];
    if (value !== null && f.type === 'Decimal') value = new Prisma.Decimal(value).toString();
    if (value !== null && f.type === 'DateTime') value = date(value).toISOString();
    if (f.type === 'Json') value = value === null ? { '$databaseNull': true } : JSON.parse(value);
    return [f.name, value];
  })));
}
function fingerprints(plan, tables) {
  return Object.fromEntries(plan.models.map(m => [m.name, sha(JSON.stringify(stable(normalized(m, tables[m.name]))))]));
}
function validate(bundle, plan, assets) {
  if (bundle.format !== plan.format || bundle.planDigest !== plan.digest || bundle.source !== '91.207.75.174') throw Error('Wrong source or schema');
  if (JSON.stringify(Object.keys(bundle.tables).sort()) !== JSON.stringify(plan.models.map(m => m.name).sort())) throw Error('Wrong model set');
  const enums = Object.fromEntries(plan.enums.map(e => [e.name, new Set(e.values.map(v => v.name))]));
  const files = new Set();
  let bytes = 0;
  for (const file of bundle.files) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(file.name) || files.has(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 5 * 1024**2) throw Error('Invalid image manifest');
    const body = Buffer.from(file.base64, 'base64');
    bytes += body.length;
    if (body.length !== file.bytes || sha(body) !== file.sha256 || bytes > 100 * 1024**2 || files.size >= 1000) throw Error('Image transport integrity failure');
    files.add(file.name);
  }
  function image(value) {
    if (value === null) return;
    if (typeof value !== 'string' || value.length > 1000) throw Error('Invalid image path');
    const url = value.replace(/^https:\/\/dushanbefresh\.tj(?=\/)/, '');
    const media = /^\/api\/v1\/media\/([a-f0-9-]{36}\.webp)$/.exec(url);
    if (media ? !files.has(media[1]) : !(assets.has(url) || /^\/img\/products\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|svg)$/.test(url) || url === '/images/product-placeholder.svg')) throw Error('Unreviewed or missing image reference');
  }
  for (const model of plan.models) {
    const rows = bundle.tables[model.name];
    if (!Array.isArray(rows) || rows.length > 20000 || (!model.allowNonempty && rows.length)) throw Error('Business data outside reviewed empty-order scope');
    const names = model.fields.map(f => f.name).sort();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(names)) throw Error('Unreviewed field or credentials');
      for (const field of model.fields) {
        const value = row[field.name];
        if (value === null) { if (field.required) throw Error('Missing required value'); continue; }
        const values = field.list ? value : [value];
        if (!Array.isArray(values)) throw Error('Invalid array');
        for (const item of values) {
          if (field.kind === 'enum') { if (!enums[field.type]?.has(item)) throw Error('Invalid enum'); }
          else if (field.type === 'String' && (typeof item !== 'string' || item.length > 100000 || item.includes('\0'))) throw Error('Invalid text');
          else if (field.type === 'Boolean' && typeof item !== 'boolean') throw Error('Invalid boolean');
          else if (field.type === 'Int' && (!Number.isSafeInteger(item) || Math.abs(item) > 2147483647)) throw Error('Invalid integer');
          else if (field.type === 'Float' && !Number.isFinite(item)) throw Error('Invalid float');
          else if (field.type === 'Decimal' && (typeof item !== 'string' || !/^-?\d{1,12}(?:\.\d{1,3})?$/.test(item))) throw Error('Invalid exact decimal');
          else if (field.type === 'DateTime') date(item);
          else if (field.type === 'Json') { if (typeof item !== 'string' || item.length > 1000000) throw Error('Invalid JSON'); JSON.parse(item); }
        }
      }
      if (['Product', 'Category'].includes(model.name)) for (const field of ['imageUrl', 'iconUrl']) if (field in row) image(row[field]);
      if (model.name === 'ProductImage') image(row.url);
      if (model.name === 'Product') {
        for (const field of ['currentPurchasePrice', 'currentSalePrice', 'minQuantity', 'quantityStep']) {
          if (new Prisma.Decimal(row[field]).lt(0) || (['minQuantity', 'quantityStep'].includes(field) && new Prisma.Decimal(row[field]).eq(0))) throw Error('Invalid product quantities/prices');
        }
      }
      if (model.name === 'AppSetting' && !settingKeys.has(row.key)) throw Error('Unknown setting requires explicit review');
    }
  }
  if (!bundle.tables.User.some(u => u.status === 'active' && (u.role === 'admin' || u.roles.includes('admin')))) throw Error('No existing active administrator');
  return fingerprints(plan, bundle.tables);
}
async function prepare() {
  phase = 'offline-validation';
  if (process.env.DATABASE_URL) throw Error('Offline decoder must not receive database credentials');
  const raw = fs.readFileSync('/input/source-neutral-v1.json');
  const bundle = JSON.parse(raw);
  const plan = JSON.parse(fs.readFileSync('/input/plan.json'));
  const receipt = JSON.parse(fs.readFileSync('/input/receipt.json'));
  if (sha(raw) !== receipt.sha256) throw Error('Quarantine artifact changed');
  const assets = new Set(JSON.parse(fs.readFileSync('/ops/trusted-public-assets.json')));
  const hashes = validate(bundle, plan, assets);
  const sharp = require(require.resolve('sharp', { paths: ['/app'] }));
  const imageReceipt = [];
  for (const file of bundle.files) {
    phase = 'offline-image-decoding';
    const input = sharp(Buffer.from(file.base64, 'base64'), { limitInputPixels: 25000000 });
    const metadata = await input.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw Error('Invalid raster image');
    const body = await input.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ lossless: true }).toBuffer();
    fs.writeFileSync(path.join('/clean-images', file.name), body, { flag: 'wx', mode: 0o600 });
    imageReceipt.push({ name: file.name, sourceSha256: file.sha256, cleanSha256: sha(body) });
  }
  const passwords = [];
  phase = 'fresh-staff-credentials';
  for (const user of bundle.tables.User) {
    const password = crypto.randomBytes(32).toString('base64url');
    passwords.push({ id: user.id, email: user.email, password, hash: await bcrypt.hash(password, 12) });
  }
  fs.writeFileSync('/prepared/staff-access.json', JSON.stringify(passwords), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync('/prepared/rows.json', JSON.stringify({ format: bundle.format, planDigest: plan.digest, tables: bundle.tables, hashes, images: imageReceipt }), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, imageFilesDecoded: imageReceipt.length, originalCredentialsImported: false, databaseContacted: false }));
}
function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value)) throw Error('Invalid identifier');
  return '"' + value + '"';
}
async function importData() {
  phase = 'target-guard';
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '15440' || url.pathname !== '/df_production') throw Error('Wrong destination');
  const prepared = JSON.parse(fs.readFileSync('/prepared/rows.json'));
  const passwords = JSON.parse(fs.readFileSync('/prepared/staff-access.json'));
  const plan = JSON.parse(fs.readFileSync('/input/plan.json'));
  if (prepared.planDigest !== plan.digest || prepared.format !== plan.format) throw Error('Wrong prepared schema');
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      phase = 'verify-fresh-bootstrap-defaults';
      for (const model of plan.models.filter(m => !['AppSetting','DeliverySlot'].includes(m.name))) {
        if (await tx[model.name[0].toLowerCase() + model.name.slice(1)].count()) throw Error('Destination has business data; never overwrite it');
      }
      const initialSettings = await tx.appSetting.findMany();
      if (initialSettings.some(s => s.key !== 'purchase_price_deviation_percent' || s.value !== '15.00') || initialSettings.length > 1) throw Error('Unreviewed target settings');
      const { scheduledDeliverySlots } = require('/app/dist/delivery-slots/delivery-schedule.js');
      const expectedSlots = scheduledDeliverySlots(new Date());
      const initialSlots = await tx.deliverySlot.findMany();
      if (initialSlots.some(slot => {
        const expected = expectedSlots.find(s => s.id === slot.id);
        return !expected || ['date','startsAt','endsAt'].some(key => slot[key].toISOString() !== expected[key].toISOString()) ||
          slot.capacityOrders !== expected.capacityOrders || !slot.isActive;
      })) throw Error('Unreviewed target delivery slots');
      // Remove only our verified schema/startup defaults, never source or customer data.
      if (initialSlots.length) await tx.deliverySlot.deleteMany({ where: { id: { in: initialSlots.map(s => s.id) } } });
      if (initialSettings.length) await tx.appSetting.deleteMany({ where: { key: 'purchase_price_deviation_percent' } });
      for (const name of order) {
        phase = 'import-' + name;
        const model = plan.models.find(m => m.name === name);
        const rows = prepared.tables[name].map(row => Object.fromEntries(model.fields.map(field => {
          let value = row[field.name];
          if (field.type === 'DateTime' && value !== null) value = date(value);
          if (field.type === 'Json') value = value === null ? Prisma.DbNull : JSON.parse(value) === null ? Prisma.JsonNull : JSON.parse(value);
          return [field.name, value];
        })));
        if (name === 'User') for (const row of rows) {
          const credential = passwords.find(p => p.id === row.id);
          if (!credential || !/^\$2[ab]\$12\$/.test(credential.hash)) throw Error('Fresh password missing');
          row.passwordHash = credential.hash;
        }
        if (rows.length) await tx[name[0].toLowerCase() + name.slice(1)].createMany({ data: rows });
      }
      for (const model of plan.models) {
        phase = 'reconcile-' + model.name;
        const fields = model.fields.map(f => identifier(f.column) + (['Decimal', 'DateTime', 'Json'].includes(f.type) ? '::text' : '') + ' AS ' + identifier(f.name)).join(',');
        const primary = model.primary.map(name => identifier(model.fields.find(f => f.name === name).column)).join(',');
        if (!primary) throw Error('Explicit primary key required');
        const rows = await tx.$queryRawUnsafe('SELECT ' + fields + ' FROM public.' + identifier(model.table) + ' ORDER BY ' + primary);
        const actual = sha(JSON.stringify(stable(normalized(model, rows))));
        if (rows.length !== prepared.tables[model.name].length || actual !== prepared.hashes[model.name]) throw Error('Destination reconciliation mismatch');
      }
    }, { timeout: 30000, maxWait: 5000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const result = { productionImported: true, allBusinessTablesReconciled: true, sourceOrders: prepared.tables.Order.length,
      products: prepared.tables.Product.length, categories: prepared.tables.Category.length, imageRows: prepared.tables.ProductImage.length,
      decodedFiles: prepared.images.length, oldCredentialsOrSessionsImported: false, oldSourceWriteFreeze: false, dnsChanged: false };
    fs.writeFileSync('/prepared/import-receipt.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
module.exports = { date, validate, fingerprints };
if (require.main === module) {
  process.umask(0o077);
  const mode = process.argv[2];
  (mode === 'prepare' ? prepare() : mode === 'import' ? importData() : Promise.reject(Error('Unknown mode')))
    .catch(error => { console.error(JSON.stringify({ migrationStopped: true, phase,
      errorCode: /^P\d{4}$/.test(error.code || '') ? error.code : null, sourceRowsAndSecretsWithheld: true })); process.exitCode=1; });
}
