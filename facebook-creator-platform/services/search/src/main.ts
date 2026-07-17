import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the search service as a **pure-microservice hybrid** (ADR-084, ADR-108):
 * - RMQ on `search_queue` — 5 consumers for post lifecycle events (Algolia index ops).
 * - TCP on `0.0.0.0:SEARCH_PORT` — internal RPC from `apps/api` (ADR-094).
 *
 * Port consolidation (ADR-108): TCP reuses `SEARCH_PORT` (default 3004); the separate
 * `SEARCH_TCP_PORT` (4004) is removed. `apps/api` connects on `SEARCH_TCP_HOST:SEARCH_TCP_PORT`
 * (defaulting to `localhost:3004`).
 *
 * No HTTP server is started (`app.listen()` is intentionally omitted).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>(getRmqOptions('search_queue', configService));
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get<string>('SEARCH_TCP_HOST', '0.0.0.0'),
      port: configService.get<number>('SEARCH_PORT', 3004),
    },
  });

  await app.startAllMicroservices();
}

bootstrap();
