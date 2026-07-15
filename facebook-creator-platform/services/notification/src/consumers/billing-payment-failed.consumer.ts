import { Controller, Inject } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '@fcp/constants';
import type { Channel, Message } from 'amqplib';
import type { PaymentFailedPayload } from '@fcp/billing-contracts';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Idempotent consumer for `billing.payment_failed` events.
 *
 * Notifies all workspace members in-app and fires a Slack alert (billing urgency).
 * Published by `services/billing` when `invoice.payment_failed` transitions the
 * subscription from `active` to `grace_period` (ADR-054).
 */
@Controller()
export class BillingPaymentFailedConsumer {
  /**
   * @param orm          - MikroORM instance used to create a per-message request context.
   * @param orchestrator - Handles notification persistence and Slack dispatch.
   * @param redis        - Redis client for idempotent dedup.
   * @param logger       - Pino logger.
   */
  constructor(
    private readonly orm: MikroORM,
    private readonly orchestrator: NotificationOrchestrator,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `billing.payment_failed`.
   *
   * @param data - Deserialized `PaymentFailedPayload`.
   * @param ctx  - RMQ context providing the channel and raw message for ack/nack.
   */
  @EventPattern('billing.payment_failed')
  async onPaymentFailed(
    @Payload() data: PaymentFailedPayload,
    @Ctx() ctx: RmqContext,
  ): Promise<void> {
    const channel = ctx.getChannelRef() as Channel;
    const msg = ctx.getMessage() as Message;

    const dedupKey = `dedup:notification:${data.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: data.eventId }, 'BillingPaymentFailedConsumer: duplicate, skipping');
      channel.ack(msg);
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          data.workspaceId,
          'billing.payment_failed',
          'Payment failed',
          `A payment for your ${data.planCode} subscription failed. Your account is in a grace period — please update your payment method.`,
          { planCode: data.planCode },
          true,
        );
      });
      this.logger.log({ workspaceId: data.workspaceId, eventId: data.eventId }, 'BillingPaymentFailedConsumer: notified');
      channel.ack(msg);
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: data.eventId, err }, 'BillingPaymentFailedConsumer: failed');
      channel.nack(msg, false, true);
    }
  }
}
