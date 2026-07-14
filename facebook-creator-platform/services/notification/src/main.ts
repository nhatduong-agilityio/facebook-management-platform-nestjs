import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getRmqOptions } from '@fcp/rmq-options';

/**
 * Bootstraps the notification service as a **hybrid app**:
 * - HTTP server on `NOTIFICATION_PORT` (default 3005) for read endpoints.
 * - RMQ microservice transport on the `notification_queue` queue for all 11
 *   workspace, post, billing, and Facebook lifecycle events.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Notification Service (internal)')
    .setDescription('Internal HTTP API for notifications — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const configService = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>(getRmqOptions('notification_queue', configService));

  await app.startAllMicroservices();

  const port = process.env['NOTIFICATION_PORT'] ?? 3005;
  await app.listen(port);
}

bootstrap();
