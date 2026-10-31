// Existing API, same database, one approved recipient and one persisted send slot.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { summarize, boundedBody } = require('./payom-template-probe.cjs');
function main() {
  const plan = JSON.parse(fs.readFileSync('/probe/ui-request.json'));
  const phone = fs.readFileSync('/probe/recipient', 'utf8').trim();
  const env = parseEnv(fs.readFileSync('/run/secrets/app.env', 'utf8'));
  if (env.CUSTOMER_SMS_CODE_VARIABLE !== 'code-1' || env.CUSTOMER_REQUIRE_PHONE !== 'false' ||
      env.CUSTOMER_AUTH_ENABLED !== 'false' || !/^\+992\d{9}$/.test(phone) ||
      !/^[0-9a-f-]{36}$/.test(plan.pilotId) || plan.purpose !== 'web-ui') throw Error('Private pilot prerequisites incomplete');
  Object.assign(process.env, env, { NODE_ENV: 'production', API_HOST: '127.0.0.1', API_PORT: '4012',
    CUSTOMER_AUTH_ENABLED: 'true', MOBILE_CUSTOMER_API_ENABLED: 'true', CUSTOMER_REQUIRE_PHONE: 'false',
    CUSTOMER_SMS_PILOT_PHONE: phone, CUSTOMER_SMS_PILOT_ID: plan.pilotId });
  const database = new URL(process.env.DATABASE_URL);
  if (database.hostname !== '127.0.0.1' || database.port !== '15440' || database.pathname !== '/df_production' || database.username !== 'df_api') throw Error('Wrong pilot database');
  database.searchParams.set('connection_limit', '2');
  process.env.DATABASE_URL = database.href;
  if (!require('/app/dist/customer-account/payom-configuration.js').payomReadiness().configurationReady) throw Error('Pilot configuration not ready');
  const originalFetch = global.fetch;
  global.fetch = async (target, init) => {
    if (String(target) !== 'https://gateway.payom.tj/api/message') return originalFetch(target, init);
    const body = JSON.parse(init?.body || '{}');
    const otp = body.templateMessage?.variables?.['code-1'];
    if (init?.method !== 'POST' || body.telephone !== phone || body.senderName !== 'DFRESH' || body.text !== undefined ||
        typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw Error('Unapproved pilot request');
    const file = '/probe/ui-provider-' + plan.pilotId + '.json';
    const save = result => fs.writeFileSync(file, JSON.stringify(result), { mode: 0o600 });
    fs.writeFileSync(file, JSON.stringify({ reservedAtUTC: new Date().toISOString(), outcomeUnknown: true }), { flag: 'wx', mode: 0o600 });
    try {
      const response = await originalFetch(target, init);
      save({ httpStatus: response.status, ...summarize(await boundedBody(response.clone()), otp),
        checkedAtUTC: new Date().toISOString(), providerCalls: 1, autoRetried: false });
      return response;
    } catch (error) {
      save({ outcomeUnknown: true, providerCalls: 1, autoRetried: false });
      throw error;
    }
  };
  require('/app/dist/main.js');
}
try { main(); }
catch { console.error('One-recipient Payom pilot could not start; private details withheld'); process.exitCode = 1; }
