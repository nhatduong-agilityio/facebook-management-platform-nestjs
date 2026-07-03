import { Inject, Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
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
 * Queue: `api.facebook.feed` (durable, DLX → `fcp.dlq`)
 */
@Injectable()
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
   * @param msg - Deserialized `FacebookFeedPayload` from the broker.
   * @returns `undefined` on success/duplicate, or `Nack(false)` for a permanent failure.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'facebook.feed',
    queue: 'api.facebook.feed',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onFacebookFeed(msg: FacebookFeedPayload): Promise<void | Nack> {
    return this.withDedup(msg.eventId, async () => {
      const em = this.orm.em.fork();

      const post = await em.findOne(Post, {
        facebookGraphPostId: msg.facebookPostId,
        status: 'publishing',
        deletedAt: null,
      });

      if (!post) {
        this.logger.log(
          { facebookPostId: msg.facebookPostId },
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
        new PostPublishedEvent(post.id, workspaceId, msg.facebookPostId),
      );

      this.logger.log(
        { postId: post.id, workspaceId },
        'FacebookFeedConsumer: post transitioned to published',
      );
    });
  }
}
