import 'reflect-metadata';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { Notification } from './src/entities/notification.entity';
import { NotificationRecipient } from './src/entities/notification-recipient.entity';
import { WorkspaceMemberProjection } from './src/entities/workspace-member-projection.entity';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? 'postgres://fcp:fcp@localhost:5432/fcp',
  metadataProvider: TsMorphMetadataProvider,
  schema: 'notification',
  entities: [Notification, NotificationRecipient, WorkspaceMemberProjection],
  migrations: {
    path: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    emit: 'ts',
  },
  extensions: [Migrator],
  debug: process.env.NODE_ENV === 'development',
});
