import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/** Bootstraps the audit service on `AUDIT_PORT` (default 3003). */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  const port = parseInt(process.env.AUDIT_PORT ?? '3003', 10);
  await app.listen(port);
}

bootstrap();
