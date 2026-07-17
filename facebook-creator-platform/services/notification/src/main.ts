import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the notification service as a **pure-microservice hybrid** (ADR-084, ADR-108):
 * - RMQ on `notification_queue` — 11 consumers for workspace, post, billing, and
 *   Facebook lifecycle events that drive notification fan-out.
 * - TCP on `0.0.0.0:NOTIFICATION_PORT` — internal RPC from `apps/api` for list and
 *   mark-read operations (ADR-094).
 *
 * Port consolidation (ADR-108): TCP reuses `NOTIFICATION_PORT` (default 3005); the
 * separate `NOTIFICATION_TCP_PORT` (4005) is removed. `apps/api` connects on
 * `NOTIFICATION_TCP_HOST:NOTIFICATION_TCP_PORT` (defaulting to `localhost:3005`).
 *
 * No HTTP server is started (`app.listen()` is intentionally omitted).
 *
 * Note: `WorkspaceMemberReconciler.onModuleInit` calls `apps/api` over HTTP
 * (`GET /internal/workspaces/:id/members`) — this is the **reverse** direction
 * (service → gateway) and remains HTTP per ADR-094.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>(getRmqOptions('notification_queue', configService));
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get<string>('NOTIFICATION_TCP_HOST', '0.0.0.0'),
      port: configService.get<number>('NOTIFICATION_PORT', 3005),
    },
  });

  await app.startAllMicroservices();
}

bootstrap();
