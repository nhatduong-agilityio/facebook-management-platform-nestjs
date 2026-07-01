import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MongoDriver } from '@mikro-orm/mongodb';
import { Migrator } from '@mikro-orm/migrations';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { User } from '../modules/identity/entities/user.entity';
import { Workspace } from '../modules/workspace/entities/workspace.entity';
import { WorkspaceMember } from '../modules/workspace/entities/workspace-member.entity';
import { Invitation } from '../modules/workspace/entities/invitation.entity';

/**
 * Configures and registers the two MikroORM connections used by the platform:
 *
 * - **Default (PostgreSQL)** — primary transactional store for all domain entities.
 *   Uses the `core` schema, TsMorphMetadataProvider for TS type inference, and a
 *   global `softDelete` filter so deleted rows are hidden from all queries by default.
 *
 * - **`mongo` (MongoDB)** — audit store consumed by the Audit Service (T3.x).
 *   No entities are registered yet; `discovery.warnWhenNoEntities` is disabled until
 *   audit entities are added.
 *
 * Both connections are registered as global providers by `@mikro-orm/nestjs`, so
 * feature modules do not need to import this module explicitly.
 */
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        driver: PostgreSqlDriver,
        clientUrl: config.getOrThrow<string>('DATABASE_URL'),
        schema: 'core',
        entities: [User, Workspace, WorkspaceMember, Invitation],
        metadataProvider: TsMorphMetadataProvider,
        migrations: {
          path: './src/migrations',
          glob: '!(*.d).{js,ts}',
          transactional: true,
        },
        extensions: [Migrator],
        allowGlobalContext: false,
      }),
      inject: [ConfigService],
    }),
    MikroOrmModule.forRootAsync({
      contextName: 'mongo',
      useFactory: (config: ConfigService) => ({
        driver: MongoDriver,
        clientUrl: config.getOrThrow<string>('MONGODB_URI'),
        entities: [],
        discovery: { warnWhenNoEntities: false },
        allowGlobalContext: false,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
