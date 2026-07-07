import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
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
@Injectable()
export class PostPublishedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.published` event exactly once per `eventId`.
   *
   * @param msg - Deserialized `PostPublishedPayload` from the broker.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.published',
    queue: 'search.posts.published',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostPublished(msg: PostPublishedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:search:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostPublishedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.algolia.partialUpdateObject(msg.postId, {
        status: 'published',
        facebookGraphPostId: msg.facebookGraphPostId,
        publishedAt: msg.occurredAt,
      });

      this.logger.log(
        { postId: msg.postId, eventId: msg.eventId },
        'PostPublishedConsumer: index updated to published',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostPublishedConsumer: update failed');
      throw err;
    }
  }
}
