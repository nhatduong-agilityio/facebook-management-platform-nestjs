import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import type { PaymentFailedPayload } from '@fcp/billing-contracts';
import { NotificationOrchestrator } from '../notification-orchestrator';

/**
 * Idempotent consumer for `billing.payment_failed` events.
 *
 * Notifies all workspace members in-app and fires a Slack alert (billing urgency).
 * Published by `services/billing` when `invoice.payment_failed` transitions the
 * subscription from `active` to `grace_period` (ADR-054).
 */
@Injectable()
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
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  /**
   * Handles `billing.payment_failed`.
   *
   * @param msg - Deserialized `PaymentFailedPayload`.
   */
  @RabbitSubscribe({
    exchange: 'fcp.events',
    routingKey: 'billing.payment_failed',
    queue: 'notification.billing.payment_failed',
    queueOptions: { durable: true, deadLetterExchange: 'fcp.dlq' },
  })
  async onPaymentFailed(msg: PaymentFailedPayload): Promise<void | Nack> {
    const dedupKey = `dedup:notification:${msg.eventId}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      this.logger.log({ eventId: msg.eventId }, 'BillingPaymentFailedConsumer: duplicate, skipping');
      return;
    }

    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.orchestrator.notifyWorkspace(
          msg.workspaceId,
          'billing.payment_failed',
          'Payment failed',
          `A payment for your ${msg.planCode} subscription failed. Your account is in a grace period — please update your payment method.`,
          { planCode: msg.planCode },
          true,
        );
      });
      this.logger.log({ workspaceId: msg.workspaceId, eventId: msg.eventId }, 'BillingPaymentFailedConsumer: notified');
    } catch (err) {
      await this.redis.del(dedupKey);
      this.logger.error({ eventId: msg.eventId, err }, 'BillingPaymentFailedConsumer: failed');
      throw err;
    }
  }
}
