const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pilotApiPort } = require('./payom-ui-pilot.cjs');

test('candidate port preserves the default and permits only the reviewed neighboring loopback port', () => {
  assert.equal(pilotApiPort(), '4012');
  assert.equal(pilotApiPort('4012'), '4012');
  assert.equal(pilotApiPort('4013'), '4013');
  for (const value of ['', '0', '4000', '0.0.0.0:4013', ' 4013', 4013]) assert.throws(() => pilotApiPort(value));
});
