const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const excluded = new Set(['RefreshSession', 'CustomerSession', 'CustomerOtpChallenge', 'CustomerAuthLimit', 'MobileCustomerSession', 'MobileRefreshToken', 'MobileApiLimit']);
const nonempty = new Set(['User', 'Category', 'Product', 'ProductImage', 'ProductPriceHistory', 'ProductQualityOption', 'DeliverySlot', 'OperationalAudit', 'AppSetting']);

function makePlan(dmmf) {
  const models = dmmf.models.filter(m => !excluded.has(m.name)).map(m => ({
    name: m.name, table: m.dbName || m.name, allowNonempty: nonempty.has(m.name),
    primary: m.primaryKey?.fields || m.fields.filter(f => f.isId).map(f => f.name),
    fields: m.fields.filter(f => f.kind !== 'object' && !(m.name === 'User' && f.name === 'passwordHash')).map(f => ({
      name: f.name, column: f.dbName || f.name, type: f.type, kind: f.kind, list: f.isList, required: f.isRequired, id: f.isId
    }))
  }));
  const plan = { format: 'df-neutral-catalog-v1', source: '91.207.75.174', destination: '77.95.0.94',
    excludedModels: [...excluded], models, enums: dmmf.enums };
  return { ...plan, digest: crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
module.exports = { makePlan };
if (require.main === module) {
  const { Prisma } = require(require.resolve('@prisma/client', { paths: [path.resolve('apps/api')] }));
  const plan = makePlan(Prisma.dmmf.datamodel);
  fs.writeFileSync('ops/tarena/production-data-plan.json', JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ schemaOnly: true, models: plan.models.length, digest: plan.digest }));
}
