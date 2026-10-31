const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifiedSlots } = require('./final-data-compare.cjs');
const model = { name: 'DeliverySlot', fields: [
  { name: 'id', type: 'String' }, { name: 'date', type: 'DateTime' },
  { name: 'startsAt', type: 'DateTime' }, { name: 'endsAt', type: 'DateTime' },
  { name: 'capacityOrders', type: 'Int' }, { name: 'isActive', type: 'Boolean' }
] };
function fixture() {
  const source = [{ id: 'old', date: '2026-10-31', startsAt: '10:00:00', endsAt: '12:00:00', capacityOrders: 10, isActive: false }];
  const extra = { ...source[0], id: 'seed-2026-11-05-10', date: '2026-11-05', isActive: true };
  const canonical = [{ ...extra, date: new Date('2026-11-05T00:00:00Z'),
    startsAt: new Date('1970-01-01T10:00:00Z'), endsAt: new Date('1970-01-01T12:00:00Z') }];
  return { source, extra, canonical };
}
test('allows only trusted generated extra slots while preserving every original row', () => {
  const { source, extra, canonical } = fixture();
  const result = verifiedSlots(model, source, [...source, extra], canonical);
  assert.deepEqual(result.preserved, source);
  assert.equal(result.additional.length, 1);
});
test('never masks a missing, edited or duplicated source slot', () => {
  const { source, extra, canonical } = fixture();
  for (const target of [[extra], [{ ...source[0], capacityOrders: 99 }, extra], [...source, ...source]]) {
    assert.throws(() => verifiedSlots(model, source, target, canonical));
  }
});
test('rejects noncanonical availability, capacity or dates on additional slots', () => {
  const { source, extra, canonical } = fixture();
  for (const changed of [{ ...extra, isActive: false }, { ...extra, capacityOrders: 99 },
    { ...extra, startsAt: '11:00:00' }, { ...extra, id: 'unknown' }]) {
    assert.throws(() => verifiedSlots(model, source, [...source, changed], canonical));
  }
});
