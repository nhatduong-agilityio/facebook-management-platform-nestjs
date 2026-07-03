import { Inject, Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
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
 * Queue: `api.posts.published` (durable, DLX → `fcp.dlq`)
 */
@Injectable()
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
   * @param msg - Deserialized `PostPublishedPayload` from the broker.
   * @returns `undefined` on success/duplicate, or `Nack(false)` for a permanent failure.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.published',
    queue: 'api.posts.published',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onPostPublished(msg: PostPublishedPayload): Promise<void | Nack> {
    return this.withDedup(msg.eventId, async () => {
      this.logger.log(
        { postId: msg.postId, workspaceId: msg.workspaceId },
        'PostPublishedConsumer: received posts.published',
      );
    });
  }
}
