import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

/** Shape of the `posts.updated` event payload (mirrors `PostUpdatedEvent` in apps/api). */
export interface PostUpdatedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly title?: string;
  readonly content?: string;
  readonly scheduledAt?: string;
  readonly updatedAt: string;
}

/**
 * Idempotent consumer for `posts.updated` events.
 *
 * Performs a partial update on the existing Algolia record, touching only the
 * mutable fields (title, content, scheduledAt, updatedAt). The record is created
 * if it does not yet exist (Algolia `partialUpdateObject` with `createIfNotExists: true`
 * is the default behaviour in v5).
 */
@Injectable()
export class PostUpdatedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.updated` event exactly once per `eventId`.
   *
   * @param msg - Deserialized `PostUpdatedPayload` from the broker.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.updated',
    queue: 'search.posts.updated',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostUpdated(msg: PostUpdatedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:search:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostUpdatedConsumer: duplicate, skipping');
      return;
    }

    try {
      const fields: Record<string, unknown> = { updatedAt: msg.updatedAt };
      if (msg.title !== undefined) fields['title'] = msg.title;
      if (msg.content !== undefined) fields['content'] = msg.content;
      if (msg.scheduledAt !== undefined) fields['scheduledAt'] = msg.scheduledAt;

      await this.algolia.partialUpdateObject(msg.postId, fields);

      this.logger.log(
        { postId: msg.postId, eventId: msg.eventId },
        'PostUpdatedConsumer: index updated',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostUpdatedConsumer: update failed');
      throw err;
    }
  }
}
