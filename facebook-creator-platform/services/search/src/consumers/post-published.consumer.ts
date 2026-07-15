import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

/** Shape of the `posts.published` event payload (mirrors `PostPublishedEvent` in apps/api). */
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
 * Partially updates the Algolia record to reflect `status: 'published'`,
 * storing `facebookGraphPostId` and `publishedAt` from the event timestamp.
 * No HTTP callback to `apps/api` — event carries sufficient data (ADR-051).
 */
@Controller()
export class PostPublishedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.published` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostPublishedPayload` from the broker.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.published')
  async onPostPublished(
    @Payload() data: PostPublishedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:search:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostPublishedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await this.algolia.partialUpdateObject(data.postId, {
        status: 'published',
        facebookGraphPostId: data.facebookGraphPostId,
        publishedAt: data.occurredAt,
      });

      this.logger.log(
        { postId: data.postId, eventId: data.eventId },
        'PostPublishedConsumer: index updated to published',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostPublishedConsumer: update failed');
      channel.nack(msg, false, true);
    }
  }
}
