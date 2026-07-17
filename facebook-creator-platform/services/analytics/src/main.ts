import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the analytics service as a **pure-microservice hybrid** (ADR-084, ADR-108):
 * - RMQ on `analytics.posts.published` — consumes `posts.published` events.
 * - TCP on `0.0.0.0:ANALYTICS_PORT` — internal RPC from `apps/api` (ADR-094).
 *
 * Port consolidation (ADR-108): the old dual-port layout (HTTP :3002 + TCP :4002) is
 * collapsed — TCP now reuses `ANALYTICS_PORT` (default 3002) since there is no HTTP
 * server. `apps/api` connects on `ANALYTICS_TCP_HOST:ANALYTICS_TCP_PORT` (defaulting
 * to `localhost:3002`).
 *
 * No HTTP server is started (`app.listen()` is intentionally omitted).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>(
    getRmqOptions('analytics.posts.published', configService),
  );
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get<string>('ANALYTICS_TCP_HOST', '0.0.0.0'),
      port: configService.get<number>('ANALYTICS_PORT', 3002),
    },
  });

  await app.startAllMicroservices();
}

bootstrap();
