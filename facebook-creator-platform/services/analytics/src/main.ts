import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the analytics service as a **pure-microservice hybrid** (ADR-084):
 * - RMQ on `analytics.posts.published` — consumes `posts.published` events.
 * - TCP on `ANALYTICS_TCP_HOST:ANALYTICS_TCP_PORT` — internal RPC from `apps/api` (ADR-094).
 *
 * No HTTP server is started (`app.listen()` is intentionally omitted) — analytics
 * has no external clients, no webhooks, no Swagger or health endpoint. The Express
 * adapter is loaded but no port is bound; this keeps a single DI container for both
 * transports (vs. two separate `createMicroservice` calls which would duplicate the
 * MikroORM pool and all repositories).
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
      port: configService.get<number>('ANALYTICS_TCP_PORT', 4002),
    },
  });

  await app.startAllMicroservices();
}

bootstrap();
