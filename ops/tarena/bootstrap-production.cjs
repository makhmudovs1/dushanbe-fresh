const { PrismaClient } = require('/app/node_modules/@prisma/client');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (process.env.DF_PRODUCTION_BOOTSTRAP !== '4ac48e2' || url.hostname !== '127.0.0.1' || url.port !== '15440' || url.pathname !== '/df_production') throw Error('Explicit new production database required');
  const roles = [['df_api', process.env.DF_API_PASSWORD], ['df_backup', process.env.DF_BACKUP_PASSWORD]];
  if (roles.some(([, password]) => !/^[A-Za-z0-9_-]{43,64}$/.test(password || ''))) throw Error('Fresh credentials required');
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      if (await tx.user.count() || await tx.order.count() || await tx.product.count()) throw Error('Bootstrap refuses nonempty business tables');
      for (const [role, password] of roles) {
        const found = await tx.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname = ${role}`;
        if (found.length) throw Error('Existing roles are not overwritten');
        await tx.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
        await tx.$executeRawUnsafe(`GRANT CONNECT ON DATABASE df_production TO ${role}`);
        await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
      }
      await tx.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await tx.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO df_api');
      await tx.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO df_api');
      await tx.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO df_backup');
      await tx.$executeRawUnsafe('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO df_backup');
      await tx.$executeRawUnsafe('REVOKE ALL ON TABLE public._prisma_migrations FROM df_api');
    });
    console.log(JSON.stringify({productionDatabase: 'df_production', rolesCreated: true, syntheticRowsInserted: 0}));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('New production bootstrap refused or failed; credentials withheld'); process.exitCode = 1; });
