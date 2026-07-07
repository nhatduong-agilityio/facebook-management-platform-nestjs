import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Shape of the `posts.published` event payload.
 * Mirrors `PostPublishedEvent` in `apps/api`.
 */
export interface PostPublishedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly facebookGraphPostId: string;
  readonly facebookAccountId: string;
  readonly createdByUserId: string;
  readonly occurredAt: string;
}

/**
 * Idempotent consumer for `posts.published` events.
 *
 * Notifies all workspace members that a post was successfully published to Facebook.
 * Fires Slack alert as well (owner-critical event).
 */
@Injectable()
export class PostPublishedNotificationConsumer {
  /**
   * @param orm          - MikroORM instance used to create a per-message request context.
   * @param orchestrator - Handles notification persistence and Slack dispatch.
   * @param redis        - Redis client for idempotent dedup.
   * @param logger       - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `posts.published` — notifies workspace members.
   *
   * @param msg - Deserialized `PostPublishedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.published',
    queue: 'notification.posts.published',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostPublished(msg: PostPublishedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostPublishedNotificationConsumer: duplicate, skipping');
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          msg.workspaceId,
          'posts.published',
          'Post published',
          `Your post has been successfully published to Facebook.`,
          { postId: msg.postId, facebookGraphPostId: msg.facebookGraphPostId },
          true,
        );
      });
      this.logger.log({ postId: msg.postId, eventId: msg.eventId }, 'PostPublishedNotificationConsumer: notified');
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostPublishedNotificationConsumer: failed');
      throw err;
    }
  }
}
