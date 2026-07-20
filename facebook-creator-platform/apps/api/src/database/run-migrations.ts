import 'reflect-metadata';
import path from 'path';
import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

/**
 * Runs all pending MikroORM migrations for the `core` schema.
 * Called by the `migration` service in docker-compose before any app service starts.
 */
export async function runMigrations(): Promise<void> {
  const orm = await MikroORM.init({
    clientUrl: process.env.DATABASE_URL ?? 'postgres://fcp:fcp@localhost:5432/fcp',
    schema: 'core',
    entities: [],
    discovery: { warnWhenNoEntities: false },
    migrations: {
      path: path.resolve(__dirname, '../migrations'),
      glob: '!(*.d).{js,ts}',
      transactional: true,
    },
    extensions: [Migrator],
  });
  try {
    await orm.migrator.up();
    console.log('[api:core] migrations complete');
  } finally {
    await orm.close(true);
  }
}

if (require.main === module) {
  runMigrations().catch((err: unknown) => {
    console.error('[api:core] migration failed:', err);
    process.exit(1);
  });
}
