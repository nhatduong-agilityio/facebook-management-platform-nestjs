import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

/** Shape of the `posts.deleted` event payload (mirrors `PostDeletedEvent` in apps/api). */
export interface PostDeletedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly deletedByUserId: string;
}

/**
 * Idempotent consumer for `posts.deleted` events.
 *
 * Removes the corresponding record from the Algolia index so that deleted posts
 * no longer appear in search results. Algolia `deleteObject` is idempotent — a
 * second delete of an already-deleted `objectID` succeeds silently.
 */
@Controller()
export class PostDeletedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.deleted` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostDeletedPayload` from the broker.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.deleted')
  async onPostDeleted(
    @Payload() data: PostDeletedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:search:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostDeletedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await this.algolia.deleteObject(data.postId);

      this.logger.log(
        { postId: data.postId, eventId: data.eventId },
        'PostDeletedConsumer: removed from index',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostDeletedConsumer: delete failed');
      channel.nack(msg, false, true);
    }
  }
}
