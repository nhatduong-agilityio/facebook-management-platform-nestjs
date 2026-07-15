import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
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
@Controller()
export class PostUpdatedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.updated` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostUpdatedPayload` from the broker.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.updated')
  async onPostUpdated(
    @Payload() data: PostUpdatedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:search:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostUpdatedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      const fields: Record<string, unknown> = { updatedAt: data.updatedAt };
      if (data.title !== undefined) fields['title'] = data.title;
      if (data.content !== undefined) fields['content'] = data.content;
      if (data.scheduledAt !== undefined) fields['scheduledAt'] = data.scheduledAt;

      await this.algolia.partialUpdateObject(data.postId, fields);

      this.logger.log(
        { postId: data.postId, eventId: data.eventId },
        'PostUpdatedConsumer: index updated',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostUpdatedConsumer: update failed');
      channel.nack(msg, false, true);
    }
  }
}
