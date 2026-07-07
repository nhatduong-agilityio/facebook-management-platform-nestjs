import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { Notification } from './entities/notification.entity';
import { NotificationRecipient } from './entities/notification-recipient.entity';
import { WorkspaceMemberProjection } from './entities/workspace-member-projection.entity';
import { NotificationModule } from './notification.module';

/**
 * Global wrapper around `RabbitMQModule` (ADR-063).
 *
 * `enableControllerDiscovery: true` ensures `@RabbitSubscribe` in `NotificationModule`
 * is discovered even though it is not in the root `AppModule`.
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
class NotificationMessagingModule {}

/**
 * Global Redis provider (ADR-063).
 *
 * Provides `Redis` (ioredis) to all consumers without requiring each consumer
 * module to import a Redis module.
 */
@Global()
@Module({
  providers: [
    {
      provide: Redis,
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
      inject: [ConfigService],
    },
  ],
  exports: [Redis],
})
class NotificationRedisModule {}

/**
 * Root application module for `services/notification`.
 *
 * Sets up:
 * - **ConfigModule** — loads root `.env` (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger.
 * - **MikroOrmModule** — PostgreSQL connection to the `notification` schema.
 * - **NotificationMessagingModule** — global RabbitMQ + consumer discovery.
 * - **NotificationRedisModule** — global ioredis client for dedup.
 * - **NotificationModule** — all consumers, orchestrator, reconciler, HTTP API.
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
        driver: PostgreSqlDriver,
        clientUrl: config.getOrThrow<string>('DATABASE_URL'),
        schema: 'notification',
        entities: [Notification, NotificationRecipient, WorkspaceMemberProjection],
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
    NotificationMessagingModule,
    NotificationRedisModule,
    NotificationModule,
  ],
})
export class AppModule {}
