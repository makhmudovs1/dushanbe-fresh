const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: ['/app', path.resolve('apps/api')] }));
const { validate, fingerprints, date } = require('./migrate-production-data.cjs');
const sha = body => crypto.createHash('sha256').update(body).digest('hex');
let phase = 'read-inputs';
const quote = name => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) throw Error('Unexpected identifier');
  return '"' + name + '"';
};
function verifiedSlots(model, source, target, canonical) {
  const ids = new Set(source.map(row => row.id));
  const preserved = target.filter(row => ids.has(row.id));
  if (new Set(target.map(row => row.id)).size !== target.length || preserved.length !== source.length ||
      fingerprints({ models: [model] }, { DeliverySlot: preserved }).DeliverySlot !==
      fingerprints({ models: [model] }, { DeliverySlot: source }).DeliverySlot) throw Error('Original slots changed or missing');
  const additional = target.filter(row => !ids.has(row.id));
  for (const row of additional) {
    const expected = canonical.find(slot => slot.id === row.id);
    if (!expected || row.isActive !== true || row.capacityOrders !== expected.capacityOrders ||
        ['date','startsAt','endsAt'].some(field => date(row[field]).toISOString() !== expected[field].toISOString())) throw Error('Unreviewed extra delivery slot');
  }
  return { preserved, additional };
}
async function main() {
  process.umask(0o077);
  const raw = fs.readFileSync('/input/source-neutral-v1.json');
  const bundle = JSON.parse(raw);
  const receipt = JSON.parse(fs.readFileSync('/input/receipt.json'));
  const freeze = JSON.parse(fs.readFileSync('/input/freeze.json'));
  const prepared = JSON.parse(fs.readFileSync('/initial/rows.json'));
  const plan = JSON.parse(fs.readFileSync('/input/plan.json'));
  if (sha(raw) !== receipt.sha256 || freeze.oldWebAndApiStopped !== true || freeze.databaseDefaultReadOnly !== true ||
      freeze.source !== '91.207.75.174' || Date.parse(freeze.frozenAtUTC) > Date.parse(bundle.exportedAtUTC)) throw Error('Final frozen snapshot required');
  phase = 'validate-source';
  const expected = validate(bundle, plan, new Set(JSON.parse(fs.readFileSync('/ops/trusted-public-assets.json'))));
  const changes = plan.models.filter(m => expected[m.name] !== prepared.hashes[m.name]).map(m => m.name);
  if (changes.length) {
    console.log(JSON.stringify({ finalDataReconciled: false, changedModels: changes, requiresReviewedIncrementalImport: true }));
    process.exitCode = 2;
    return;
  }
  if (bundle.files.length !== prepared.images.length) throw Error('Final photo count differs');
  phase = 'verify-photos';
  for (const image of prepared.images) {
    const source = bundle.files.find(file => file.name === image.name);
    const target = '/images/' + image.name;
    if (!source || source.sha256 !== image.sourceSha256 || fs.lstatSync(target).isSymbolicLink() ||
        sha(fs.readFileSync(target)) !== image.cleanSha256) throw Error('Final photo checksum differs');
  }
  phase = 'target-credentials';
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '15440' || url.pathname !== '/df_production' || url.username !== 'df_backup') throw Error('Readonly target required');
  const db = new PrismaClient();
  let additionalSlots = 0;
  try {
    phase = 'target-snapshot';
    const actual = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      const tables = {};
      for (const model of plan.models) {
        phase = 'target-' + model.name;
        const fields = model.fields.map(f => quote(f.column) + (['Decimal','DateTime','Json'].includes(f.type) ? '::text' : '') + ' AS ' + quote(f.name)).join(',');
        const primary = model.primary.map(name => quote(model.fields.find(f => f.name === name).column)).join(',');
        if (!primary) throw Error('Primary key required');
        tables[model.name] = await tx.$queryRawUnsafe('SELECT ' + fields + ' FROM public.' + quote(model.table) + ' ORDER BY ' + primary);
        if (model.name === 'DeliverySlot') {
          const { scheduledDeliverySlots } = require('/app/dist/delivery-slots/delivery-schedule.js');
          const slots = verifiedSlots(model, bundle.tables.DeliverySlot, tables.DeliverySlot, scheduledDeliverySlots(new Date(bundle.exportedAtUTC)));
          const extraIds = slots.additional.map(slot => slot.id);
          if (extraIds.length && (await tx.order.count({ where: { deliverySlotId: { in: extraIds } } }) ||
              await tx.deliveryWave.count({ where: { deliverySlotId: { in: extraIds } } }))) throw Error('Additional slots contain business activity');
          additionalSlots = extraIds.length;
          tables.DeliverySlot = slots.preserved;
        }
      }
      return fingerprints(plan, tables);
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    phase = 'target-fingerprints';
    const mismatched = plan.models.filter(m => actual[m.name] !== expected[m.name]).map(m => m.name);
    if (mismatched.length) {
      console.log(JSON.stringify({ finalDataReconciled: false, changedModels: mismatched, requiresReviewedIncrementalImport: false }));
      throw Error('Target business row mismatch');
    }
    const result = { finalDataReconciled: true, sourceFrozenAtUTC: freeze.frozenAtUTC, sourceExportedAtUTC: bundle.exportedAtUTC,
      checkedAtUTC: new Date().toISOString(), sourceSha256: receipt.sha256, modelsReconciled: plan.models.length,
      products: bundle.tables.Product.length, customers: bundle.tables.Customer.length, addresses: bundle.tables.CustomerAddress.length,
      orders: bundle.tables.Order.length, photosVerified: prepared.images.length, sourceChangedSinceInitialImport: false,
      originalDeliverySlotsPreserved: bundle.tables.DeliverySlot.length, additionalCanonicalEmptySlots: additionalSlots,
      freshStaffCredentialsPreserved: true, oldSecretsImported: false, targetDatabaseReadOnlyDuringCheck: true, dnsChanged: false };
    fs.writeFileSync('/result/final-data.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
module.exports = { verifiedSlots };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ finalDataReconciled: false, phase,
    errorCode: /^P\d{4}$/.test(error.code || '') ? error.code : null, privateDetailsWithheld: true })); process.exitCode = 1;
});
