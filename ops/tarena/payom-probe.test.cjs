const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('./payom-template-probe.cjs');

test('receipt analysis exposes booleans, not SMS code, recipient or provider text', () => {
  const result = summarize({ text: 'Test code 914273', telephone: '+992000000000', deliveryStatus: 'SERVICE_ACCEPTED',
    configuration: { senderName: 'DFRESH' } }, '914273');
  assert.equal(result.providerTextContainsExpectedOtp, true);
  assert.equal(result.providerTextHasUnexpandedCode, false);
  assert.equal(result.providerSenderMatches, true);
  for (const secret of ['914273', '+992000000000', 'Test code']) assert.ok(!JSON.stringify(result).includes(secret));
});
test('an accepted response does not hide an unexpanded placeholder or prove handset delivery', () => {
  const result = summarize({ text: 'Code {code-1}', deliveryStatus: 'SERVICE_ACCEPTED' }, '914273');
  assert.equal(result.providerTextContainsExpectedOtp, false);
  assert.equal(result.providerTextHasUnexpandedCode, true);
  assert.equal(result.providerSenderMatches, null);
});
test('validation analysis drops messages, values and unrelated property paths', () => {
  const result = summarize({ detail: 'secret', violations: [
    { propertyPath: 'templateMessage.variables.code-1', message: 'private detail' },
    { propertyPath: 'token', message: 'private detail' }, { propertyPath: 'telephone: +992000000000' }
  ] }, '914273');
  assert.deepEqual(result.validationFields, ['templateMessage.variables.code-1']);
  assert.ok(!JSON.stringify(result).includes('private'));
});
