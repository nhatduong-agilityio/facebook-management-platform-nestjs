import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';

/**
 * Root application module. Composes all feature and infrastructure modules.
 *
 * Global singletons registered here:
 * - **ConfigModule** — loads the root `.env` file; available to all modules via ConfigService.
 * - **LoggerModule** — Pino HTTP logger with PII redaction for `email`, `fullName`,
 *   `accessToken`, `token`, and `Authorization` headers (BR-F12).
 * - **DatabaseModule** — PostgreSQL (primary store) and MongoDB (audit store) via MikroORM.
 * - **HealthModule** — liveness probe at `GET /api/v1/health`.
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
          paths: [
            'req.headers.authorization',
            '*.email',
            '*.fullName',
            '*.accessToken',
            '*.token',
            'req.body.token',
          ],
          censor: '[REDACTED]',
        },
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
