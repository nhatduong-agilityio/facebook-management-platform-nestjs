import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the audit service as a **pure-microservice-hybrid** (ADR-094, §15, ADR-108):
 * - RMQ consumer on `audit.all` queue — wildcard `#` binding for all `fcp.events` events.
 * - TCP server on `0.0.0.0:AUDIT_PORT` for synchronous reads from `apps/api`.
 * - No HTTP server: `app.listen()` is intentionally omitted.
 *
 * Port consolidation (ADR-108): TCP reuses `AUDIT_PORT` (default 3003); the separate
 * `AUDIT_TCP_PORT` (4003) is removed. `apps/api` connects on `AUDIT_TCP_HOST:AUDIT_TCP_PORT`
 * (defaulting to `localhost:3003`).
 *
 * `enableShutdownHooks()` ensures RMQ consumer cancels cleanly on SIGTERM and MikroORM
 * closes its MongoDB pool.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  app.connectMicroservice<MicroserviceOptions>(getRmqOptions('audit.all', configService));
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get<string>('AUDIT_TCP_HOST', '0.0.0.0'),
      port: configService.get<number>('AUDIT_PORT', 3003),
    },
  });

  await app.startAllMicroservices();
}

bootstrap();
