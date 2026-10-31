// Operator-only probe: reuse real OTP generation/limits; never expose code or credentials.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
let observation = { providerCalls: 0 };

async function boundedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      size += next.value.byteLength;
      if (size > 65536) return null;
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return null; }
  finally { void reader.cancel().catch(() => {}); }
}

function summarize(body, otp) {
  const object = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  return {
    deliveryStatus: ['SERVICE_ACCEPTED','SENT','ENROUTE','ACCEPTED','DELIVERED'].includes(object.deliveryStatus) ? object.deliveryStatus : 'not_accepted',
    providerTextContainsExpectedOtp: typeof object.text === 'string' ? object.text.includes(otp) : null,
    providerTextHasUnexpandedCode: typeof object.text === 'string' ? /\{[^}]*code[^}]*\}/i.test(object.text) : null,
    providerSenderMatches: object.configuration?.senderName === undefined ? null : object.configuration.senderName === 'DFRESH',
    validationFields: Array.isArray(object.violations) ? object.violations.map(v => v?.propertyPath)
      .filter(v => typeof v === 'string' && /^(templateMessage|telephone|senderName|type|text)(?:[.\[\]A-Za-z0-9_-]{0,100})$/.test(v)) : []
  };
}

async function main() {
  process.umask(0o077);
  const request = JSON.parse(fs.readFileSync('/probe/request.json'));
  if (!['code-1', 'code'].includes(request.variable) || !/^[0-9a-f-]{36}$/.test(request.pilotId)) throw Error('Invalid bounded probe');
  const phone = fs.readFileSync('/probe/recipient', 'utf8').trim();
  if (!/^\+992\d{9}$/.test(phone)) throw Error('Invalid approved recipient');
  const info = fs.lstatSync('/run/secrets/app.env');
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o777) !== 0o640) throw Error('Private ENV required');
  Object.assign(process.env, parseEnv(fs.readFileSync('/run/secrets/app.env', 'utf8')));
  Object.assign(process.env, { NODE_ENV: 'production', CUSTOMER_AUTH_ENABLED: 'true', CUSTOMER_REQUIRE_PHONE: 'false',
    CUSTOMER_SMS_CODE_VARIABLE: request.variable, CUSTOMER_SMS_PILOT_PHONE: phone, CUSTOMER_SMS_PILOT_ID: request.pilotId });
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '15440' || url.pathname !== '/df_production' || url.username !== 'df_api') throw Error('Wrong database');
  url.searchParams.set('connection_limit', '1');
  process.env.DATABASE_URL = url.href;
  const { payomReadiness } = require('/app/dist/customer-account/payom-configuration.js');
  if (!payomReadiness().configurationReady) throw Error('Probe configuration incomplete');
  const originalFetch = global.fetch;
  global.fetch = async (target, init) => {
    if (String(target) !== 'https://gateway.payom.tj/api/message' || init?.method !== 'POST' || observation.providerCalls !== 0) throw Error('Unexpected provider request');
    const body = JSON.parse(init.body);
    const variables = body.templateMessage?.variables;
    const otp = variables?.[request.variable];
    if (body.telephone !== phone || body.senderName !== 'DFRESH' || body.type !== 'SMS' || body.text !== undefined ||
        Object.keys(variables || {}).length !== 1 || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw Error('Unsafe probe payload');
    observation.providerCalls = 1;
    const response = await originalFetch(target, init);
    observation.httpStatus = response.status;
    observation = { ...observation, ...summarize(await boundedBody(response.clone()), otp) };
    return response;
  };
  const { PrismaService } = require('/app/dist/prisma/prisma.service.js');
  const { CustomerAuthService, CustomerSmsGateway } = require('/app/dist/customer-account/customer-auth.service.js');
  const db = new PrismaService();
  try {
    const service = new CustomerAuthService(db, new CustomerSmsGateway());
    const result = await service.requestCode(phone, '127.0.0.1');
    fs.writeFileSync('/probe/challenge-' + request.pilotId + '.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
    observation.otpChallengeReady = true;
    observation.expiresIn = result.expiresIn;
  } finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(error => {
  observation.otpChallengeReady = false;
  observation.failure = ['configuration','invalid_input','bad_request','authentication','validation','invalid_response','unavailable'].includes(error.kind)
    ? error.kind : 'local_or_otp_limit';
  process.exitCode = 1;
}).finally(() => {
  const result = { ...observation, checkedAtUTC: new Date().toISOString(), autoRetried: false, productionFlagsChanged: false };
  try {
    const request = JSON.parse(fs.readFileSync('/probe/request.json'));
    fs.writeFileSync('/probe/result-' + request.pilotId + '.json', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
  } catch { process.exitCode = 1; }
  console.log(JSON.stringify(result));
});
module.exports = { summarize, boundedBody };
