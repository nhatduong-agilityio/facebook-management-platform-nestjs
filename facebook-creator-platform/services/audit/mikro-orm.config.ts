import { MongoDriver } from '@mikro-orm/mongodb';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { AuditEvent } from './src/entities/audit-event.entity';

export default {
  driver: MongoDriver,
  clientUrl: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/fcp_audit',
  entities: [AuditEvent],
  metadataProvider: TsMorphMetadataProvider,
  ensureIndexes: true,
};
