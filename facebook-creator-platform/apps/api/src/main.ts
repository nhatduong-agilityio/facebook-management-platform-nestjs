import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { getRmqOptions, getDlqRmqOptions } from '@fcp/rmq-options';
import { AppModule } from './app.module';

/**
 * Application entry point.
 *
 * Bootstraps the NestJS application with the following global configuration:
 * - **Pino** structured logger with PII redaction (replaces the default NestJS logger).
 * - **Helmet** HTTP security headers.
 * - **Global prefix** `api/v1` for all routes.
 * - **ValidationPipe** with whitelist + transform to reject unknown fields and
 *   coerce primitives via class-transformer.
 * - **Swagger** UI available at `/api/docs` (all environments).
 * - **`rawBody: true`** — NestJS stores the unmodified request buffer on `req.rawBody`
 *   before JSON parsing so `ClerkWebhookController` can pass it to svix for HMAC
 *   signature verification (a re-serialised JSON object would fail the check).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(PinoLogger));

  app.use(helmet());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Facebook Creator Platform')
    .setDescription('FCP API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  app.connectMicroservice(getRmqOptions('api_queue', configService));
  app.connectMicroservice(getDlqRmqOptions('dlq.logger', configService));
  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application listening on port ${port}`, 'Bootstrap');
}

bootstrap();
