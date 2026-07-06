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
 * - `PostPublishedConsumer` — RabbitMQ consumer that drives the metrics upsert flow.
 * - `AnalyticsController` — HTTP read endpoints called by `apps/api` (T3.5).
 *
 * Port bindings:
 * - `IPostMetricsRepository` → `MikroOrmPostMetricsRepository`
 * - `IInternalApiClient`     → `InternalApiHttpAdapter`
 * - `IFacebookInsightsProvider` → `FacebookInsightsAdapter`
 *
 * Redis is injected as a plain `ioredis` `Redis` instance (global token `'REDIS'`).
 */
@Module({
  imports: [MikroOrmModule.forFeature([PostMetrics])],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    PostPublishedConsumer,
    { provide: IPostMetricsRepository, useClass: MikroOrmPostMetricsRepository },
    { provide: IInternalApiClient, useClass: InternalApiHttpAdapter },
    { provide: IFacebookInsightsProvider, useClass: FacebookInsightsAdapter },
  ],
})
export class AnalyticsModule {}
