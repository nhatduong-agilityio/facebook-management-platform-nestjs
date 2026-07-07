import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { SearchModule } from './search.module';

/**
 * Global wrapper around `RabbitMQModule`.
 *
 * `RabbitMQModule` v9 is not decorated with `@Global()`, so `AmqpConnection`
 * would only be visible inside `AppModule`. Wrapping it here — with
 * `enableControllerDiscovery: true` so `@RabbitSubscribe` in `SearchModule`
 * is picked up — makes `AmqpConnection` available to all feature modules.
 * Pattern: ADR-063.
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
class SearchMessagingModule {}

/**
 * Global wrapper that provides the `ioredis` Redis client.
 *
 * Defined as `@Global()` so all five post-event consumers (inside `SearchModule`)
 * can inject `Redis` without `SearchModule` having to import this module explicitly.
 * Pattern: ADR-063.
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
class SearchRedisModule {}

/**
 * Root application module for `services/search`.
 *
 * Sets up:
 * - **ConfigModule** — loads the root `.env` file (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger.
 * - **SearchMessagingModule** — global; provides `AmqpConnection` + enables consumer discovery.
 * - **SearchRedisModule** — global; provides `Redis` client for consumer dedup keys.
 * - **SearchModule** — five post-event consumers + HTTP `GET /search` endpoint.
 *
 * No MikroORM — Algolia is the system of record for this service (no Postgres schema).
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
    SearchMessagingModule,
    SearchRedisModule,
    SearchModule,
  ],
})
export class AppModule {}
