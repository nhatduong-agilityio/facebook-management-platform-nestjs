import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Shape of the `posts.failed` event payload.
 * Mirrors `PostFailedEvent` in `apps/api`.
 */
export interface PostFailedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly createdByUserId: string;
  readonly lastError?: string;
  readonly occurredAt: string;
}

/**
 * Idempotent consumer for `posts.failed` events.
 *
 * Notifies only the post creator (`createdByUserId`) that their post failed to publish.
 * Fires Slack alert as well (actionable failure).
 */
@Injectable()
export class PostFailedNotificationConsumer {
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
   * Handles `posts.failed` — notifies the post creator.
   *
   * @param msg - Deserialized `PostFailedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.failed',
    queue: 'notification.posts.failed',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostFailed(msg: PostFailedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostFailedNotificationConsumer: duplicate, skipping');
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyUser(
          msg.createdByUserId,
          msg.workspaceId,
          'posts.failed',
          'Post publishing failed',
          `Your post failed to publish to Facebook.`,
          { postId: msg.postId },
          true,
        );
      });
      this.logger.log({ postId: msg.postId, eventId: msg.eventId }, 'PostFailedNotificationConsumer: notified');
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostFailedNotificationConsumer: failed');
      throw err;
    }
  }
}
