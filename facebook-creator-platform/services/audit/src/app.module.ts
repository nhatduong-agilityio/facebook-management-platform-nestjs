import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MongoDriver } from '@mikro-orm/mongodb';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { LoggerModule } from 'nestjs-pino';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditModule } from './audit.module';

/**
 * Root application module for `services/audit`.
 *
 * Sets up:
 * - **ConfigModule** — loads the root `.env` file (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger.
 * - **MikroOrmModule** — MongoDB connection; `ensureIndexes: true` creates the
 *   unique index on `eventId` and the `workspaceId` index on startup.
 * - **AuditModule** — `@EventPattern('#')` consumer + HTTP read endpoints.
 *
 * `AuditMessagingModule` (`@golevelup` `RabbitMQModule` wrapper) removed in TR.6.
 * RMQ transport is connected in `main.ts` via `app.connectMicroservice(getRmqOptions(...))`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '../../.env')],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    MikroOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        driver: MongoDriver,
        clientUrl: config.getOrThrow<string>('MONGODB_URI'),
        entities: [AuditEvent],
        metadataProvider: TsMorphMetadataProvider,
        ensureIndexes: true,
        allowGlobalContext: false,
      }),
      inject: [ConfigService],
    }),
    AuditModule,
  ],
})
export class AppModule {}
