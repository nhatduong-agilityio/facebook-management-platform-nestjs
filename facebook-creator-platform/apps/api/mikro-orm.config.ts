import 'reflect-metadata';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { User } from './src/modules/identity/entities/user.entity';
import { Workspace } from './src/modules/workspace/entities/workspace.entity';
import { WorkspaceMember } from './src/modules/workspace/entities/workspace-member.entity';
import { Invitation } from './src/modules/workspace/entities/invitation.entity';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? 'postgres://fcp:fcp@localhost:5432/fcp',
  metadataProvider: TsMorphMetadataProvider,
  schema: 'core',
  entities: [User, Workspace, WorkspaceMember, Invitation],
  migrations: {
    path: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    emit: 'ts',
  },
  extensions: [Migrator],
  debug: process.env.NODE_ENV === 'development',
});
