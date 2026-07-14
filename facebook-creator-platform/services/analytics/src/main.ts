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
 * Bootstraps the analytics service as a **hybrid app**:
 * - HTTP server on `ANALYTICS_PORT` (default 3002) for read endpoints.
 * - RMQ microservice transport on the `analytics.posts.published` queue for
 *   `posts.published` events that drive the metrics upsert flow.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Analytics Service (internal)')
    .setDescription('Internal HTTP API for post metrics — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const configService = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>(
    getRmqOptions('analytics.posts.published', configService),
  );

  await app.startAllMicroservices();

  const port = process.env['ANALYTICS_PORT'] ?? 3002;
  await app.listen(port);
}

bootstrap();
