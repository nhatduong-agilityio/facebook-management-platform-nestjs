import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { IdentityModule } from '../identity/identity.module';
import { IAnalyticsClient } from './ports/analytics-http.client.port';
import { AnalyticsTcpAdapter, ANALYTICS_TCP_CLIENT } from './adapters/analytics-tcp.adapter';
import { AnalyticsController } from './analytics.controller';

/**
 * Thin proxy module in `apps/api` for analytics read operations.
 *
 * Owns NO entities or migrations — all metric data lives in `services/analytics` (Postgres `analytics` schema).
 * Responsibilities:
 * 1. Expose `GET /workspaces/:id/analytics` and `GET /workspaces/:id/posts/:postId/analytics`
 *    with Clerk JWT auth + Owner-only workspace role guard.
 * 2. Forward requests to `services/analytics` via `IAnalyticsClient` → `AnalyticsTcpAdapter`
 *    (NestJS TCP transport, ADR-094).
 *
 * Communication:
 * - Sync TCP (`ANALYTICS_TCP_CLIENT`) to `services/analytics` for metric reads.
 *
 * Port bindings:
 * - `IAnalyticsClient` → `AnalyticsTcpAdapter` (TCP RPC, replaces HTTP adapter — ADR-094)
 */
@Module({
  imports: [
    IdentityModule,
    ClientsModule.registerAsync([
      {
        name: ANALYTICS_TCP_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('ANALYTICS_TCP_HOST', 'localhost'),
            port: config.get<number>('ANALYTICS_TCP_PORT', 3002),
          },
        }),
      },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsTcpAdapter,
    { provide: IAnalyticsClient, useClass: AnalyticsTcpAdapter },
  ],
})
export class AnalyticsModule {}
