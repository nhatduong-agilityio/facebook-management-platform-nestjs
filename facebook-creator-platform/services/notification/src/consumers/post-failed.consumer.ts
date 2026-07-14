import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
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
@Controller()
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
   * @param data - Deserialized `PostFailedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.failed')
  async onPostFailed(
    @Payload() data: PostFailedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostFailedNotificationConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyUser(
          data.createdByUserId,
          data.workspaceId,
          'posts.failed',
          'Post publishing failed',
          `Your post failed to publish to Facebook.`,
          { postId: data.postId },
          true,
        );
      });
      this.logger.log({ postId: data.postId, eventId: data.eventId }, 'PostFailedNotificationConsumer: notified');
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostFailedNotificationConsumer: failed');
      channel.nack(msg, false, true);
    }
  }
}
