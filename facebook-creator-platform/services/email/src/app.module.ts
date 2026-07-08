import { join } from 'node:path';
import { Global, Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AmqpConnection, RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { ConfirmChannel } from 'amqplib';
import { Migrator } from '@mikro-orm/migrations';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { EmailDeliveryLog } from './entities/email-delivery-log.entity';
import { EmailModule } from './email.module';

/**
 * Declares the shared retry infrastructure queue on startup.
 *
 * `fcp.retry.30s` receives dead-lettered messages from all consumer queues
 * (via `fcp.retry` exchange), waits 30 s (TTL), then returns them to
 * `fcp.events` so the original consumer retries.  The `addSetup` call is
 * idempotent and re-runs on reconnection.
 */
@Injectable()
class RetryQueueSetup implements OnApplicationBootstrap {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  /** {@inheritDoc OnApplicationBootstrap.onApplicationBootstrap} */
  async onApplicationBootstrap(): Promise<void> {
    await this.amqpConnection.managedChannel.addSetup(async (ch: ConfirmChannel) => {
      await ch.assertQueue('fcp.retry.30s', {
        durable: true,
        arguments: {
          'x-message-ttl': 30_000,
          'x-dead-letter-exchange': 'fcp.events',
        },
      });
      await ch.bindQueue('fcp.retry.30s', 'fcp.retry', '#');
    });
  }
}

/**
 * Global RabbitMQ wrapper (ADR-063).
 *
 * Declares three exchanges: `fcp.events` (normal flow), `fcp.retry`
 * (transient-error retry via 30 s TTL queue), and `fcp.dlq` (permanent
 * failures and exhausted retries). `enableControllerDiscovery: true` picks up
 * `@RabbitSubscribe` in `EmailModule` consumers without explicit registration.
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        exchanges: [
          { name: 'fcp.events', type: 'topic', options: { durable: true } },
          { name: 'fcp.retry', type: 'topic', options: { durable: true } },
          { name: 'fcp.dlq', type: 'fanout', options: { durable: true } },
        ],
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  providers: [RetryQueueSetup],
  exports: [RabbitMQModule],
})
class EmailMessagingModule {}

/**
 * Global ioredis provider (ADR-063).
 *
 * Provides the `Redis` client for consumer dedup keys across all email consumers.
 */
@Global()
@Module({
  providers: [
    {
      provide: Redis,
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
      inject: [ConfigService],
    },
  ],
  exports: [Redis],
})
class EmailRedisModule {}

/**
 * Root application module for `services/email`.
 *
 * Sets up:
 * - **ConfigModule** — loads root `.env` (shared in monorepo).
 * - **LoggerModule** — Pino HTTP logger with PII redaction.
 * - **MikroOrmModule** — PostgreSQL connection to the `email` schema.
 * - **EmailMessagingModule** — global RabbitMQ + consumer discovery.
 * - **EmailRedisModule** — global ioredis client for dedup keys.
 * - **EmailModule** — consumers, processor, adapters, port bindings.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '../../.env')],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: {
          paths: ['req.headers.authorization', '*.email', '*.recipientEmail'],
          censor: '[REDACTED]',
        },
        transport:
          process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    MikroOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        driver: PostgreSqlDriver,
        clientUrl: config.getOrThrow<string>('DATABASE_URL'),
        schema: 'email',
        entities: [EmailDeliveryLog],
        metadataProvider: TsMorphMetadataProvider,
        migrations: {
          path: './src/migrations',
          glob: '!(*.d).{js,ts}',
          transactional: true,
        },
        extensions: [Migrator],
        allowGlobalContext: false,
      }),
      inject: [ConfigService],
    }),
    EmailMessagingModule,
    EmailRedisModule,
    EmailModule,
  ],
})
export class AppModule {}
