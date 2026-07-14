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
 * Bootstraps the search service as a **hybrid app**:
 * - HTTP server on `SEARCH_PORT` (default 3004) for read endpoints.
 * - RMQ microservice transport on the `search_queue` queue for all five post
 *   lifecycle events that drive Algolia index operations.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Search Service (internal)')
    .setDescription('Internal HTTP API for post search — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const configService = app.get(ConfigService);
  app.connectMicroservice<MicroserviceOptions>(getRmqOptions('search_queue', configService));

  await app.startAllMicroservices();

  const port = process.env['SEARCH_PORT'] ?? 3004;
  await app.listen(port);
}

bootstrap();
