import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { EmailDeliveryLog } from './entities/email-delivery-log.entity';
import { EmailModule } from './email.module';

/**
 * Global ioredis provider (ADR-063).
 *
 * Provides the shared `Redis` client for consumer dedup keys across all email consumers.
 */
@Global()
@Module({
  providers: [
    {
      provide: IOREDIS_CLIENT,
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
      inject: [ConfigService],
    },
  ],
  exports: [IOREDIS_CLIENT],
})
class EmailRedisModule {}

/**
 * Root application module for `services/email`.
 *
 * Sets up:
 * - **ConfigModule** — loads root `.env` (shared in monorepo).
 * - **LoggerModule** — Pino logger with PII redaction (`email`, `recipientEmail`).
 * - **MikroOrmModule** — PostgreSQL connection to the `email` schema.
 * - **EmailRedisModule** — global ioredis client for consumer dedup keys.
 * - **EmailModule** — all 5 `@EventPattern` consumers, adapters, and port bindings.
 *
 * The service boots as a pure `@nestjs/microservices`
 * Transport.RMQ microservice (TR.5).  Broker topology (`fcp.retry.30s`, exchanges)
 * is pre-declared via Docker Compose / `definitions.json` and is not asserted by
 * application code.
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
    EmailRedisModule,
    EmailModule,
  ],
})
export class AppModule {}
