import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';

/** Shape of the message payload published by `PostCreatedEvent`. */
export interface PostCreatedPayload {
  readonly eventId: string;
  readonly routingKey: string;
  readonly occurredAt: string;
  readonly postId: string;
  readonly workspaceId: string;
  readonly createdByUserId: string;
}

/**
 * Idempotent consumer for `posts.created` events on the `fcp.events` exchange.
 *
 * For T2.6 this is a placeholder that logs the event and proves the idempotent
 * infrastructure works. Business logic (Algolia indexing T4.1, Audit T3.4)
 * will be added in their respective tasks.
 *
 * Bound to `api_queue` via `connectMicroservice(getRmqOptions(...))` in `main.ts`.
 */
@Controller()
export class PostCreatedConsumer extends IdempotentConsumer {
  constructor(
    @Inject(IOREDIS_CLIENT) redis: Redis,
    private readonly logger: Logger,
  ) {
    super(redis);
  }

  /**
   * Handles a `posts.created` event exactly once per `eventId`.
   *
   * @param data - Deserialized `PostCreatedPayload` from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('posts.created')
  async onPostCreated(
    @Payload() data: PostCreatedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    await this.withDedup(data.eventId, channel, msg, async () => {
      this.logger.log(
        { postId: data.postId, workspaceId: data.workspaceId },
        'PostCreatedConsumer: received posts.created',
      );
    });
  }
}
