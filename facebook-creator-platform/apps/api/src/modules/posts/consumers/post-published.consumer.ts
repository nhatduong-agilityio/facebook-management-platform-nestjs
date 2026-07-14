import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import { IOREDIS_CLIENT } from '../../../infrastructure/rabbitmq/rabbitmq.module';
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
 * For T2.6 this is a placeholder that logs the event and proves the idempotent
 * infrastructure works. Business logic (Analytics metrics sync T3.3, Algolia
 * status update T4.1, Audit T3.4) will be added in their respective tasks.
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
