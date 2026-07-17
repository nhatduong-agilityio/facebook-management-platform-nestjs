import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Bootstrap the billing service as a hybrid app (ADR-084).
 *
 * - HTTP on `BILLING_PORT` (default 3001): Stripe webhooks + redirect controller.
 * - TCP on `BILLING_TCP_PORT` (default 4001): internal RPC from `apps/api` (ADR-094).
 */
async function bootstrap(): Promise<void> {
  // rawBody: true is required for Stripe webhook signature verification (T3.2).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: parseInt(process.env.BILLING_TCP_PORT ?? '4001', 10),
    },
  });

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
  await app.startAllMicroservices();
  await app.listen(port);
}

bootstrap();
