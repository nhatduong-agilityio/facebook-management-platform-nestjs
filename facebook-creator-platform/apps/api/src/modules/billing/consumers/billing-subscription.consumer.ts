import { Inject, Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { SubscriptionActivatedPayload, SubscriptionCancelledPayload } from '@fcp/billing-contracts';
import { IOREDIS_CLIENT } from '../../../infrastructure/rabbitmq/rabbitmq.module';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';

/**
 * Idempotent consumer for `billing.subscription_activated` and
 * `billing.subscription_cancelled` events on the `fcp.events` exchange.
 *
 * For T3.2 these are placeholders that log the event and prove the idempotent
 * infrastructure works. Business logic (notification T4.2, email T4.3) will be
 * added in their respective tasks.
 *
 * Queues:
 * - `api.billing.subscription_activated`  (durable, DLX → `fcp.dlq`)
 * - `api.billing.subscription_cancelled`  (durable, DLX → `fcp.dlq`)
 */
@Injectable()
export class BillingSubscriptionConsumer extends IdempotentConsumer {
  constructor(
    @Inject(IOREDIS_CLIENT) redis: Redis,
    private readonly logger: Logger,
  ) {
    super(redis);
  }

  /**
   * Handles `billing.subscription_activated` exactly once per `eventId`.
   *
   * @param msg - Deserialized `SubscriptionActivatedPayload` from the broker.
   * @returns `undefined` on success/duplicate, or `Nack(false)` for a permanent failure.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'billing.subscription_activated',
    queue: 'api.billing.subscription_activated',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onSubscriptionActivated(msg: SubscriptionActivatedPayload): Promise<void | Nack> {
    return this.withDedup(msg.eventId, async () => {
      this.logger.log(
        { workspaceId: msg.workspaceId, planCode: msg.planCode },
        'BillingSubscriptionConsumer: subscription activated',
      );
    });
  }

  /**
   * Handles `billing.subscription_cancelled` exactly once per `eventId`.
   *
   * @param msg - Deserialized `SubscriptionCancelledPayload` from the broker.
   * @returns `undefined` on success/duplicate, or `Nack(false)` for a permanent failure.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'billing.subscription_cancelled',
    queue: 'api.billing.subscription_cancelled',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'fcp.dlq',
    },
  })
  async onSubscriptionCancelled(msg: SubscriptionCancelledPayload): Promise<void | Nack> {
    return this.withDedup(msg.eventId, async () => {
      this.logger.log(
        { workspaceId: msg.workspaceId, planCode: msg.planCode },
        'BillingSubscriptionConsumer: subscription cancelled',
      );
    });
  }
}
