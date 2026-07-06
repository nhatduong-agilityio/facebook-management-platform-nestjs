import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { PostPublishedPayload } from '@fcp/analytics-contracts';
import { IPostMetricsRepository } from './ports/post-metrics.repository.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { IFacebookInsightsProvider } from './ports/facebook-insights.provider.port';

/**
 * Consumes `posts.published` events from the `fcp.events` topic exchange.
 *
 * Flow (§11 — idempotent, at-least-once):
 * 1. Redis `SET NX EX` dedup — skip if already processed.
 * 2. Call `apps/api` internal endpoint to resolve the page access token.
 * 3. Call Facebook Graph API insights for `reach`, `impressions`, etc.
 * 4. Upsert `analytics.post_metrics` (idempotent via UNIQUE `(post_id, metric_date)`).
 * 5. On any failure: clear the dedup key and re-throw so RabbitMQ redelivers.
 */
@Injectable()
export class PostPublishedConsumer {
  constructor(
    private readonly metrics: IPostMetricsRepository,
    private readonly internalApi: IInternalApiClient,
    private readonly insights: IFacebookInsightsProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handler for `posts.published` events.
   *
   * @param msg - Event payload (see `PostPublishedEvent` in apps/api).
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.published',
    queue: 'analytics.posts.published',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostPublished(msg: PostPublishedPayload): Promise<void | Nack> {
    // 1. Idempotency — must be first; no side-effects before this.
    const dedupKey = `dedup:analytics:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostPublishedConsumer: duplicate, skipping');
      return;
    }

    try {
      // 2. Resolve page token via apps/api internal endpoint.
      const account = await this.internalApi.getFacebookAccount(msg.facebookAccountId);

      // 3. Fetch Graph API insights.
      const insightData = await this.insights.getPostInsights(
        msg.facebookGraphPostId,
        account.pageToken,
      );

      // 4. Upsert — idempotent on (postId, metricDate).
      await this.metrics.upsert({
        postId: msg.postId,
        workspaceId: msg.workspaceId,
        metricDate: new Date(),
        ...insightData,
      });

      this.logger.log(
        { postId: msg.postId, eventId: msg.eventId },
        'PostPublishedConsumer: metrics upserted',
      );
    } catch (err) {
      // Allow retry: clear the dedup key so the next delivery is treated as new.
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostPublishedConsumer: processing failed');
      throw err;
    }
  }
}
