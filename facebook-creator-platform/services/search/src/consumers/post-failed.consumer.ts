import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

/** Shape of the `posts.failed` event payload (mirrors `PostFailedEvent` in apps/api). */
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
 * Partially updates the Algolia record to reflect `status: 'failed'` and
 * records `failedAt` so that dashboards and search UIs can surface failed posts.
 * Keeping Algolia consistent with the actual post state (per DoD in T4.1).
 */
@Injectable()
export class PostFailedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.failed` event exactly once per `eventId`.
   *
   * @param msg - Deserialized `PostFailedPayload` from the broker.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.failed',
    queue: 'search.posts.failed',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostFailed(msg: PostFailedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:search:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostFailedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.algolia.partialUpdateObject(msg.postId, {
        status: 'failed',
        failedAt: msg.occurredAt,
      });

      this.logger.log(
        { postId: msg.postId, eventId: msg.eventId },
        'PostFailedConsumer: index updated to failed',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostFailedConsumer: update failed');
      throw err;
    }
  }
}
