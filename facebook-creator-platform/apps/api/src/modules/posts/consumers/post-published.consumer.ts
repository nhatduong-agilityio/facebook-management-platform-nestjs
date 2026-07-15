import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';

/** Shape of the message payload published by `PostPublishedEvent`. */
export interface PostPublishedPayload {
  readonly eventId: string;
  readonly routingKey: string;
  readonly occurredAt: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly facebookGraphPostId: string;
}

/**
 * Idempotent consumer for `posts.published` events on the `fcp.events` exchange.
 *
 * Acks exactly once per `eventId` (Redis `SET NX EX` dedup — §8). Downstream
 * work for this event is distributed across specialist services: `services/analytics`
 * syncs Graph API metrics (T3.3), `services/search` updates the Algolia index (T4.1),
 * and `services/audit` records the event (T3.4). This consumer handles any
 * `apps/api`-local side effects and provides an observability log.
 *
 * Bound to `api_queue` via `connectMicroservice(getRmqOptions(...))` in `main.ts`.
 */
@Controller()
export class PostPublishedConsumer extends IdempotentConsumer {
  constructor(
    @Inject(IOREDIS_CLIENT) redis: Redis,
    private readonly logger: Logger,
  ) {
    super(redis);
  }

  /**
   * Handles a `posts.published` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostPublishedPayload` from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('posts.published')
  async onPostPublished(
    @Payload() data: PostPublishedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    await this.withDedup(data.eventId, channel, msg, async () => {
      this.logger.log(
        { postId: data.postId, workspaceId: data.workspaceId },
        'PostPublishedConsumer: received posts.published',
      );
    });
  }
}
