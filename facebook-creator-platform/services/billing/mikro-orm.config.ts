import 'reflect-metadata';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { Plan } from './src/entities/plan.entity';
import { Subscription } from './src/entities/subscription.entity';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? 'postgres://fcp:fcp@localhost:5432/fcp',
  metadataProvider: TsMorphMetadataProvider,
  schema: 'billing',
  entities: [Plan, Subscription],
  migrations: {
    path: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    emit: 'ts',
  },
  extensions: [Migrator],
  debug: process.env.NODE_ENV === 'development',
});
