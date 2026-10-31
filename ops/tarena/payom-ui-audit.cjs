const fs = require('node:fs');
const { parseEnv } = require('node:util');
async function main() {
  const env = parseEnv(fs.readFileSync('/run/secrets/app.env', 'utf8'));
  const url = new URL(env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '15440' || url.pathname !== '/df_production' || url.username !== 'df_api') throw Error('Wrong audit target');
  url.searchParams.set('connection_limit', '1');
  process.env.DATABASE_URL = url.href;
  const phone = fs.readFileSync('/probe/recipient', 'utf8').trim();
  const ledger = JSON.parse(fs.readFileSync('/probe/grant.json'));
  const plan = JSON.parse(fs.readFileSync('/probe/ui-request.json'));
  const file = '/probe/ui-provider-' + plan.pilotId + '.json';
  const provider = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
  const { PrismaService } = require('/app/dist/prisma/prisma.service.js');
  const db = new PrismaService();
  try {
    const user = await db.user.findUnique({ where: { phone }, select: { id: true, role: true, roles: true, phoneVerifiedAt: true } });
    const eligible = !user || (user.role === 'customer' && user.roles.length === 0);
    const now = new Date();
    const cart = user ? await db.customerCart.findUnique({ where: { userId: user.id }, select: { items: true } }) : null;
    const result = { checkedAtUTC: now.toISOString(), approvedPhoneEligibleForCustomerLogin: eligible,
      customerProfileCreated: !!user && eligible && !!user.phoneVerifiedAt,
      linkedCustomer: !!user && !!await db.customer.findFirst({ where: { userId: user.id } }),
      activeBrowserSessions: user ? await db.customerSession.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } } }) : 0,
      activeNativeSessions: user ? await db.mobileCustomerSession.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } } }) : 0,
      cartItems: Array.isArray(cart?.items) ? cart.items.length : 0,
      savedAddresses: user ? await db.customerAddress.count({ where: { userId: user.id } }) : 0,
      favorites: user ? await db.customerFavorite.count({ where: { userId: user.id } }) : 0,
      providerRequestsObserved: ledger.attempts.reduce((n, a) => n +
        (a.pilotId === plan.pilotId ? provider?.providerCalls || a.result?.providerCalls || 0 : a.result?.providerCalls || 0), 0),
      uiProviderResult: provider, requirePhone: env.CUSTOMER_REQUIRE_PHONE === 'true', massSmsEnabled: false };
    fs.writeFileSync('/probe/ui-audit.json', JSON.stringify(result), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Pilot audit failed; private details withheld'); process.exitCode = 1; });
