import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostMetrics } from './entities/post-metrics.entity';
import { IPostMetricsRepository } from './ports/post-metrics.repository.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { IFacebookInsightsProvider } from './ports/facebook-insights.provider.port';
import { MikroOrmPostMetricsRepository } from './adapters/mikro-orm-post-metrics.repository';
import { InternalApiHttpAdapter } from './adapters/internal-api-http.adapter';
import { FacebookInsightsAdapter } from './adapters/facebook-insights.adapter';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PostPublishedConsumer } from './analytics.consumer';
import { AnalyticsMessageController } from './analytics.message-controller';

/**
 * Core analytics module.
 *
 * Owns the `analytics` Postgres schema. Exposes:
 * - `PostPublishedConsumer` — RMQ consumer (`@EventPattern('posts.published')`)
 *   that drives the metrics upsert flow. Listed in `controllers` as required by
 *   `@nestjs/microservices` for `@EventPattern` handler discovery.
 * - `AnalyticsController` — HTTP read endpoints (kept for health check / Swagger; TM.12 will decide final port strategy).
 * - `AnalyticsMessageController` — TCP `@MessagePattern` handlers for `apps/api` (ADR-094).
 *
 * Port bindings:
 * - `IPostMetricsRepository`    → `MikroOrmPostMetricsRepository`
 * - `IInternalApiClient`        → `InternalApiHttpAdapter`
 * - `IFacebookInsightsProvider` → `FacebookInsightsAdapter`
 */
@Module({
  imports: [MikroOrmModule.forFeature([PostMetrics])],
  controllers: [PostPublishedConsumer, AnalyticsController, AnalyticsMessageController],
  providers: [
    AnalyticsService,
    { provide: IPostMetricsRepository, useClass: MikroOrmPostMetricsRepository },
    { provide: IInternalApiClient, useClass: InternalApiHttpAdapter },
    { provide: IFacebookInsightsProvider, useClass: FacebookInsightsAdapter },
  ],
})
export class AnalyticsModule {}
