import { Inject, Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '../../../infrastructure/rabbitmq/rabbitmq.module';
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
 * Queue: `api.posts.created` (durable, DLX → `fcp.dlq`)
 */
@Injectable()
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
   * @param msg - Deserialized `PostCreatedPayload` from the broker.
   * @returns `undefined` on success/duplicate, or `Nack(false)` for a permanent failure.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'posts.created',
    queue: 'api.posts.created',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onPostCreated(msg: PostCreatedPayload): Promise<void | Nack> {
    return this.withDedup(msg.eventId, async () => {
      this.logger.log(
        { postId: msg.postId, workspaceId: msg.workspaceId },
        'PostCreatedConsumer: received posts.created',
      );
    });
  }
}
