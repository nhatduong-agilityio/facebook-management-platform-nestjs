import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Bootstrap the analytics service.
 *
 * Listens on `ANALYTICS_PORT` (default 3002). Internal service — not exposed
 * to the public internet directly. `apps/api` communicates with this service
 * via HTTP for read queries (T3.5).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Analytics Service (internal)')
    .setDescription('Internal HTTP API for post metrics — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.ANALYTICS_PORT ?? 3002;
  await app.listen(port);
}

bootstrap();
