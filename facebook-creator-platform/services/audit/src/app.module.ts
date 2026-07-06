import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { MongoDriver } from '@mikro-orm/mongodb';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { LoggerModule } from 'nestjs-pino';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditModule } from './audit.module';

/**
 * Global wrapper around `RabbitMQModule`.
 *
 * `RabbitMQModule` v9 is not decorated with `@Global()`, so `AmqpConnection`
 * would only be visible inside `AppModule`. Wrapping it here — with
 * `enableControllerDiscovery: true` so `@RabbitSubscribe` in `AuditModule`
 * is picked up — makes `AmqpConnection` available to all feature modules (ADR-063).
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        exchanges: [
          { name: 'fcp.events', type: 'topic', options: { durable: true } },
          { name: 'fcp.dlq', type: 'fanout', options: { durable: true } },
        ],
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
class AuditMessagingModule {}

/**
 * Root application module for `services/audit`.
 *
 * Sets up:
 * - **ConfigModule** — loads the root `.env` file (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger; no PII-bearing fields to redact at this level.
 * - **MikroOrmModule** — MongoDB connection; `ensureIndexes: true` creates the
 *   unique index on `eventId` and the `workspaceId` index on startup.
 * - **AuditMessagingModule** — global wrapper; makes `AmqpConnection` available to all modules.
 * - **AuditModule** — consumer + HTTP read endpoints.
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
    AuditMessagingModule,
    AuditModule,
  ],
})
export class AppModule {}
