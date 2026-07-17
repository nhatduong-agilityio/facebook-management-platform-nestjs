import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the audit service as a **pure-microservice-hybrid** (ADR-094, §15):
 * - RMQ consumer on `audit.all` queue — wildcard `#` binding for all `fcp.events` events.
 * - TCP server on `AUDIT_TCP_HOST:AUDIT_TCP_PORT` for synchronous reads from `apps/api`.
 * - No HTTP server: `app.listen()` is intentionally omitted.
 *
 * `enableShutdownHooks()` ensures RMQ consumer cancels cleanly on SIGTERM (prevents
 * broker requeueing of in-flight messages) and MikroORM closes its MongoDB pool.
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
      port: configService.get<number>('AUDIT_TCP_PORT', 4003),
    },
  });

  await app.startAllMicroservices();
  // No app.listen() — this service has no external HTTP endpoints.
}

bootstrap();
