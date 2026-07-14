import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import type { PostPublishedPayload } from '@fcp/analytics-contracts';
import { IPostMetricsRepository } from './ports/post-metrics.repository.port';
import { IInternalApiClient } from './ports/internal-api.client.port';
import { IFacebookInsightsProvider } from './ports/facebook-insights.provider.port';

/**
 * Consumes `posts.published` events from the `fcp.events` topic exchange.
 *
 * Flow (§11 — idempotent, at-least-once):
 * 1. Redis `SET NX EX` dedup — ack and skip if already processed.
 * 2. Call `apps/api` internal endpoint to resolve the page access token.
 * 3. Call Facebook Graph API insights for `reach`, `impressions`, etc.
 * 4. Upsert `analytics.post_metrics` (idempotent via UNIQUE `(post_id, metric_date)`)
 *    inside `RequestContext.create` (HTTP middleware does not run for hybrid routes).
 * 5. On any failure: clear the dedup key and nack with requeue.
 */
@Controller()
export class PostPublishedConsumer {
  /**
   * @param orm        - MikroORM instance used to create a per-message request context.
   * @param metrics    - Persists upserted metrics to `analytics.post_metrics`.
   * @param internalApi - Resolves Facebook page token from `apps/api`.
   * @param insights   - Fetches post insights from the Facebook Graph API.
   * @param redis      - Redis client for idempotent dedup.
   * @param logger     - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly metrics: IPostMetricsRepository,
    private readonly internalApi: IInternalApiClient,
    private readonly insights: IFacebookInsightsProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `posts.published` — resolves insights and upserts `post_metrics`.
   *
   * @param data - Deserialized `PostPublishedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.published')
  async onPostPublished(
    @Payload() data: PostPublishedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:analytics:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostPublishedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      const account = await this.internalApi.getFacebookAccount(data.facebookAccountId);
      const insightData = await this.insights.getPostInsights(
        data.facebookGraphPostId,
        account.pageToken,
      );

      await RequestContext.create(this.orm.em, async () => {
        await this.metrics.upsert({
          postId: data.postId,
          workspaceId: data.workspaceId,
          metricDate: new Date(),
          ...insightData,
        });
      });

      this.logger.log(
        { postId: data.postId, eventId: data.eventId },
        'PostPublishedConsumer: metrics upserted',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostPublishedConsumer: processing failed');
      channel.nack(msg, false, true);
    }
  }
}
