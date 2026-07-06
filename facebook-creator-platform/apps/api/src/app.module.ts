import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { RabbitmqModule } from './infrastructure/rabbitmq/rabbitmq.module';
import { IdentityModule } from './modules/identity/identity.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { FacebookModule } from './modules/facebook/facebook.module';
import { PostsModule } from './modules/posts/posts.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditModule } from './modules/audit/audit.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DevAuthModule } from './modules/dev-auth/dev-auth.module';

/**
 * Root application module. Composes all feature and infrastructure modules.
 *
 * Global singletons registered here:
 * - **ConfigModule** — loads the root `.env` file; available to all modules via ConfigService.
 * - **LoggerModule** — Pino HTTP logger with PII redaction for `email`, `fullName`,
 *   `accessToken`, `token`, and `Authorization` headers (BR-F12).
 * - **DatabaseModule** — PostgreSQL (primary store) and MongoDB (audit store) via MikroORM.
 * - **HealthModule** — liveness probe at `GET /api/v1/health`.
 * - **IdentityModule** — Clerk JWT guard, user upsert, workspace RBAC guards.
 * - **WorkspaceModule** — workspace create/list/get endpoints; seeds owner membership on create.
 * - **FacebookModule** — Facebook OAuth connect-url, Page connection, token refresh, Graph API (T2.1–T2.3).
 * - **RabbitmqModule** — global `IEventBus` (RabbitMQ publisher), `AmqpConnection`, and `IOREDIS_CLIENT` for consumer dedup (T2.6).
 * - **PostsModule** — Post CRUD (create/list/get/update/soft-delete), plan quota, PostCreatedEvent (T2.4); consumers for posts.created/posts.published (T2.6).
 * - **BillingModule** — Thin proxy to `services/billing` (T3.1); exposes `POST /workspaces/:id/billing/checkout` and exports `IPostQuotaProvider` (HTTP-backed) for PostsModule.
 * - **AuditModule** — Thin proxy to `services/audit` (T3.5); Owner-only `GET /workspaces/:id/audit-logs` and `GET /workspaces/:id/audit-logs/:id`.
 * - **AnalyticsModule** — Thin proxy to `services/analytics` (T3.5); Owner-only `GET /workspaces/:id/analytics`.
 * - **DevAuthModule** — `POST /dev-auth/token` token generator; loaded only when `NODE_ENV !== 'production'`.
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
    RabbitmqModule,
    ScheduleModule.forRoot(),
    HealthModule,
    IdentityModule,
    WorkspaceModule,
    FacebookModule,
    PostsModule,
    BillingModule,
    AuditModule,
    AnalyticsModule,
    ...(process.env.NODE_ENV !== 'production' ? [DevAuthModule] : []),
  ],
})
export class AppModule {}
