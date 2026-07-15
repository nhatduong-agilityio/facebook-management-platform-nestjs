import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { Channel, Message } from 'amqplib';
import type { SubscriptionActivatedPayload, SubscriptionCancelledPayload } from '@fcp/billing-contracts';
import { IOREDIS_CLIENT } from '@fcp/constants';
import { IdempotentConsumer } from '../../../common/consumers/idempotent-consumer.base';

/**
 * Idempotent consumer for `billing.subscription_activated` and
 * `billing.subscription_cancelled` events on the `fcp.events` exchange.
 *
 * Acks exactly once per `eventId` (Redis `SET NX EX` dedup — §8). Downstream
 * notifications and emails for these events are handled by `services/notification`
 * (T4.2) and `services/email` (T4.3) independently. This consumer logs for
 * observability and handles any `apps/api`-local side effects (e.g. post-quota
 * cache invalidation if a Redis response cache is added post-T5.5).
 *
 * Bound to `api_queue` via `connectMicroservice(getRmqOptions(...))` in `main.ts`.
 */
@Controller()
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
   * @param data - Deserialized `SubscriptionActivatedPayload` from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('billing.subscription_activated')
  async onSubscriptionActivated(
    @Payload() data: SubscriptionActivatedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    await this.withDedup(data.eventId, channel, msg, async () => {
      this.logger.log(
        { workspaceId: data.workspaceId, planCode: data.planCode },
        'BillingSubscriptionConsumer: subscription activated',
      );
    });
  }

  /**
   * Handles `billing.subscription_cancelled` exactly once per `eventId`.
   *
   * @param data - Deserialized `SubscriptionCancelledPayload` from the broker.
   * @param ctx  - RMQ execution context used to ack or nack the message.
   */
  @EventPattern('billing.subscription_cancelled')
  async onSubscriptionCancelled(
    @Payload() data: SubscriptionCancelledPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;
    await this.withDedup(data.eventId, channel, msg, async () => {
      this.logger.log(
        { workspaceId: data.workspaceId, planCode: data.planCode },
        'BillingSubscriptionConsumer: subscription cancelled',
      );
    });
  }
}
