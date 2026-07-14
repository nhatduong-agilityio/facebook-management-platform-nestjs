import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Bootstraps `services/email` as a pure `@nestjs/microservices` Transport.RMQ
 * microservice bound to `email_queue` on the `fcp.events` topic exchange.
 *
 * RMQ options are read from `process.env` at startup.  In development, env vars
 * are populated by Docker Compose or by running with
 * `NODE_OPTIONS='--env-file=../../.env' nest start --watch`.
 */
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env['RABBITMQ_URL'] ?? 'amqp://guest:guest@localhost:5672'],
      queue: 'email_queue',
      noAck: false,
      prefetchCount: Number(process.env['RMQ_PREFETCH'] ?? 10),
      wildcards: true,
      exchange: 'fcp.events',
      exchangeType: 'topic',
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'fcp.dlq',
        },
      },
    },
  });
  app.useLogger(app.get(Logger));
  await app.listen();
}

bootstrap();
