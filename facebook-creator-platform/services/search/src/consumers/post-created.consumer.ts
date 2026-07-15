import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
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
@Controller()
export class PostCreatedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.created` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostCreatedPayload` from the broker.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.created')
  async onPostCreated(
    @Payload() data: PostCreatedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:search:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostCreatedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await this.algolia.saveObject(data.postId, {
        workspaceId: data.workspaceId,
        title: data.title,
        content: data.content,
        status: data.status,
        scheduledAt: data.scheduledAt,
        createdAt: data.createdAt,
      });

      this.logger.log(
        { postId: data.postId, eventId: data.eventId },
        'PostCreatedConsumer: indexed',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostCreatedConsumer: indexing failed');
      channel.nack(msg, false, true);
    }
  }
}
