import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
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
@Controller()
export class PostFailedConsumer {
  constructor(
    private readonly algolia: IAlgoliaSearchProvider,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles a `posts.failed` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostFailedPayload` from the broker.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('posts.failed')
  async onPostFailed(
    @Payload() data: PostFailedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:search:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'PostFailedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await this.algolia.partialUpdateObject(data.postId, {
        status: 'failed',
        failedAt: data.occurredAt,
      });

      this.logger.log(
        { postId: data.postId, eventId: data.eventId },
        'PostFailedConsumer: index updated to failed',
      );
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'PostFailedConsumer: update failed');
      channel.nack(msg, false, true);
    }
  }
}
