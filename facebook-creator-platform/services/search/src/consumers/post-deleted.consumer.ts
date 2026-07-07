import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
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
@Injectable()
export class PostDeletedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.deleted` event exactly once per `eventId`.
   *
   * @param msg - Deserialized `PostDeletedPayload` from the broker.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.deleted',
    queue: 'search.posts.deleted',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostDeleted(msg: PostDeletedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:search:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostDeletedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.algolia.deleteObject(msg.postId);

      this.logger.log(
        { postId: msg.postId, eventId: msg.eventId },
        'PostDeletedConsumer: removed from index',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostDeletedConsumer: delete failed');
      throw err;
    }
  }
}
