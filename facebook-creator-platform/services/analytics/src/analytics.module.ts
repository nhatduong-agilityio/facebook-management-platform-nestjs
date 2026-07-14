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

/**
 * Core analytics module.
 *
 * Owns the `analytics` Postgres schema. Exposes:
 * - `PostPublishedConsumer` — RMQ consumer (`@EventPattern('posts.published')`)
 *   that drives the metrics upsert flow. Listed in `controllers` as required by
 *   `@nestjs/microservices` for `@EventPattern` handler discovery.
 * - `AnalyticsController` — HTTP read endpoints called by `apps/api` (T3.5).
 *
 * Port bindings:
 * - `IPostMetricsRepository`    → `MikroOrmPostMetricsRepository`
 * - `IInternalApiClient`        → `InternalApiHttpAdapter`
 * - `IFacebookInsightsProvider` → `FacebookInsightsAdapter`
 */
@Module({
  imports: [MikroOrmModule.forFeature([PostMetrics])],
  controllers: [PostPublishedConsumer, AnalyticsController],
  providers: [
    AnalyticsService,
    { provide: IPostMetricsRepository, useClass: MikroOrmPostMetricsRepository },
    { provide: IInternalApiClient, useClass: InternalApiHttpAdapter },
    { provide: IFacebookInsightsProvider, useClass: FacebookInsightsAdapter },
  ],
})
export class AnalyticsModule {}
