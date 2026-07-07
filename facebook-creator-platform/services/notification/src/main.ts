import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Bootstrap the notification service.
 *
 * Listens on `NOTIFICATION_PORT` (default 3005). Internal service — not exposed
 * to the public internet directly. `apps/api` communicates with this service
 * via HTTP for read queries (T4.2).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Notification Service (internal)')
    .setDescription('Internal HTTP API for notifications — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.NOTIFICATION_PORT ?? 3005;
  await app.listen(port);
}

bootstrap();
