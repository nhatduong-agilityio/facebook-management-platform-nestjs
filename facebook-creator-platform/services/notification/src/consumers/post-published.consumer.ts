import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
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
@Controller()
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

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostPublishedNotificationConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          data.workspaceId,
          'posts.published',
          'Post published',
          `Your post has been successfully published to Facebook.`,
          { postId: data.postId, facebookGraphPostId: data.facebookGraphPostId },
          true,
        );
      });
      this.logger.log({ postId: data.postId, eventId: data.eventId }, 'PostPublishedNotificationConsumer: notified');
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostPublishedNotificationConsumer: failed');
      channel.nack(msg, false, true);
    }
  }
}
