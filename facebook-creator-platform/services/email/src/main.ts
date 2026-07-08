import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/** Bootstrap the email service on the port specified by `EMAIL_PORT` (default 3006). */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');

  const port = process.env.EMAIL_PORT ?? 3006;
  await app.listen(port);
}

bootstrap();
