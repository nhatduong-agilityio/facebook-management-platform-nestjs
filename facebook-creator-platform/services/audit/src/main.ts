import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the audit service as a **hybrid app**:
 * - HTTP server on `AUDIT_PORT` (default 3003) for read endpoints.
 * - RMQ microservice transport listening on the `audit.all` queue for all
 *   `fcp.events` topic events (wildcard `#` binding).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');

  const configService = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>(getRmqOptions('audit.all', configService));

  await app.startAllMicroservices();

  const port = parseInt(process.env['AUDIT_PORT'] ?? '3003', 10);
  await app.listen(port);
}

bootstrap();
