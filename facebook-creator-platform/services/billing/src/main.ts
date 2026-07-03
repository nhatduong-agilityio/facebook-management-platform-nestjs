import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Bootstrap the billing service.
 *
 * Listens on `BILLING_PORT` (default 3001). Internal service — not exposed to
 * the public internet directly. `apps/api` communicates with this service via HTTP.
 */
async function bootstrap(): Promise<void> {
  // rawBody: true is required for Stripe webhook signature verification (T3.2).
  // The unmodified request buffer is available as req.rawBody in the webhook controller.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Billing Service (internal)')
    .setDescription('Internal HTTP API for billing operations — called by apps/api only.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.BILLING_PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
