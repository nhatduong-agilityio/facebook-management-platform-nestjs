import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IAlgoliaSearchProvider } from '../ports/algolia-search.provider.port';

/** Shape of the `posts.created` event payload (mirrors `PostCreatedEvent` in apps/api). */
export interface PostCreatedPayload {
  readonly eventId: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly createdByUserId: string;
  readonly title?: string;
  readonly content: string;
  readonly status: string;
  readonly scheduledAt?: string;
  readonly createdAt: string;
}

/**
 * Idempotent consumer for `posts.created` events.
 *
 * Creates a new Algolia record with all indexable fields from the event payload
 * (ADR-051 — no HTTP back-channel to `apps/api`).
 * Deduplication via Redis `SET NX EX` on `dedup:search:<eventId>` (§11).
 */
@Injectable()
export class PostCreatedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.created` event exactly once per `eventId`.
   *
   * @param msg - Deserialized `PostCreatedPayload` from the broker.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.created',
    queue: 'search.posts.created',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPostCreated(msg: PostCreatedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:search:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'PostCreatedConsumer: duplicate, skipping');
      return;
    }

    try {
      await this.algolia.saveObject(msg.postId, {
        workspaceId: msg.workspaceId,
        title: msg.title,
        content: msg.content,
        status: msg.status,
        scheduledAt: msg.scheduledAt,
        createdAt: msg.createdAt,
      });

      this.logger.log(
        { postId: msg.postId, eventId: msg.eventId },
        'PostCreatedConsumer: indexed',
      );
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'PostCreatedConsumer: indexing failed');
      throw err;
    }
  }
}
