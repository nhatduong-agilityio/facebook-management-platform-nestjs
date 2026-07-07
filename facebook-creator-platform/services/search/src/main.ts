import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Bootstrap the search service.
 *
 * Listens on `SEARCH_PORT` (default 3004). Internal service — not exposed
 * to the public internet directly. `apps/api` communicates with this service
 * via HTTP for search queries and the service consumes post events to index content.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Search Service (internal)')
    .setDescription('Internal HTTP API for post search — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.SEARCH_PORT ?? 3004;
  await app.listen(port);
}

bootstrap();
