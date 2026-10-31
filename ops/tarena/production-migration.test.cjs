const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Prisma } = require(require.resolve('@prisma/client', { paths: [process.cwd() + '/apps/api'] }));
const { makePlan } = require('./make-data-plan.cjs');
const { date, validate } = require('./migrate-production-data.cjs');

test('neutral schema excludes active credentials and remains tied to current Prisma models', () => {
  const plan = makePlan(Prisma.dmmf.datamodel);
  assert.equal(plan.digest, JSON.parse(fs.readFileSync('ops/tarena/production-data-plan.json')).digest);
  assert.ok(!plan.models.find(m => m.name === 'User').fields.some(f => f.name === 'passwordHash'));
  assert.ok(!plan.models.some(m => /Session|OtpChallenge|AuthLimit|MobileRefresh|MobileApiLimit/.test(m.name)));
  assert.equal(plan.models.find(m => m.name === 'Order').allowNonempty, false);
  assert.ok(plan.models.every(m => m.primary.length > 0));
  assert.deepEqual(plan.models.find(m => m.name === 'CustomerFavorite').primary, ['userId', 'productId']);
});
test('native date/time and exact historical timestamps have stable UTC representation', () => {
  assert.equal(date('10:00:00').toISOString(), '1970-01-01T10:00:00.000Z');
  assert.equal(date('2026-10-31').toISOString(), '2026-10-31T00:00:00.000Z');
  assert.equal(date('2026-10-31 10:20:30.123').toISOString(), '2026-10-31T10:20:30.123Z');
  assert.throws(() => date('not-a-date'));
});
function fixture() {
  const plan = { format: 'fixture', digest: 'fixed', enums: [], models: [{ name: 'User', allowNonempty: true,
    fields: ['id','email','status','role'].map(name => ({ name, type: 'String', kind: 'scalar', list: false, required: true })).concat({ name: 'roles', type: 'String', kind: 'scalar', list: true, required: true }) }] };
  const bundle = { format: 'fixture', planDigest: 'fixed', source: '91.207.75.174', files: [], tables: { User: [{id: 'test',email: 'test@fixture.invalid',status:'active',role:'admin',roles:['admin']}] } };
  return { plan, bundle };
}
test('unknown password fields, models and unreviewed customer rows are rejected', () => {
  const {plan,bundle}=fixture();
  assert.ok(validate(bundle, plan, new Set()).User);
  bundle.tables.User[0].passwordHash='old-credential';
  assert.throws(() => validate(bundle, plan, new Set()), /field or credentials/);
  delete bundle.tables.User[0].passwordHash;
  bundle.tables.CustomerSession=[];
  assert.throws(() => validate(bundle, plan, new Set()), /model set/);
  delete bundle.tables.CustomerSession;
  plan.models[0].allowNonempty=false;
  assert.throws(() => validate(bundle, plan, new Set()), /reviewed empty-order scope/);
});
test('image manifest rejects traversal, duplicate files and content corruption', () => {
  const {plan,bundle}=fixture();
  bundle.files=[{name:'../../app.env',bytes:1,base64:'YQ==',sha256:'wrong'}];
  assert.throws(() => validate(bundle, plan, new Set()), /image manifest/);
  bundle.files=[{name:'00000000-0000-0000-0000-000000000000.webp',bytes:1,base64:'YQ==',sha256:'wrong'}];
  assert.throws(() => validate(bundle, plan, new Set()), /integrity failure/);
});
