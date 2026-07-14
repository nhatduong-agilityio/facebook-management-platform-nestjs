import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IOREDIS_CLIENT } from '../../../infrastructure/rabbitmq/rabbitmq.module';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';
import { IEventBus } from '../../../common/events/event-bus.port';
import { Post } from '../entities/post.entity';
import { PostPublishedEvent } from '../events/post-published.event';

/** Shape of the `facebook.feed` message published by `FacebookFeedEvent`. */
export interface FacebookFeedPayload {
  readonly eventId: string;
  readonly facebookPostId: string;
  readonly pageId: string;
  readonly occurredAt: string;
}

/**
 * Idempotent consumer for `facebook.feed` events.
 *
 * Matches `facebookPostId` against `Post.facebookGraphPostId` to find the post
 * currently in `publishing` state, transitions it to `published`, and emits
 * `PostPublishedEvent` after the flush (§6).
 *
 * Uses `orm.em.fork()` to get a fresh `EntityManager` per message — avoids
 * identity-map pollution between consumer invocations outside an HTTP request context.
 *
 * Bound to `api_queue` via `connectMicroservice(getRmqOptions(...))` in `main.ts`.
 */
@Controller()
export class FacebookFeedConsumer extends IdempotentConsumer {
  constructor(
    @Inject(IOREDIS_CLIENT) redis: Redis,
    private readonly orm: MikroORM,
    private readonly eventBus: IEventBus,
    private readonly logger: Logger,
  ) {
    super(redis);
  }

  /**
   * Handles a `facebook.feed` event exactly once per `eventId`.
   *
   * @param data - Deserialized `FacebookFeedPayload` from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('facebook.feed')
  async onFacebookFeed(
    @Payload() data: FacebookFeedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    await this.withDedup(data.eventId, channel, msg, async () => {
      const em = this.orm.em.fork();

      const post = await em.findOne(Post, {
        facebookGraphPostId: data.facebookPostId,
        status: 'publishing',
        deletedAt: null,
      });

      if (!post) {
        this.logger.log(
          { facebookPostId: data.facebookPostId },
          'FacebookFeedConsumer: no publishing post found for graph post id — skipping',
        );
        return;
      }

      post.status = 'published';
      post.publishedAt = new Date();
      await em.flush();

      // Publish PostPublishedEvent after flush (§6 — never before commit)
      const workspaceId = post.workspace.id;
      await this.eventBus.publish(
        new PostPublishedEvent(
          post.id,
          workspaceId,
          data.facebookPostId,
          post.facebookAccount?.id ?? '',
          post.createdByUserId ?? '',
        ),
      );

      this.logger.log(
        { postId: post.id, workspaceId },
        'FacebookFeedConsumer: post transitioned to published',
      );
    });
  }
}
