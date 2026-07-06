import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IHttpClient } from '../../common/http/http-client.port';
import { FetchHttpClientAdapter } from '../../common/http/fetch-http-client.adapter';
import { IAnalyticsClient } from './ports/analytics-http.client.port';
import { AnalyticsHttpClientAdapter } from './adapters/analytics-http-client.adapter';
import { AnalyticsController } from './analytics.controller';

/**
 * Thin proxy module in `apps/api` for analytics read operations.
 *
 * Owns NO entities or migrations — all metric data lives in `services/analytics` (Postgres `analytics` schema).
 * Responsibilities:
 * 1. Expose `GET /workspaces/:id/analytics` with Clerk JWT auth + Owner-only workspace role guard.
 * 2. Forward requests to `services/analytics` via `IAnalyticsClient` → `AnalyticsHttpClientAdapter`
 *    (backed by `IHttpClient` → `FetchHttpClientAdapter` with 5s timeout).
 *
 * Port bindings:
 * - `IHttpClient`      → `FetchHttpClientAdapter`      (native fetch, 5 s timeout)
 * - `IAnalyticsClient` → `AnalyticsHttpClientAdapter`  (maps raw service shape → `MetricsSummaryDto`)
 */
@Module({
  imports: [IdentityModule],
  controllers: [AnalyticsController],
  providers: [
    { provide: IHttpClient, useClass: FetchHttpClientAdapter },
    { provide: IAnalyticsClient, useClass: AnalyticsHttpClientAdapter },
  ],
})
export class AnalyticsModule {}
