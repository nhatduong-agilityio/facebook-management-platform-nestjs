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
import { PostMetrics } from './entities/post-metrics.entity';
import { AnalyticsModule } from './analytics.module';

/**
 * Global wrapper around `RabbitMQModule`.
 *
 * `RabbitMQModule` v9 is not decorated with `@Global()`, so `AmqpConnection`
 * would only be visible inside `AppModule`. Wrapping it here — with
 * `enableControllerDiscovery: true` so `@RabbitSubscribe` in `AnalyticsModule`
 * is picked up — makes `AmqpConnection` available to all feature modules.
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
class AnalyticsMessagingModule {}

/**
 * Global wrapper that provides the `ioredis` Redis client.
 *
 * Defined as `@Global()` so `PostPublishedConsumer` (inside `AnalyticsModule`)
 * can inject `Redis` without `AnalyticsModule` having to import this module explicitly.
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
class RedisModule {}

/**
 * Root application module for `services/analytics`.
 *
 * Sets up:
 * - **ConfigModule** — loads the root `.env` file (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger.
 * - **MikroOrmModule** — PostgreSQL connection to the `analytics` schema.
 * - **AnalyticsMessagingModule** — global; makes `AmqpConnection` available to all modules.
 * - **RedisModule** — global; makes `Redis` client available to all modules.
 * - **AnalyticsModule** — consumer + HTTP read endpoints.
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
        schema: 'analytics',
        entities: [PostMetrics],
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
    AnalyticsMessagingModule,
    RedisModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
