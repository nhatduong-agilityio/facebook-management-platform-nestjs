import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { SearchModule } from './search.module';

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
      provide: IOREDIS_CLIENT,
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
      inject: [ConfigService],
    },
  ],
  exports: [IOREDIS_CLIENT],
})
class SearchRedisModule {}

/**
 * Root application module for `services/search`.
 *
 * Sets up:
 * - **ConfigModule** — loads the root `.env` file (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger.
 * - **SearchRedisModule** — global; provides `Redis` client for consumer dedup keys.
 * - **SearchModule** — five post-event consumers + HTTP `GET /search` endpoint.
 *
 * No MikroORM — Algolia is the system of record for this service (no Postgres schema).
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
    SearchRedisModule,
    SearchModule,
  ],
})
export class AppModule {}
